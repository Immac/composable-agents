/**
 * Run the image-resizer agent through the framework Controller pipeline
 * with a post-agent reflex that cancels resizes exceeding 50% area increase.
 *
 * Usage: npx tsx examples/image-resizer/run-on-file.ts <image-path>
 *
 * Pipeline axioms in action:
 *   Sequence  — pipeline step runs image-resizer
 *   Condition — custom evaluator checks resize threshold
 *   Signal    — reflex fires at post-agent timing, discards output on excess
 */

import sharp from 'sharp';
import { Controller, ConditionEngine } from 'composable-agents';
import { builtinEvaluators } from '../../packages/core/src/conditions/built-in.ts';
import { execute } from './index.ts';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, extname, basename } from 'node:path';
import type { Agent, ExecutionScope, AgentResult } from 'composable-agents';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: npx tsx examples/image-resizer/run-on-file.ts <image-path>');
  process.exit(1);
}

// Wrap as framework Agent
const imageResizerAgent: Agent = {
  id: 'image-resizer',
  manifest: {
    id: 'image-resizer',
    type: 'code',
    version: '0.1.0',
    purpose: 'Resize images maintaining aspect ratio, snapped to 64px, minimum 1MP area',
    learning: { channels: [] },
  },
  execute: execute as (scope: ExecutionScope, signal?: AbortSignal) => Promise<AgentResult>,
};

async function main() {
  // 1. Read input metadata
  const meta = await sharp(inputPath).metadata();
  if (!meta.width || !meta.height) {
    console.error('Could not read image dimensions');
    process.exit(1);
  }

  const inputArea = meta.width * meta.height;
  const threshold = 0.50; // 50% area increase limit

  console.log('=== Framework Pipeline with Reflex ===');
  console.log('Input:  ', meta.width, '×', meta.height, `(${inputArea.toLocaleString()} px²)`);
  console.log('Reflex:  discard if resize exceeds', (threshold * 100) + '% area increase');
  console.log('');

  // 2. Setup the framework
  const controller = new Controller();
  const conditionEngine = new ConditionEngine();
  conditionEngine.registerAll(builtinEvaluators);

  // Register a custom condition evaluator that checks cabinet metadata
  conditionEngine.register({
    type: 'resize-exceeds-threshold',
    description: 'True when resize area increase exceeds the given threshold',
    evaluate: (params, scope) => {
      const t = (params?.threshold as number) ?? 0.50;
      const metadata = scope.cabinet.get('output/metadata') as
        { inputArea: number; outputArea: number } | undefined;
      if (!metadata) return false;
      const increase = (metadata.outputArea - metadata.inputArea) / metadata.inputArea;
      return increase > t;
    },
  });

  const agents = new Map<string, Agent>();
  agents.set('image-resizer', imageResizerAgent);

  // 3. Run — if resize exceeds 50% area, discard the output
  const result = await controller.run(inputPath, {
    pipeline: [{ agent: 'image-resizer' }],
    agents,
    conditionEngine,
    reflexes: [
      {
        id: 'resize-limit',
        timing: 'post-agent',
        condition: 'resize-exceeds-threshold(threshold=0.50)',
        action: 'discard-output',
        target: 'image-resizer',
        triggerCount: 0,
        message: 'Resize exceeds 50% area increase — discarding',
      },
    ],
    config: {
      identity: {
        name: 'Resizer',
        constraints: ['Only process valid image files'],
        values: ['Accuracy over speed'],
      },
    },
  });

  // 4. Report
  console.log('Pipeline status:', result.status);
  if (result.error) console.log('Error:', result.error);
  console.log('Output:', result.output ?? '(none — agent failed or reflex discarded)');

  if (result.output) {
    // Find output file
    const outDir = resolve(dirname(inputPath), '..', 'output');
    const ext = extname(inputPath);
    const base = basename(inputPath, ext);
    if (existsSync(outDir)) {
      const files = readdirSync(outDir);
      const outputFile = files.find(f => f.startsWith(base + '_'));
      if (outputFile) {
        const fullPath = resolve(outDir, outputFile);
        const outMeta = await sharp(fullPath).metadata();
        const outputArea = outMeta.width! * outMeta.height!;
        const increase = ((outputArea - inputArea) / inputArea * 100).toFixed(1);
        console.log(`  Area increase: ${increase}% (limit: ${threshold * 100}%)`);
        console.log('  File:', fullPath);
      }
    }
  }
}

main().catch(console.error);
