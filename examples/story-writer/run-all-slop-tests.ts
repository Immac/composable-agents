/**
 * run-all-slop-tests.ts — Run 4 prompts through the no-slop pipeline sequentially
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PiProvider, CabinetImpl, BlackboardImpl, Scope } from '../../packages/core/src/index.ts';
import { createStoryConceptor } from './agents/story-conceptor/index';
import { createStoryWriter } from './agents/story-writer/index';
import { createStoryRevisionWriter } from './agents/story-revision-writer/index';
import { createNoAiSlopCritic } from './agents/no-ai-slop-critic/index';

const OUTPUT_DIR = resolve('examples/story-writer/stories');
const MAX_REVISIONS = 3;

const PROMPTS = [
  'Write an inspiring speech about climate change',
  'A 500-word flash fiction about a lighthouse keeper who talks to the sea',
  "Write a children's bedtime story about a moon that falls asleep",
  'A noir detective story set in 1940s Tokyo',
];

async function runOne(prompt: string, index: number) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  TEST ${index + 1}/${PROMPTS.length}`);
  console.log(`  "${prompt}"`);
  console.log(`${'═'.repeat(60)}\n`);

  const provider = new PiProvider({ modelId: 'opencode-go/mimo-v2.5' });
  const cabinet = new CabinetImpl();
  const blackboard = new BlackboardImpl({ name: 'StoryWriter', constraints: [], values: [] }, prompt);
  const scope = new Scope('root', blackboard, cabinet);

  const conceptor = createStoryConceptor(provider);
  const writer = createStoryWriter(provider);
  const revisionWriter = createStoryRevisionWriter(provider);
  const slopCritic = createNoAiSlopCritic(provider);

  const drafts: string[] = [];
  const scores: number[] = [];

  async function run(agent: any, name: string) {
    process.stderr.write(`  ${name}... `);
    const t = Date.now();
    const r = await agent.execute(scope);
    const s = ((Date.now() - t) / 1000).toFixed(1);
    console.log(`${r.status} (${s}s)${r.output ? ' — ' + r.output : ''}`);
    return r;
  }

  // Cycle 1
  console.log('── Cycle 1: First draft ──');
  const c1 = await run(conceptor, 'conceptor');
  if (c1.status !== 'success') { console.log('Conceptor failed'); provider.dispose(); return null; }

  await run(writer, 'writer');
  const d1 = cabinet.get('story/draft') as string;
  if (!d1) { console.log('Writer produced nothing'); provider.dispose(); return null; }
  drafts.push(d1);
  console.log(`  📝 ${d1.split(/\s+/).length} words`);

  await run(slopCritic, 'slop-critic');
  const r1 = cabinet.get('story/slop-report') as any;
  scores.push(r1?.score ?? 0);
  console.log(`  📊 Score: ${r1?.score ?? '?'}\n`);

  // Revision cycles
  for (let cycle = 2; cycle <= MAX_REVISIONS + 1; cycle++) {
    const last = scores[scores.length - 1];
    if (last >= 85) { console.log(`✅ Approved at ${last}/100`); break; }
    if (scores.length > MAX_REVISIONS) { console.log(`⚠ Max revisions reached`); break; }

    console.log(`── Cycle ${cycle}: Revision ──`);
    await run(revisionWriter, 'revision-writer');

    const d = cabinet.get('story/draft') as string;
    if (d) { drafts.push(d); console.log(`  📝 ${d.split(/\\s+/).length} words`); }

    await run(slopCritic, 'slop-critic');
    const r = cabinet.get('story/slop-report') as any;
    scores.push(r?.score ?? 0);
    console.log(`  📊 Score: ${r?.score ?? '?'}\n`);
  }

  // Save
  const slug = prompt.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  const concept = cabinet.get('story/concept');
  const finalDraft = cabinet.get('story/draft') as string;
  const report = cabinet.get('story/slop-report') as any;

  if (concept) writeFileSync(resolve(OUTPUT_DIR, slug + '-concept.json'), JSON.stringify(concept, null, 2));
  if (finalDraft) writeFileSync(resolve(OUTPUT_DIR, slug + '-draft.md'), finalDraft);
  if (report) writeFileSync(resolve(OUTPUT_DIR, slug + '-slop-report.json'), JSON.stringify(report, null, 2));

  if (drafts.length > 1) {
    const history = drafts.map((d, i) => `## Draft ${i + 1} (Score: ${scores[i] ?? '?'}\)\n\n${d}`).join('\n\n---\n\n');
    writeFileSync(resolve(OUTPUT_DIR, slug + '-history.md'), history);
  }

  provider.dispose();
  return { prompt, scores, wordCount: finalDraft?.split(/\s+/).length ?? 0, finalScore: scores[scores.length - 1] };
}

async function main() {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  const results: any[] = [];

  for (let i = 0; i < PROMPTS.length; i++) {
    const r = await runOne(PROMPTS[i], i);
    if (r) results.push(r);
  }

  // Summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  SUMMARY');
  console.log(`${'═'.repeat(60)}\n`);
  console.log('Prompt'.padEnd(55) + 'Words  Score');
  console.log('-'.repeat(75));
  for (const r of results) {
    const prompt = r.prompt.length > 50 ? r.prompt.slice(0, 47) + '...' : r.prompt;
    const scoreStr = r.scores.length > 1 ? `${r.scores[0]}→${r.finalScore}` : `${r.finalScore}`;
    console.log(`${prompt.padEnd(55)}${String(r.wordCount).padStart(5)}  ${scoreStr}`);
  }
}

main().catch(console.error);
