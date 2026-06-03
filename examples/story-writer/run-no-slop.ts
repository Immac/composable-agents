/**
 * run-no-slop.ts — Story writer with anti-AI-slop critic
 *
 * Pipeline: conceptor → writer → no-ai-slop-critic → [revision-writer → no-ai-slop-critic] × N
 *
 * Uses the no-ai-slop rules from:
 * https://github.com/realrossmanngroup/no_ai_slop_writing_rules
 *
 * Usage: npx tsx examples/story-writer/run-no-slop.ts "Your prompt here"
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

async function main() {
  const prompt = process.argv[2] || 'Write a short story about a robot who discovers gardening.';
  console.log(`Prompt: "${prompt}"\n`);
  console.log(`Max revisions: ${MAX_REVISIONS}`);
  console.log(`Critic: no-ai-slop (anti-AI-pattern detection)\n`);

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  const provider = new PiProvider({ modelId: 'opencode-go/mimo-v2.5' });

  // Shared cabinet and scope
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
  const slopCritic = createNoAiSlopCritic(provider);

  const drafts: string[] = [];
  const reports: any[] = [];

  async function runAgent(agent: { execute: (scope: any, signal?: any) => Promise<any> }, name: string) {
    process.stderr.write(`  Running ${name}... `);
    const start = Date.now();
    const result = await agent.execute(scope);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`${result.status} (${elapsed}s)${result.output ? ' — ' + result.output : ''}`);
    return result;
  }

  // ── Cycle 1 ──

  console.log('═══ Cycle 1: First draft ═══');

  await runAgent(conceptor, 'conceptor');
  await runAgent(writer, 'writer');

  const firstDraft = cabinet.get('story/draft') as string;
  if (!firstDraft) {
    console.log('\nWriter produced no draft.');
    provider.dispose();
    return;
  }
  drafts.push(firstDraft);
  console.log(`  📝 Draft 1: ${firstDraft.split(/\s+/).length} words\n`);

  await runAgent(slopCritic, 'no-ai-slop-critic');

  let report = cabinet.get('story/slop-report') as any;
  reports.push(report);
  console.log(`  📊 Score: ${report?.score ?? '?'}/100\n`);

  // ── Revision cycles ──

  for (let cycle = 2; cycle <= MAX_REVISIONS + 1; cycle++) {
    const lastReport = reports[reports.length - 1];
    if (lastReport?.verdict === 'approved') {
      console.log(`\n✅ Approved with score ${lastReport.score}/100!`);
      break;
    }

    if (reports.length - 1 >= MAX_REVISIONS) {
      console.log(`\n⚠  Max revisions (${MAX_REVISIONS}) reached.`);
      break;
    }

    console.log(`\n═══ Cycle ${cycle}: Revision ═══`);

    await runAgent(revisionWriter, 'revision-writer');

    const revisedDraft = cabinet.get('story/draft') as string;
    if (!revisedDraft) {
      console.log('  Revision produced no output.');
      break;
    }
    drafts.push(revisedDraft);
    console.log(`  📝 Draft ${drafts.length}: ${revisedDraft.split(/\s+/).length} words\n`);

    await runAgent(slopCritic, 'no-ai-slop-critic');

    report = cabinet.get('story/slop-report') as any;
    reports.push(report);
    console.log(`  📊 Score: ${report?.score ?? '?'}/100`);
  }

  // Final verdict
  const finalReport = reports[reports.length - 1];
  if (finalReport?.verdict === 'approved') {
    console.log(`\n✅ Final score: ${finalReport.score}/100`);
  } else {
    console.log(`\n📝 Final score: ${finalReport?.score ?? '?'}/100 (not approved, but saved)`);
  }

  // ── Save outputs ──

  console.log('\n─── Saving ───');

  const slug = prompt.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  const concept = cabinet.get('story/concept');
  const finalDraft = cabinet.get('story/draft') as string;

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

  // Save slop report
  if (finalReport) {
    const p = resolve(OUTPUT_DIR, slug + '-slop-report.json');
    writeFileSync(p, JSON.stringify(finalReport, null, 2));
    console.log(`📄 Report:  ${p}`);
  }

  // Save revision history with scores
  if (drafts.length > 1 || reports.length > 1) {
    let history = '';
    for (let i = 0; i < Math.max(drafts.length, reports.length); i++) {
      history += `## Draft ${i + 1}`;
      if (reports[i]) history += ` (Score: ${reports[i].score}/100)`;
      history += '\n\n';
      if (drafts[i]) history += drafts[i] + '\n\n';
      if (reports[i]?.summary) history += `**Slop summary:** ${reports[i].summary}\n\n`;
      history += '---\n\n';
    }
    const p = resolve(OUTPUT_DIR, slug + '-history.md');
    writeFileSync(p, history);
    console.log(`📄 History: ${p}`);
  }

  console.log(`\nTotal: ${drafts.length} draft(s), ${reports.length} report(s)`);

  provider.dispose();
}

main().catch(console.error);
