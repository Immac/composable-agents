/**
 * Vision pipeline — same resize task, but uses a vision-capable LLM agent
 * instead of a code edge-scan + text LLM.
 *
 * Pipeline: metadata-reader → dimension-resolver → vision-analyzer → strategy-agent → image-processor
 *
 * This proves agents are swappable: the cabinet contract (strategy/decision) is the same,
 * only the agent that writes it changes.
 */

import sharp from 'sharp';
import { Controller, ConditionEngine, PiProvider } from 'composable-agents';
import { builtinEvaluators } from '../../packages/core/src/conditions/built-in';
import type { Agent, ExecutionScope, AgentResult } from 'composable-agents';
import { execute as metadataReader } from '../image-resizer/agents/metadata-reader/index';
import { execute as dimensionResolver } from '../image-resizer/agents/dimension-resolver/index';
import { execute as strategyAgentFn } from '../image-resizer/agents/strategy-agent/index';
import { execute as imageProcessor } from '../image-resizer/agents/image-processor/index';
import { createVisionAnalyzer } from './agents/vision-analyzer/index';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, join, basename, extname } from 'node:path';

const ANIMA_DIR = '/home/immac/Repositories/ai_generation/tools/comfyui/output/Image/2026-02/Anima';
const testFiles = [
  { file: 'ComfyUI_00012_.png', label: 'Portrait (960×1152)' },
  { file: 'ComfyUI_00006_.png', label: 'Landscape (1176×896)' },
  { file: 'ComfyUI_00002_.png', label: 'Wide (1144×960)' },
  { file: 'ComfyUI_00004_.png', label: 'Scene (1176×896)' },
];

const llmProvider = new PiProvider({ modelId: 'opencode-go/mimo-v2.5' });

async function main() {
  console.log('=== Vision Pipeline (composition-analyzer + strategy-analyzer → vision-analyzer) ===\n');

  for (const tf of testFiles) {
    const inputPath = join(ANIMA_DIR, tf.file);
    if (!existsSync(inputPath)) continue;

    const meta = await sharp(inputPath).metadata();
    const snapW = Math.ceil(meta.width / 64) * 64;
    const snapH = Math.ceil(meta.height / 64) * 64;

    const controller = new Controller();
    const ce = new ConditionEngine();
    ce.registerAll(builtinEvaluators);

    // Capture what the LLM decided
    let llmDecision = 'not reached';
    const visionAgent = createVisionAnalyzer(llmProvider);
    const wrapped = {
      ...visionAgent,
      execute: async (scope: ExecutionScope, signal?: AbortSignal) => {
        const result = await visionAgent.execute(scope, signal);
        const d = scope.cabinet.get('strategy/decision') as any;
        if (d) llmDecision = `${d.strategy} (${(d.confidence * 100).toFixed(0)}%) — ${(d.reasoning ?? '').slice(0, 120)}`;
        return result;
      },
    };

    const agents: Agent[] = [
      { id: 'metadata-reader', manifest: { id: 'metadata-reader', type: 'code', version: '0.1.0', purpose: '', learning: { channels: [] } }, execute: metadataReader as any },
      { id: 'dimension-resolver', manifest: { id: 'dimension-resolver', type: 'code', version: '0.1.0', purpose: '', learning: { channels: [] } }, execute: dimensionResolver as any },
      wrapped,
      { id: 'strategy-agent', manifest: { id: 'strategy-agent', type: 'code', version: '0.1.0', purpose: '', learning: { channels: [] } }, execute: strategyAgentFn as any },
      { id: 'image-processor', manifest: { id: 'image-processor', type: 'code', version: '0.1.0', purpose: '', learning: { channels: [] } }, execute: imageProcessor as any },
    ];

    const result = await controller.run(inputPath, {
      pipeline: [
        { agent: 'metadata-reader' },
        { agent: 'dimension-resolver' },
        { agent: 'vision-analyzer' },
        { agent: 'strategy-agent' },
        { agent: 'image-processor' },
      ],
      agents: new Map(agents.map(a => [a.id, a])),
      conditionEngine: ce,
      reflexes: [],
      config: { identity: { name: 'VisionTest', constraints: [], values: [] } },
    });

    const changed = meta.width !== snapW || meta.height !== snapH;
    console.log(`${tf.file.slice(0, 25).padEnd(26)} ${meta.width}×${meta.height} → ${snapW}×${snapH} ${changed ? '⚡' : '✓'}`);
    console.log(`  Vision: ${llmDecision}`);
    console.log(`  Status: ${result.status}`);
    console.log('');
  }

  // Cleanup
  const outDir = resolve(process.cwd(), 'output');
  if (existsSync(outDir)) {
    for (const f of readdirSync(outDir)) {
      if (f.endsWith('.png') || f.endsWith('.jpg')) {
        const { rmSync } = await import('node:fs');
        try { rmSync(join(outDir, f)); } catch {}
      }
    }
  }

  console.log('All done. These 5 agents replaced the original 6 — same cabinet contract.');
  console.log('  Vision pipeline:   metadata → dimension → vision-analyzer → strategy → image-processor');
  console.log('  Original pipeline: metadata → dimension → composition → LLM-strategy → strategy → image-processor');
}

main().catch(console.error);
