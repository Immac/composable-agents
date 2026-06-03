/**
 * run-iterative.ts — Story writer with critic feedback loop
 *
 * Pipeline: conceptor → writer → critic → [revision-writer → critic] × N → done
 *
 * This runner implements the loop directly with a shared cabinet,
 * since the Controller creates fresh scopes per run.
 *
 * Usage: npx tsx examples/story-writer/run-iterative.ts "Your prompt here"
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PiProvider, CabinetImpl, BlackboardImpl, Scope } from '../../packages/core/src/index.ts';
import { createStoryConceptor } from './agents/story-conceptor/index';
import { createStoryWriter } from './agents/story-writer/index';
import { createStoryRevisionWriter } from './agents/story-revision-writer/index';
import { createStoryCritic } from './agents/story-critic/index';

const OUTPUT_DIR = resolve('examples/story-writer/stories');
const MAX_REVISIONS = 3;

async function main() {
  const prompt = process.argv[2] || 'Write a 150-word fantasy story about a dragon who collects clouds.';
  console.log(`Prompt: "${prompt}"\n`);
  console.log(`Max revisions: ${MAX_REVISIONS}\n`);

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  const provider = new PiProvider({ modelId: 'opencode-go/mimo-v2.5' });

  // Create shared cabinet and scope
  const cabinet = new CabinetImpl();
  const blackboard = new BlackboardImpl(
    { name: 'StoryWriter', constraints: [], values: [] },
    prompt,
  );
  const scope = new Scope('root', blackboard, cabinet);

  // Create agents
  const conceptor = createStoryConceptor(provider);
  const writer = createStoryWriter(provider);
  const revisionWriter = createStoryRevisionWriter(provider);
  const critic = createStoryCritic(provider);

  // Track outputs
  const drafts: string[] = [];
  const critiques: string[] = [];

  async function runAgent(agent: { execute: (scope: any, signal?: any) => Promise<any> }, name: string) {
    process.stderr.write(`  Running ${name}... `);
    const start = Date.now();
    const result = await agent.execute(scope);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`${result.status} (${elapsed}s)${result.output ? ' — ' + result.output : ''}`);
    return result;
  }

  // ── Cycle 1: Concept → First Draft → Critique ──

  console.log('═══ Cycle 1: First draft ═══');

  const r1 = await runAgent(conceptor, 'conceptor');
  if (r1.status !== 'success') {
    console.log(`\nConceptor failed: ${r1.error}`);
    provider.dispose();
    return;
  }

  await runAgent(writer, 'writer');

  const firstDraft = cabinet.get('story/draft') as string;
  if (!firstDraft) {
    console.log('\nWriter produced no draft.');
    provider.dispose();
    return;
  }
  drafts.push(firstDraft);
  console.log(`  📝 Draft 1: ${firstDraft.split(/\s+/).length} words\n`);

  await runAgent(critic, 'critic');

  const verdict1 = cabinet.get('story/verdict') as { status: string; issues: string[] } | undefined;
  const critique1 = cabinet.get('story/critique') as string;
  critiques.push(critique1);

  if (verdict1?.status === 'approved') {
    console.log('\n✅ Story approved on first draft!');
  } else {
    console.log(`  Issues: ${verdict1?.issues?.join('; ') || 'none'}`);
  }

  // ── Revision cycles ──

  for (let cycle = 2; cycle <= MAX_REVISIONS + 1; cycle++) {
    if (verdict1?.status === 'approved' && cycle === 2) break;

    // Check the CURRENT verdict (from the last critic run)
    const currentVerdict = cabinet.get('story/verdict') as { status: string; issues: string[] } | undefined;
    if (currentVerdict?.status === 'approved') break;

    const revisionCount = (cabinet.get('story/revision-count') as number) || 0;
    if (revisionCount >= MAX_REVISIONS) {
      console.log(`\n⚠  Max revisions (${MAX_REVISIONS}) reached. Accepting current draft.`);
      break;
    }

    console.log(`\n═══ Cycle ${cycle}: Revision ═══`);

    await runAgent(revisionWriter, 'revision-writer');

    const revisedDraft = cabinet.get('story/draft') as string;
    drafts.push(revisedDraft);
    console.log(`  📝 Draft ${drafts.length}: ${revisedDraft.split(/\s+/).length} words\n`);

    await runAgent(critic, 'critic');

    const verdict = cabinet.get('story/verdict') as { status: string; issues: string[] } | undefined;
    const critique = cabinet.get('story/critique') as string;
    critiques.push(critique);

    if (verdict?.status === 'approved') {
      console.log(`\n✅ Story approved after ${revisionCount + 1} revision(s)!`);
    } else {
      console.log(`  Issues: ${verdict?.issues?.join('; ') || 'none'}`);
    }
  }

  // ── Save outputs ──

  console.log('\n─── Saving ───');

  const slug = prompt.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  const concept = cabinet.get('story/concept');
  const finalDraft = cabinet.get('story/draft') as string;
  const finalCritique = cabinet.get('story/critique') as string;

  if (concept) {
    const p = resolve(OUTPUT_DIR, slug + '-concept.json');
    writeFileSync(p, JSON.stringify(concept, null, 2));
    console.log(`📄 Concept: ${p}`);
  }
  if (finalDraft) {
    const p = resolve(OUTPUT_DIR, slug + '-draft.md');
    writeFileSync(p, finalDraft);
    console.log(`📄 Draft:   ${p}`);
  }
  if (finalCritique) {
    const p = resolve(OUTPUT_DIR, slug + '-critique.md');
    writeFileSync(p, finalCritique);
    console.log(`📄 Critique: ${p}`);
  }

  // Save revision history
  if (drafts.length > 1) {
    const history = drafts.map((d, i) => `## Draft ${i + 1}\n\n${d}`).join('\n\n---\n\n');
    const p = resolve(OUTPUT_DIR, slug + '-history.md');
    writeFileSync(p, history);
    console.log(`📄 History:  ${p}`);
  }

  console.log(`\nTotal: ${drafts.length} draft(s), ${critiques.length} critique(s)`);

  provider.dispose();
}

main().catch(console.error);
