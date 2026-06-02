/**
 * Composed image resize pipeline v2 — with composition-aware strategy selection.
 *
 * Pipeline:
 *   metadata-reader (code) → reads image dimensions
 *   dimension-resolver (code) → computes 64px snap, detects ratio change
 *   composition-analyzer (code) → edge-scans at ≤1024px, detects important edges
 *   strategy-analyzer (LLM) → decides contain vs cover based on scan
 *   strategy-agent (code) → translates decision to sharp parameters
 *   image-processor (code) → executes sharp with chosen strategy
 *
 * If the composition-analyzer finds all edges uniform, it pre-chooses cover
 * and the LLM agent is skipped entirely (fast path).
 *
 * Usage: npx tsx examples/image-resizer/run-composed.ts <image-path>
 */

import sharp from 'sharp';
import { Controller, ConditionEngine } from 'composable-agents';
import { builtinEvaluators } from '../../packages/core/src/conditions/built-in.ts';
import { MockProvider } from '../../packages/core/src/llm/mock-provider.ts';
import type { Agent, ExecutionScope, AgentResult } from 'composable-agents';
import { execute as metadataReader } from './agents/metadata-reader/index.ts';
import { execute as dimensionResolver } from './agents/dimension-resolver/index.ts';
import { execute as compositionAnalyzer } from './agents/composition-analyzer/index.ts';
import { createStrategyAnalyzer } from './agents/strategy-analyzer/index.ts';
import { execute as strategyAgentFn } from './agents/strategy-agent/index.ts';
import { execute as imageProcessor } from './agents/image-processor/index.ts';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, extname, basename } from 'node:path';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: npx tsx examples/image-resizer/run-composed.ts <image-path>');
  process.exit(1);
}
if (!existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`);
  process.exit(1);
}

async function main() {
  const meta = await sharp(inputPath).metadata();
  console.log('=== Composed Pipeline v2 — Composition-Aware Strategy ===');
  console.log(`Input: ${meta.width}×${meta.height} (${(meta.width! * meta.height!).toLocaleString()} px²)`);
  console.log('');

  const controller = new Controller();
  const conditionEngine = new ConditionEngine();
  conditionEngine.registerAll(builtinEvaluators);

  // LLM provider for the strategy-analyzer
  // In production this would be a real backend (pi, OpenAI, etc.)
  const llmProvider = new MockProvider({
    content: JSON.stringify({
      strategy: 'contain',
      confidence: 0.85,
      reasoning: 'Edge scan shows content on important edges — padding preserves composition.',
    }),
  });

  const agents: Agent[] = [
    { id: 'metadata-reader', manifest: { id: 'metadata-reader', type: 'code', version: '0.1.0', purpose: '', learning: { channels: [] } },
      execute: metadataReader as any },
    { id: 'dimension-resolver', manifest: { id: 'dimension-resolver', type: 'code', version: '0.1.0', purpose: '', learning: { channels: [] } },
      execute: dimensionResolver as any },
    { id: 'composition-analyzer', manifest: { id: 'composition-analyzer', type: 'code', version: '0.1.0', purpose: '', learning: { channels: [] } },
      execute: compositionAnalyzer as any },
    createStrategyAnalyzer(llmProvider),
    { id: 'strategy-agent', manifest: { id: 'strategy-agent', type: 'code', version: '0.1.0', purpose: '', learning: { channels: [] } },
      execute: strategyAgentFn as any },
    { id: 'image-processor', manifest: { id: 'image-processor', type: 'code', version: '0.1.0', purpose: '', learning: { channels: [] } },
      execute: imageProcessor as any },
  ];

  const agentMap = new Map(agents.map(a => [a.id, a]));

  // Reflex: if composition-analyzer already chose cover, skip strategy-analyzer
  const preSkipCondition = {
    type: 'strategy-decided',
    evaluate: (_p: unknown, scope: ExecutionScope) => {
      return scope.cabinet.exists('strategy/decision');
    },
  };
  conditionEngine.register(preSkipCondition);

  const result = await controller.run(inputPath, {
    pipeline: [
      { agent: 'metadata-reader' },
      { agent: 'dimension-resolver' },
      { agent: 'composition-analyzer' },
      { agent: 'strategy-analyzer' },
      { agent: 'strategy-agent' },
      { agent: 'image-processor' },
    ],
    agents: agentMap,
    conditionEngine,
    reflexes: [
      {
        id: 'skip-llm-if-decided',
        timing: 'pre-agent',
        target: 'strategy-analyzer',
        condition: 'strategy-decided',
        action: 'skip-agent',
        triggerCount: 0,
        message: 'Composition analysis already chose cover — skipping LLM',
      },
    ],
    config: {
      identity: {
        name: 'ImageResizer',
        constraints: ['Only process valid image files'],
        values: ['Composition preservation', 'Aspect ratio integrity'],
      },
    },
  });

  // Report
  console.log(`Pipeline status: ${result.status}`);
  if (result.error) console.error(`Error: ${result.error}`);

  // Decode the strategy decision
  const decisionPath = resolve(process.cwd(), 'output', '_decision.json');
  const { writeFileSync } = await import('node:fs');

  console.log(`\n=== Pipeline Steps ===`);
  for (const h of result.history) {
    const icon = h.status === 'success' ? '✅' : h.status === 'skipped' ? '⏭' : '❌';
    console.log(`  ${icon} ${h.agentId} (${h.status})`);
  }

  // Show output
  const outDir = resolve(process.cwd(), 'output');
  const baseName = basename(inputPath, extname(inputPath));
  if (existsSync(outDir)) {
    const files = readdirSync(outDir).filter(f => f.startsWith(baseName) && f.endsWith('.jpg') || f.endsWith('.png'));
    for (const f of files) {
      const fp = resolve(outDir, f);
      const m = await sharp(fp).metadata();
      console.log(`\n📁 ${fp}`);
      console.log(`   ${m.width}×${m.height} (${(m.width! * m.height!).toLocaleString()} px²)`);
    }
  }

  console.log(`\nOutput: ${result.output ?? '(none)'}`);
}

main().catch(console.error);
