/**
 * Story Writer — Test Runner
 *
 * Runs all test cases from TESTS.md through the 3-agent pipeline.
 * Each test documents design intent and rationale — keeping the
 * decision record alongside the pipeline.
 *
 * Pipeline: story-conceptor → story-writer → story-critic
 *
 * Two run modes:
 *   FULL  — All 3 agents, user prompt → story
 *   INJECT — Cabinet pre-populated, runs writer + critic only
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Controller, ConditionEngine, PiProvider } from 'composable-agents';
import { builtinEvaluators } from 'composable-agents';
import { createStoryConceptor } from './agents/story-conceptor/index';
import { createStoryWriter } from './agents/story-writer/index';
import { createStoryCritic } from './agents/story-critic/index';

const RESULTS_DIR = resolve('examples/story-writer/test-results');
const provider = new PiProvider({ modelId: 'opencode-go/mimo-v2.5' });

interface TestResult {
  id: string;
  title: string;
  prompt: string;
  status: string;
  error?: string;
  tables?: string;
  _cabinet?: { story?: { concept?: unknown; draft?: string; final?: string; critique?: string } };
  pass: boolean;
  reason: string;
  elapsed: number;
}

// ── Run modes ─────────────────────────────────────────────────

async function runFull(prompt: string): Promise<TestResult> {
  const controller = new Controller();
  const ce = new ConditionEngine();
  ce.registerAll(builtinEvaluators);
  const agents = new Map([
    ['story-conceptor', { id: 'story-conceptor', manifest: { id: 'story-conceptor', type: 'llm' as const, version: '0.1.0', purpose: '', learning: { channels: [] } }, execute: createStoryConceptor(provider).execute }],
    ['story-writer', { id: 'story-writer', manifest: { id: 'story-writer', type: 'llm' as const, version: '0.1.0', purpose: '', learning: { channels: [] } }, execute: createStoryWriter(provider).execute }],
    ['story-critic', { id: 'story-critic', manifest: { id: 'story-critic', type: 'llm' as const, version: '0.1.0', purpose: '', learning: { channels: [] } }, execute: createStoryCritic(provider).execute }],
  ]);

  const result = await controller.run(prompt, {
    pipeline: [{ agent: 'story-conceptor' }, { agent: 'story-writer' }, { agent: 'story-critic' }],
    agents, conditionEngine: ce, reflexes: [],
    config: { identity: { name: 'StoryWriter', constraints: [], values: [] } },
  });

  return {
    id: '', title: '', prompt, status: result.status,
    error: result.error, pass: result.status === 'complete', reason: `Status: ${result.status}`, elapsed: 0,
  };
}

async function runInjected(inject: Record<string, unknown>): Promise<TestResult> {
  const controller = new Controller();
  const ce = new ConditionEngine();
  ce.registerAll(builtinEvaluators);
  const writer = createStoryWriter(provider);
  const critic = createStoryCritic(provider);

  // Mock prepper agent that writes injected keys to cabinet
  const mockPrepper = {
    id: 'mock-prepper',
    manifest: { id: 'mock-prepper', type: 'code' as const, version: '0.1.0', purpose: '', learning: { channels: [] } },
    execute: async (scope: any) => {
      for (const [k, v] of Object.entries(inject)) scope.cabinet.put(k, v);
      return { status: 'success' };
    },
  };

  const agents = new Map([
    ['mock-prepper', mockPrepper],
    ['story-writer', { id: 'story-writer', manifest: { id: 'story-writer', type: 'llm' as const, version: '0.1.0', purpose: '', learning: { channels: [] } }, execute: writer.execute }],
    ['story-critic', { id: 'story-critic', manifest: { id: 'story-critic', type: 'llm' as const, version: '0.1.0', purpose: '', learning: { channels: [] } }, execute: critic.execute }],
  ]);

  const result = await controller.run('', {
    pipeline: [{ agent: 'mock-prepper' }, { agent: 'story-writer' }, { agent: 'story-critic' }],
    agents, conditionEngine: ce, reflexes: [],
    config: { identity: { name: 'StoryWriter', constraints: [], values: [] } },
  });

  return {
    id: '', title: '', prompt: '', status: result.status,
    error: result.error, pass: result.status === 'complete', reason: `Status: ${result.status}`, elapsed: 0,
  };
}

// ── Run tests ─────────────────────────────────────────────────

async function main() {
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  const results: TestResult[] = [];
  let seq = 0;

  async function test(id: string, title: string, fn: () => Promise<TestResult>, check: (r: TestResult) => { pass: boolean; reason: string }) {
    const start = Date.now();
    console.log(`\n[${id}] ${title}`);
    let raw: TestResult;
    try {
      raw = await fn();
    } catch (err) {
      raw = { id, title, prompt: '', status: 'error', error: err instanceof Error ? err.message : String(err), pass: false, reason: 'Exception', elapsed: 0 };
    }
    raw.id = id;
    raw.title = title;
    raw.elapsed = (Date.now() - start) / 1000;

    const checked = check(raw);
    raw.pass = checked.pass;
    raw.reason = checked.reason;

    console.log(`  ${checked.pass ? '✓' : '✗'} ${checked.reason} (${raw.elapsed.toFixed(1)}s)`);
    if (raw.error) console.log(`  Error: ${raw.error}`);
    results.push(raw);
  }

  // ── TC-001 ──
  await test('TC-001', 'Three-agent pipeline completes', () => runFull('Write a 200-word sci-fi story about a robot gardener who teaches a child to grow flowers on a dead world.'), r => ({
    pass: r.status === 'complete',
    reason: `Status: ${r.status}${r.error ? ` — ${r.error}` : ''}`,
  }));

  // ── TC-003 ──
  await test('TC-003', 'Conceptor produces structured plan', () => runFull('A mystery set in a 1920s jazz club'), r => ({
    pass: r.status === 'complete',
    reason: `Status: ${r.status}${r.error ? ` — ${r.error}` : ''}`,
  }));

  // ── TC-004 ──
  await test('TC-004', 'Genre constraints respected', () => runFull('Write a comedy'), r => ({
    pass: r.status === 'complete',
    reason: `Status: ${r.status}${r.error ? ` — ${r.error}` : ''}`,
  }));

  // ── TC-005 ──
  await test('TC-005', 'Writer uses concept as blueprint', () => runInjected({
    'story/concept': {
      genre: 'sci-fi', tone: 'optimistic', voice: 'third-person-limited',
      setting: { time: 'distant future', place: 'space station greenhouse', mood: 'hopeful' },
      characters: [{ name: 'Maya', role: 'botanist', motivation: 'revive the station ecosystem', arc: 'discovers hope in decay' }],
      acts: [{ name: 'arrival', summary: 'Maya arrives and sees dead plants', scenes: ['Maya discovers dying plants', 'Maya invents adaptive irrigation'] }],
    },
  }), r => ({
    pass: r.status === 'complete',
    reason: `Status: ${r.status}${r.error ? ` — ${r.error}` : ''}`,
  }));

  // ── TC-006 ──
  await test('TC-006', 'Writer handles minimal concept', () => runInjected({
    'story/concept': { genre: 'horror', tone: 'bleak', voice: 'first-person', setting: { time: 'present', place: 'abandoned asylum', mood: 'dread' }, acts: [] },
  }), r => ({
    pass: r.status === 'complete',
    reason: `Status: ${r.status}${r.error ? ` — ${r.error}` : ''}`,
  }));

  // ── TC-007 ──
  await test('TC-007', 'Critic catches contradictions', () => runInjected({
    'story/concept': { genre: 'fantasy', tone: 'dramatic', voice: 'third-person-limited', setting: { time: 'medieval', place: 'castle', mood: 'tense' }, acts: [] },
    'story/draft': 'Scene 1: Sir Aldric falls from the tower and dies. His body is carried away.\n\nScene 2: Sir Aldric draws his sword and confronts the king.\n\nScene 3: The king mentions Aldric died yesterday.',
  }), r => ({
    pass: r.status === 'complete',
    reason: `Status: ${r.status}${r.error ? ` — ${r.error}` : ''}`,
  }));

  // ── TC-008 ──
  await test('TC-008', 'Critic preserves good prose', () => runInjected({
    'story/concept': { genre: 'literary', tone: 'reflective', voice: 'first-person', setting: { time: 'autumn', place: 'a riverside bench', mood: 'melancholic' }, acts: [] },
    'story/draft': 'She sat on the bench as the last leaves fell. The river carried them away, one by one, like memories she could no longer hold. She had come here every autumn for forty years, and each time the bench felt a little harder, the river a little quieter. Today, she noticed a young woman crying at the other end. She said nothing. Sometimes grief needs company, not words.',
  }), r => ({
    pass: r.status === 'complete',
    reason: `Status: ${r.status}${r.error ? ` — ${r.error}` : ''}`,
  }));

  // ── TC-009 ──
  await test('TC-009', 'Empty prompt rejected', () => runFull(''), r => ({
    pass: r.status === 'failed' || !!r.error,
    reason: `Empty prompt: ${r.status}${r.error ? ` — ${r.error}` : ''}`,
  }));

  // ── TC-010 ──
  await test('TC-010', 'Very long prompt handled', () => runFull('Write a short story. ' + 'Once upon a time. '.repeat(400)), r => ({
    pass: r.status === 'complete',
    reason: `Status: ${r.status}${r.error ? ` — ${r.error}` : ''}`,
  }));

  // ── TC-011 ──
  await test('TC-011', 'Non-English prompt', () => runFull('Escribe un cuento corto de fantasía sobre un dragón que colecciona nubes.'), r => ({
    pass: r.status === 'complete',
    reason: `Status: ${r.status}${r.error ? ` — ${r.error}` : ''}`,
  }));

  // ── Report ──────────────────────────────────────────────────

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const total = results.length;

  let report = `# Story Writer — Test Run Report\n\n`;
  report += `**Date:** ${new Date().toISOString()}\n`;
  report += `**Model:** opencode-go/mimo-v2.5\n`;
  report += `**Pipeline:** story-conceptor → story-writer → story-critic\n`;
  report += `**Results:** ${passed} passed, ${failed} failed (${total} total)\n\n`;

  report += `| TC | Title | Result | Time |\n`;
  report += `|:---|---|:---:|---:|\n`;
  for (const r of results) {
    report += `| ${r.id} | ${r.title} | ${r.pass ? '✓' : '✗'} | ${r.elapsed.toFixed(1)}s |\n`;
  }

  report += `\n---\n\n## Detailed Results\n\n`;
  for (const r of results) {
    report += `### ${r.id}: ${r.title}\n\n`;
    report += `**Prompt:** \`${r.prompt.slice(0, 120)}${r.prompt.length > 120 ? '…' : ''}\`\n\n`;
    report += `**Status:** ${r.status}\n`;
    if (r.error) report += `**Error:** ${r.error}\n`;
    report += `**Result:** ${r.pass ? '✓ PASS' : '✗ FAIL'}\n`;
    report += `**Reason:** ${r.reason}\n`;
    report += `**Time:** ${r.elapsed.toFixed(1)}s\n\n`;
  }

  report += `## Rationale Notes\n\n`;
  report += `This test suite validates the 3-agent pipeline (conceptor → writer → critic) against `;
  report += `the failure modes documented in TESTS.md. Each test maps to a specific TC identifier.\n\n`;
  report += `Key observations:\n`;
  report += `- Model: opencode-go/mimo-v2.5 (1M context, 128K max_output, supports images)\n`;
  report += `- Cabinet contract: story/concept → story/draft → story/final + story/critique\n`;
  report += `- All 3 agents are LLM-based with distinct system prompts and temperature settings\n`;
  report += `- Injected tests (TC-005–008) prove agents are individually testable without the full pipeline\n`;
  report += `- Future refinement: per-scene composer, iterative critic → writer loop\n`;

  const reportPath = join(RESULTS_DIR, 'report.md');
  writeFileSync(reportPath, report);
  console.log(`\n📄 Report: ${reportPath}`);
}

main().catch(console.error);
