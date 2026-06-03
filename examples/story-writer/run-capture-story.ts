/**
 * Run a test case and save the actual story output.
 * Usage: npx tsx examples/story-writer/run-capture-story.ts "prompt"
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Controller, ConditionEngine, PiProvider } from '../../packages/core/src/index.ts';
import { builtinEvaluators } from '../../packages/core/src/conditions/built-in';
import { createStoryConceptor } from './agents/story-conceptor/index';
import { createStoryWriter } from './agents/story-writer/index';
import { createStoryCritic } from './agents/story-critic/index';

const OUTPUT_DIR = resolve('examples/story-writer/stories');

async function main() {
  const prompt = process.argv[2] || 'Write a 150-word fantasy story about a dragon who collects clouds.';
  console.log(`Prompt: "${prompt}"\n`);

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  const provider = new PiProvider({ modelId: 'opencode-go/mimo-v2.5' });
  const controller = new Controller();
  const ce = new ConditionEngine();
  ce.registerAll(builtinEvaluators);

  const conceptor = createStoryConceptor(provider);
  const writer = createStoryWriter(provider);
  const critic = createStoryCritic(provider);

  const agents = new Map([
    ['story-conceptor', { id: 'story-conceptor', manifest: conceptor.manifest, execute: conceptor.execute }],
    ['story-writer', { id: 'story-writer', manifest: writer.manifest, execute: writer.execute }],
    ['story-critic', { id: 'story-critic', manifest: critic.manifest, execute: critic.execute }],
  ]);

  // Wrap each agent to capture cabinet state
  let conceptJson: any = null;
  let draftText = '';
  let finalText = '';
  let critiqueText = '';

  const wrappedConceptor = {
    ...conceptor,
    execute: async (scope: any, signal: any) => {
      const result = await conceptor.execute(scope, signal);
      conceptJson = scope.cabinet.get('story/concept');
      return result;
    },
  };
  const wrappedWriter = {
    ...writer,
    execute: async (scope: any, signal: any) => {
      const result = await writer.execute(scope, signal);
      draftText = scope.cabinet.get('story/draft') || '';
      return result;
    },
  };
  const wrappedCritic = {
    ...critic,
    execute: async (scope: any, signal: any) => {
      const result = await critic.execute(scope, signal);
      finalText = scope.cabinet.get('story/final') || '';
      critiqueText = scope.cabinet.get('story/critique') || '';
      return result;
    },
  };

  const wrappedAgents = new Map([
    ['story-conceptor', { id: 'story-conceptor', manifest: wrappedConceptor.manifest, execute: wrappedConceptor.execute }],
    ['story-writer', { id: 'story-writer', manifest: wrappedWriter.manifest, execute: wrappedWriter.execute }],
    ['story-critic', { id: 'story-critic', manifest: wrappedCritic.manifest, execute: wrappedCritic.execute }],
  ]);

  const result = await controller.run(prompt, {
    pipeline: [{ agent: 'story-conceptor' }, { agent: 'story-writer' }, { agent: 'story-critic' }],
    agents: wrappedAgents,
    conditionEngine: ce,
    reflexes: [],
    config: { identity: { name: 'StoryWriter', constraints: [], values: [] } },
  });

  console.log(`Pipeline: ${result.status}\n`);

  // Save outputs
  const slug = prompt.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');

  if (conceptJson) {
    const conceptPath = resolve(OUTPUT_DIR, slug + '-concept.json');
    writeFileSync(conceptPath, JSON.stringify(conceptJson, null, 2));
    console.log(`📄 Concept: ${conceptPath}`);
  }

  if (draftText) {
    const draftPath = resolve(OUTPUT_DIR, slug + '-draft.md');
    writeFileSync(draftPath, draftText);
    console.log(`📄 Draft: ${draftPath}`);
  }

  if (finalText) {
    const finalPath = resolve(OUTPUT_DIR, slug + '-final.md');
    writeFileSync(finalPath, finalText);
    console.log(`📄 Final: ${finalPath}`);
  }

  if (critiqueText) {
    const critiquePath = resolve(OUTPUT_DIR, slug + '-critique.md');
    writeFileSync(critiquePath, critiqueText);
    console.log(`📄 Critique: ${critiquePath}`);
  }

  // Print a preview
  if (finalText) {
    console.log(`\n--- Story Preview (first 500 chars) ---\n`);
    console.log(finalText.slice(0, 500));
    if (finalText.length > 500) console.log('\n...');
  }

  provider.dispose();
}

main().catch(console.error);
