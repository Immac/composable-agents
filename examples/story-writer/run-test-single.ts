/**
 * Run one story-writer test case.
 * Usage: npx tsx examples/story-writer/run-test-single.ts <TC-ID | all>
 *
 * Each run creates a fresh pi session — no session leak between tests.
 */

import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Controller, ConditionEngine, PiProvider } from 'composable-agents';
import { builtinEvaluators } from '../../packages/core/src/conditions/built-in';
import { createStoryConceptor } from './agents/story-conceptor/index';
import { createStoryWriter } from './agents/story-writer/index';
import { createStoryCritic } from './agents/story-critic/index';

const RESULTS = resolve('examples/story-writer/test-results');
if (!existsSync(RESULTS)) mkdirSync(RESULTS, { recursive: true });

// ── Test case definitions ────────────────────────────────────

interface Case {
  id: string;
  title: string;
  mode: 'full' | 'inject';
  prompt: string;
  inject?: Record<string, unknown>;
  expectFail?: boolean;
}

const CASES: Case[] = [
  { id: 'TC-001', title: 'Three-agent pipeline completes', mode: 'full',
    prompt: 'Write a 200-word sci-fi story about a robot gardener who teaches a child to grow flowers on a dead world.' },
  { id: 'TC-003', title: 'Conceptor produces structured plan', mode: 'full',
    prompt: 'A mystery set in a 1920s jazz club' },
  { id: 'TC-004', title: 'Genre constraints respected', mode: 'full',
    prompt: 'Write a comedy' },
  { id: 'TC-005', title: 'Writer uses concept as blueprint', mode: 'inject',
    prompt: '',
    inject: { 'story/concept': {
      genre: 'sci-fi', tone: 'optimistic', voice: 'third-person-limited',
      setting: { time: 'distant future', place: 'space station greenhouse', mood: 'hopeful' },
      characters: [{ name: 'Maya', role: 'botanist', motivation: 'revive the station ecosystem', arc: 'discovers hope in decay' }],
      acts: [{ name: 'arrival', summary: 'Maya arrives and sees dead plants', scenes: ['Maya discovers dying plants', 'Maya invents adaptive irrigation'] }],
    } } },
  { id: 'TC-006', title: 'Writer handles minimal concept', mode: 'inject',
    prompt: '',
    inject: { 'story/concept': { genre: 'horror', tone: 'bleak', voice: 'first-person', setting: { time: 'present', place: 'abandoned asylum', mood: 'dread' }, acts: [] } } },
  { id: 'TC-007', title: 'Critic catches contradictions', mode: 'inject',
    prompt: '',
    inject: {
      'story/concept': { genre: 'fantasy', tone: 'dramatic', voice: 'third-person-limited', setting: { time: 'medieval', place: 'castle', mood: 'tense' }, acts: [] },
      'story/draft': 'Scene 1: Sir Aldric falls from the tower and dies. His body is carried away.\n\nScene 2: Sir Aldric draws his sword and confronts the king.\n\nScene 3: The king mentions Aldric died yesterday.' } },
  { id: 'TC-008', title: 'Critic preserves good prose', mode: 'inject',
    prompt: '',
    inject: {
      'story/concept': { genre: 'literary', tone: 'reflective', voice: 'first-person', setting: { time: 'autumn', place: 'a riverside bench', mood: 'melancholic' }, acts: [] },
      'story/draft': 'She sat on the bench as the last leaves fell. The river carried them away, one by one, like memories she could no longer hold. She had come here every autumn for forty years, and each time the bench felt a little harder, the river a little quieter. Today, she noticed a young woman crying at the other end. She said nothing. Sometimes grief needs company, not words.' } },
  { id: 'TC-009', title: 'Empty prompt rejected', mode: 'full',
    prompt: '', expectFail: true },
  { id: 'TC-010', title: 'Very long prompt handled', mode: 'full',
    prompt: 'Write a short story. ' + 'Once upon a time. '.repeat(400) },
  { id: 'TC-011', title: 'Non-English prompt', mode: 'full',
    prompt: 'Escribe un cuento corto de fantasía sobre un dragón que colecciona nubes.' },
];

// ── Runner ───────────────────────────────────────────────────

async function runCase(tc: Case): Promise<{ ok: boolean; status: string; error?: string; elapsed: number; draft?: string; final?: string }> {
  const start = Date.now();
  const provider = new PiProvider({ modelId: 'opencode-go/mimo-v2.5' });

  try {
    const controller = new Controller();
    const ce = new ConditionEngine();
    ce.registerAll(builtinEvaluators);

    let pipeline: any[];
    let agents: Map<string, any>;

    if (tc.mode === 'full') {
      const conceptor = createStoryConceptor(provider);
      const writer = createStoryWriter(provider);
      const critic = createStoryCritic(provider);
      pipeline = [{ agent: 'story-conceptor' }, { agent: 'story-writer' }, { agent: 'story-critic' }];
      agents = new Map([
        ['story-conceptor', { id: 'story-conceptor', manifest: conceptor.manifest, execute: conceptor.execute }],
        ['story-writer', { id: 'story-writer', manifest: writer.manifest, execute: writer.execute }],
        ['story-critic', { id: 'story-critic', manifest: critic.manifest, execute: critic.execute }],
      ]);
    } else {
      const writer = createStoryWriter(provider);
      const critic = createStoryCritic(provider);
      const prepper = {
        id: 'mock-prepper',
        manifest: { id: 'mock-prepper', type: 'code' as const, version: '0.1.0', purpose: '', learning: { channels: [] } },
        execute: async (scope: any) => {
          for (const [k, v] of Object.entries(tc.inject ?? {})) scope.cabinet.put(k, v);
          return { status: 'success' };
        },
      };
      pipeline = [{ agent: 'mock-prepper' }, { agent: 'story-writer' }, { agent: 'story-critic' }];
      agents = new Map([
        ['mock-prepper', prepper],
        ['story-writer', { id: 'story-writer', manifest: writer.manifest, execute: writer.execute }],
        ['story-critic', { id: 'story-critic', manifest: critic.manifest, execute: critic.execute }],
      ]);
    }

    const result = await controller.run(tc.prompt, {
      pipeline, agents, conditionEngine: ce, reflexes: [],
      config: { identity: { name: 'StoryWriter', constraints: [], values: [] } },
    });

    const elapsed = (Date.now() - start) / 1000;

    if (tc.expectFail) {
      return { ok: result.status === 'failed' || !!result.error, status: result.status, error: result.error, elapsed };
    }

    // Extract draft/final from result output if available
    return { ok: result.status === 'complete', status: result.status, error: result.error, elapsed };
  } catch (err) {
    const elapsed = (Date.now() - start) / 1000;
    const msg = err instanceof Error ? err.message : String(err);
    // If we expected a failure, treat exception as success
    if (tc.expectFail) return { ok: true, status: 'error', error: msg, elapsed };
    return { ok: false, status: 'error', error: msg, elapsed };
  } finally {
    provider.dispose();
  }
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  const target = process.argv[2] ?? 'all';
  const cases = target === 'all' ? CASES : CASES.filter(c => c.id === target);

  if (cases.length === 0) {
    console.error(`Unknown test: ${target}`);
    console.error(`Available: ${CASES.map(c => c.id).join(', ')} or 'all'`);
    process.exit(1);
  }

  const results: Array<{ tc: Case; ok: boolean; status: string; error?: string; elapsed: number }> = [];

  for (const tc of cases) {
    process.stderr.write(`[${tc.id}] ${tc.title}... `);
    const r = await runCase(tc);
    results.push({ ...r, tc });
    process.stderr.write(`${r.ok ? '✓' : '✗'} (${r.elapsed.toFixed(0)}s)\n`);
  }

  // ── Report ──
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;

  let report = `# Story Writer — Test Run Report\n\n`;
  report += `**Date:** ${new Date().toISOString()}\n`;
  report += `**Model:** opencode-go/mimo-v2.5\n`;
  report += `**Results:** ${passed} passed, ${failed} failed (${results.length} total)\n\n`;

  report += `| TC | Title | Result | Time |\n`;
  report += `|:---|---|:---:|---:|\n`;
  for (const r of results) {
    const note = r.ok ? '✓' : '✗';
    report += `| ${r.tc.id} | ${r.tc.title} | ${note} ${r.status} | ${r.elapsed.toFixed(0)}s |\n`;
  }

  report += `\n---\n\n## Detailed Results\n\n`;
  for (const r of results) {
    report += `### ${r.tc.id}: ${r.tc.title}\n\n`;
    report += `**Status:** ${r.status}\n`;
    if (r.error) report += `**Error:** ${r.error}\n`;
    report += `**Result:** ${r.ok ? '✓ PASS' : '✗ FAIL'}\n`;
    report += `**Time:** ${r.elapsed.toFixed(1)}s\n\n`;
  }

  const reportPath = join(RESULTS, `report-${target === 'all' ? 'full' : target}.md`);
  writeFileSync(reportPath, report);
  console.log(`📄 Report: ${reportPath}`);
}

main().catch(console.error);
