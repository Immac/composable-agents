/**
 * run-all-slop-bg.ts — Background runner for all 4 slop tests
 * Writes progress to /tmp/slop-progress.json for monitoring
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PiProvider, CabinetImpl, BlackboardImpl, Scope } from '../../packages/core/src/index.ts';
import { createStoryConceptor } from './agents/story-conceptor/index';
import { createStoryWriter } from './agents/story-writer/index';
import { createStoryRevisionWriter } from './agents/story-revision-writer/index';
import { createNoAiSlopCritic } from './agents/no-ai-slop-critic/index';

const OUTPUT_DIR = resolve('examples/story-writer/stories');
const PROGRESS = '/tmp/slop-progress.json';
const MAX_REVISIONS = 3;

const PROMPTS = [
  'Write an inspiring speech about climate change',
  'A 500-word flash fiction about a lighthouse keeper who talks to the sea',
  "Write a children's bedtime story about a moon that falls asleep",
  'A noir detective story set in 1940s Tokyo',
];

function writeProgress(data: any) {
  writeFileSync(PROGRESS, JSON.stringify(data, null, 2));
}

async function runOne(prompt: string, index: number) {
  writeProgress({ test: index + 1, total: PROMPTS.length, prompt, phase: 'conceptor', scores: [] });

  const provider = new PiProvider({ modelId: 'opencode-go/mimo-v2.5' });
  const cabinet = new CabinetImpl();
  const bb = new BlackboardImpl({ name: 'StoryWriter', constraints: [], values: [] }, prompt);
  const scope = new Scope('root', bb, cabinet);

  const agents = {
    conceptor: createStoryConceptor(provider),
    writer: createStoryWriter(provider),
    revisionWriter: createStoryRevisionWriter(provider),
    slopCritic: createNoAiSlopCritic(provider),
  };

  const scores: number[] = [];

  async function run(agent: any, name: string) {
    writeProgress({ test: index + 1, total: PROMPTS.length, prompt, phase: name, scores });
    const r = await agent.execute(scope);
    return r;
  }

  // Cycle 1
  await run(agents.conceptor, 'conceptor');
  await run(agents.writer, 'writer');
  const d1 = cabinet.get('story/draft') as string;
  await run(agents.slopCritic, 'slop-critic');
  const r1 = cabinet.get('story/slop-report') as any;
  scores.push(r1?.score ?? 0);

  // Revisions
  for (let cycle = 2; cycle <= MAX_REVISIONS + 1; cycle++) {
    if (scores[scores.length - 1] >= 85) break;
    if (scores.length > MAX_REVISIONS) break;
    await run(agents.revisionWriter, 'revision-writer');
    await run(agents.slopCritic, 'slop-critic');
    const r = cabinet.get('story/slop-report') as any;
    scores.push(r?.score ?? 0);
  }

  // Save
  const slug = prompt.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  const concept = cabinet.get('story/concept');
  const finalDraft = cabinet.get('story/draft') as string;
  const report = cabinet.get('story/slop-report') as any;

  if (concept) writeFileSync(resolve(OUTPUT_DIR, slug + '-concept.json'), JSON.stringify(concept, null, 2));
  if (finalDraft) writeFileSync(resolve(OUTPUT_DIR, slug + '-draft.md'), finalDraft);
  if (report) writeFileSync(resolve(OUTPUT_DIR, slug + '-slop-report.json'), JSON.stringify(report, null, 2));

  provider.dispose();
  return { prompt, scores, wordCount: finalDraft?.split(/\s+/).length ?? 0, finalScore: scores[scores.length - 1] };
}

async function main() {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  writeProgress({ test: 0, total: PROMPTS.length, prompt: 'starting...', phase: 'init', scores: [] });

  const results: any[] = [];
  for (let i = 0; i < PROMPTS.length; i++) {
    const r = await runOne(PROMPTS[i], i);
    if (r) results.push(r);
  }

  writeProgress({ done: true, results });
}

main().catch(err => writeProgress({ error: err.message }));
