/**
 * Composed image resize pipeline — tests the composable agents framework.
 *
 * Pipeline:
 *   metadata-reader      reads image dimensions → cabinet
 *   dimension-resolver   computes snapped dims + ratio check → cabinet
 *   strategy-agent       chooses fill/contain/cover → cabinet
 *   image-processor      executes resize with chosen strategy → file
 *
 * Plus a pre-agent reflex: if ratio is preserved by snap, skip strategy-agent.
 *
 * Usage: npx tsx examples/image-resizer/run-composed.ts <image-path>
 */

import sharp from 'sharp';
import { Controller, ConditionEngine } from 'composable-agents';
import { builtinEvaluators } from '../../packages/core/src/conditions/built-in.ts';
import type { Agent, ExecutionScope, AgentResult } from 'composable-agents';
import { execute as metadataReader } from './agents/metadata-reader/index.ts';
import { execute as dimensionResolver } from './agents/dimension-resolver/index.ts';
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

const agents: Agent[] = [
  {
    id: 'metadata-reader',
    manifest: { id: 'metadata-reader', type: 'code', version: '0.1.0', purpose: 'Read image metadata', learning: { channels: [] } },
    execute: metadataReader as (s: ExecutionScope, sig?: AbortSignal) => Promise<AgentResult>,
  },
  {
    id: 'dimension-resolver',
    manifest: { id: 'dimension-resolver', type: 'code', version: '0.1.0', purpose: 'Compute snapped dimensions', learning: { channels: [] } },
    execute: dimensionResolver as (s: ExecutionScope, sig?: AbortSignal) => Promise<AgentResult>,
  },
  {
    id: 'strategy-agent',
    manifest: { id: 'strategy-agent', type: 'code', version: '0.1.0', purpose: 'Choose resize strategy', learning: { channels: [] } },
    execute: strategyAgentFn as (s: ExecutionScope, sig?: AbortSignal) => Promise<AgentResult>,
  },
  {
    id: 'image-processor',
    manifest: { id: 'image-processor', type: 'code', version: '0.1.0', purpose: 'Execute resize', learning: { channels: [] } },
    execute: imageProcessor as (s: ExecutionScope, sig?: AbortSignal) => Promise<AgentResult>,
  },
];

async function main() {
  const meta = await sharp(inputPath).metadata();
  console.log('=== Composed Resize Pipeline ===');
  console.log(`Input: ${meta.width}×${meta.height} (${(meta.width! * meta.height!).toLocaleString()} px²)`);
  console.log('Pipeline: metadata-reader → dimension-resolver → strategy-agent → image-processor');
  console.log('');

  const controller = new Controller();
  const conditionEngine = new ConditionEngine();
  conditionEngine.registerAll(builtinEvaluators);
  // Register condition evaluator (available for future reflex wiring)
  conditionEngine.register({
    type: 'ratio-changed',
    description: 'True when dimension plan shows ratio changed after snapping',
    evaluate: (_params, scope) => {
      const changed = scope.cabinet.get('dimensions/ratio-changed') as boolean | undefined;
      return changed === true;
    },
  });

  const agentMap = new Map(agents.map((a) => [a.id, a]));

  const result = await controller.run(inputPath, {
    pipeline: [
      { agent: 'metadata-reader' },
      { agent: 'dimension-resolver' },
      { agent: 'strategy-agent' },
      { agent: 'image-processor' },
    ],
    agents: agentMap,
    conditionEngine,
    // Reflexes are declared here but pre-agent timing is not yet wired
    // in the Controller. The strategy-agent handles this internally:
    // - If ratio preserved → fill strategy (no padding needed)
    // - If ratio changed → contain strategy (pad to fit)
    reflexes: [],
    config: {
      identity: {
        name: 'ImageResizer',
        constraints: ['Only process valid image files'],
        values: ['Aspect ratio preservation', 'Minimum 1MP output'],
      },
    },
  });

  console.log(`Pipeline status: ${result.status}`);
  if (result.error) console.log(`Error: ${result.error}`);
  console.log(`Output: ${result.output ?? '(none)'}`);

  // Show step-by-step
  console.log('\n=== Step Results ===');
  const outDir = resolve(process.cwd(), 'output');
  const ext = extname(inputPath);
  const baseName = basename(inputPath, ext);

  for (const h of result.history) {
    let detail = '';
    if (h.agentId === 'metadata-reader') {
      detail = `${meta.width}×${meta.height}`;
    } else if (h.agentId === 'dimension-resolver') {
      detail = 'snap + ratio computed';
    } else if (h.agentId === 'strategy-agent') {
      detail = 'strategy chosen';
    } else if (h.agentId === 'image-processor') {
      if (existsSync(outDir)) {
        const files = readdirSync(outDir).filter(f => f.startsWith(baseName));
        if (files.length > 0) {
          const fp = resolve(outDir, files[0]!);
          const m = await sharp(fp).metadata();
          detail = `${m.width}×${m.height}`;
        }
      }
    }
    console.log(`  ${h.status === 'skipped' ? '⏭' : '✅'} ${h.agentId} (${h.status}) ${detail}`);
  }

  // Show output files
  if (existsSync(outDir)) {
    const files = readdirSync(outDir).filter(f => f.startsWith(baseName));
    for (const f of files) {
      const fp = resolve(outDir, f);
      const m = await sharp(fp).metadata();
      console.log(`\n📁 ${fp}`);
      console.log(`   ${m.width}×${m.height} (${(m.width! * m.height!).toLocaleString()} px²) ${m.format}`);
    }
  }
}

main().catch(console.error);
