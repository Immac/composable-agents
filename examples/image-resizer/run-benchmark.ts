/**
 * Benchmark: run the 6-agent pipeline on real ComfyUI-generated images.
 * Produces an HTML report with before/after image comparisons.
 */

import sharp from 'sharp';
import { Controller, ConditionEngine } from 'composable-agents';
import { builtinEvaluators } from '../../packages/core/src/conditions/built-in';
import { PiProvider } from '../../packages/core/src/llm/pi-provider';
import type { Agent, ExecutionScope, AgentResult } from 'composable-agents';
import { execute as metadataReader } from './agents/metadata-reader/index';
import { execute as dimensionResolver } from './agents/dimension-resolver/index';
import { execute as compositionAnalyzer } from './agents/composition-analyzer/index';
import { createStrategyAnalyzer } from './agents/strategy-analyzer/index';
import { execute as strategyAgentFn } from './agents/strategy-agent/index';
import { execute as imageProcessor } from './agents/image-processor/index';
import { existsSync, mkdirSync, readdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, basename, extname, join } from 'node:path';

const ANIMA_DIR = '/home/immac/Repositories/ai_generation/tools/comfyui/output/Image/2026-02/Anima';

const testFiles = [
  { file: 'ComfyUI_00012_.png', label: 'Anima Portrait (960×1152)' },
  { file: 'ComfyUI_00006_.png', label: 'Anima Landscape (1176×896)' },
  { file: 'ComfyUI_00002_.png', label: 'Anima Wide (1144×960)' },
  { file: 'ComfyUI_00004_.png', label: 'Anima Scene (1176×896)' },
];

const outDir = resolve(process.cwd(), 'output', 'benchmark');
const reportDir = resolve(outDir, 'report');
const thumbsDir = resolve(outDir, 'thumbs');
const resultsDir = resolve(outDir, 'results');
mkdirSync(reportDir, { recursive: true });
mkdirSync(thumbsDir, { recursive: true });
mkdirSync(resultsDir, { recursive: true });

// Real LLM provider — uses pi's SDK
// Change modelId to any model from `pi --list-models`
const llmProvider = new PiProvider({
  modelId: 'github-copilot/gpt-5-mini',
});

interface BenchResult {
  label: string;
  file: string;
  input: { width: number; height: number; area: number; ratio: number };
  output: { width: number; height: number; area: number } | null;
  strategy: string;
  history: any[];
  status: string;
}

const results: BenchResult[] = [];

for (const tf of testFiles) {
  const inputPath = join(ANIMA_DIR, tf.file);
  if (!existsSync(inputPath)) { console.log(`Skipping ${tf.file}`); continue; }

  const meta = await sharp(inputPath).metadata();

  const controller = new Controller();
  const ce = new ConditionEngine();
  ce.registerAll(builtinEvaluators);

  const agents: Agent[] = [
    { id: 'metadata-reader', manifest: { id: 'metadata-reader', type: 'code', version: '0.1.0', purpose: '', learning: { channels: [] } }, execute: metadataReader as any },
    { id: 'dimension-resolver', manifest: { id: 'dimension-resolver', type: 'code', version: '0.1.0', purpose: '', learning: { channels: [] } }, execute: dimensionResolver as any },
    { id: 'composition-analyzer', manifest: { id: 'composition-analyzer', type: 'code', version: '0.1.0', purpose: '', learning: { channels: [] } }, execute: compositionAnalyzer as any },
    createStrategyAnalyzer(llmProvider),
    { id: 'strategy-agent', manifest: { id: 'strategy-agent', type: 'code', version: '0.1.0', purpose: '', learning: { channels: [] } }, execute: strategyAgentFn as any },
    { id: 'image-processor', manifest: { id: 'image-processor', type: 'code', version: '0.1.0', purpose: '', learning: { channels: [] } }, execute: imageProcessor as any },
  ];

  const agentMap = new Map(agents.map(a => [a.id, a]));

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
    conditionEngine: ce,
    reflexes: [],
    config: { identity: { name: 'Benchmark', constraints: [], values: [] } },
  });

  const baseName = basename(inputPath, extname(inputPath));
  const outFiles = readdirSync(resolve(process.cwd(), 'output')).filter(f => f.startsWith(baseName));
  let outputMeta = null;
  if (outFiles.length > 0) {
    const fp = resolve(process.cwd(), 'output', outFiles[0]);
    const om = await sharp(fp).metadata();
    outputMeta = { width: om.width, height: om.height, area: om.width * om.height };
    copyFileSync(fp, join(resultsDir, `result_${tf.file}`));
  }

  results.push({
    label: tf.label,
    file: tf.file,
    input: { width: meta.width, height: meta.height, area: meta.width * meta.height, ratio: meta.width / meta.height },
    output: outputMeta,
    strategy: result.output ?? 'unknown',
    history: result.history,
    status: result.status,
  });

  const thumbPath = join(thumbsDir, tf.file);
  await sharp(inputPath).resize(320, 240, { fit: 'inside' }).toFile(thumbPath);

  console.log(`✅ ${tf.label}: ${meta.width}×${meta.height} → ${outputMeta?.width}×${outputMeta?.height}`);
}

// === Generate HTML report ===
const rows = results.map(r => {
  const ratioDiff = r.output ? Math.abs(r.input.ratio - (r.output.width / r.output.height)) / r.input.ratio * 100 : 0;
  const s = r.strategy || '';
  const strategyLabel = s.includes('cover') ? 'Cover (crop)' : s.includes('fill') ? 'Fill' : 'Contain (pad)';

  return `<div class="card">
    <h2>${r.label}</h2>
    <div class="img-row">
      <div class="img-box">
        <div class="img-label">Original — ${r.input.width}×${r.input.height}</div>
        <img src="../thumbs/${r.file}" loading="lazy">
        <div class="dim">${(r.input.area / 1e6).toFixed(2)} MP · ratio ${r.input.ratio.toFixed(4)}</div>
      </div>
      <div class="arrow">→</div>
      <div class="img-box">
        <div class="img-label">Resized — ${r.output?.width}×${r.output?.height} (${strategyLabel})</div>
        <img src="../results/result_${r.file}" loading="lazy">
        <div class="dim">${r.output ? (r.output.area / 1e6).toFixed(2) + ' MP · ratio ' + (r.output.width / r.output.height).toFixed(4) : '—'}</div>
      </div>
    </div>
    <div class="grid-4">
      <div class="stat ${r.input.area >= 1024*1024 ? 'ok' : 'warn'}"><div class="stat-val">${(r.input.area / 1e6).toFixed(2)}MP</div><div class="stat-lbl">Input area</div></div>
      <div class="stat ${r.output && r.output.area >= 1024*1024 ? 'ok' : 'warn'}"><div class="stat-val">${r.output ? (r.output.area / 1e6).toFixed(2) + 'MP' : '—'}</div><div class="stat-lbl">Output area</div></div>
      <div class="stat ${ratioDiff < 0.5 ? 'ok' : 'warn'}"><div class="stat-val">${ratioDiff.toFixed(2)}%</div><div class="stat-lbl">Ratio change</div></div>
      <div class="stat ok"><div class="stat-val">${strategyLabel}</div><div class="stat-lbl">Strategy</div></div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:10px;padding:10px;background:#0f172a;border-radius:8px;font-size:11px">
      ${r.history.map(h => `<span style="background:${h.status === 'success' ? '#166534' : '#7f1d1d'};color:#fff;padding:3px 8px;border-radius:4px">${h.agentId}</span>`).join('<span style="color:#475569">→</span>')}
    </div>
  </div>`;
}).join('\n');

writeFileSync(join(reportDir, 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Composable Agents — Benchmark Report</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;padding:32px;max-width:1200px;margin:auto}
  h1{font-size:26px;margin-bottom:6px}.subtitle{color:#94a3b8;margin-bottom:28px;font-size:14px}
  .summary{display:flex;gap:12px;margin-bottom:28px;flex-wrap:wrap}
  .summary-card{background:#1e293b;border-radius:10px;padding:16px 20px;flex:1;min-width:120px}
  .summary-card .num{font-size:28px;font-weight:700;color:#60a5fa}
  .summary-card .label{font-size:12px;color:#94a3b8;margin-top:2px}
  .card{background:#1e293b;border-radius:12px;padding:24px;margin-bottom:20px}
  .card h2{font-size:17px;margin-bottom:14px;color:#f1f5f9}
  .img-row{display:flex;align-items:center;gap:16px;margin-bottom:16px;flex-wrap:wrap}
  .img-box{flex:1;min-width:200px;text-align:center}
  .img-box img{max-width:100%;border-radius:8px;background:#0f172a;max-height:300px}
  .img-label{font-size:12px;color:#94a3b8;margin-bottom:4px}
  .dim{font-size:12px;color:#64748b;margin-top:4px}
  .arrow{font-size:28px;color:#475569;padding:0 8px}
  .grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
  .stat{background:#0f172a;border-radius:8px;padding:12px;text-align:center}
  .stat.ok{border-left:3px solid #22c55e}.stat.warn{border-left:3px solid #eab308}
  .stat-val{font-size:18px;font-weight:600}
  .stat-lbl{font-size:11px;color:#94a3b8;margin-top:2px}
  @media(max-width:600px){.grid-4{grid-template-columns:repeat(2,1fr)}body{padding:12px}}
</style></head>
<body>
  <h1>🖼️ Composable Agents — Pipeline Benchmark</h1>
  <p class="subtitle">6-agent pipeline on ${results.length} real ComfyUI-generated Anima images</p>
  <div class="summary">
    <div class="summary-card"><div class="num">${results.length}</div><div class="label">Images processed</div></div>
    <div class="summary-card"><div class="num">${results.filter(r => r.status === 'complete').length}</div><div class="label">Successful</div></div>
    <div class="summary-card"><div class="num">${results.filter(r => (r.output?.area ?? 0) >= 1024*1024).length}</div><div class="label">≥ 1MP output</div></div>
    <div class="summary-card"><div class="num">6</div><div class="label">Pipeline agents</div></div>
  </div>
  ${rows}
  <div class="card">
    <h2>🔧 Pipeline Architecture</h2>
    <div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;font-size:13px;padding:12px;background:#0f172a;border-radius:8px">
      <span style="background:#166534;color:#bbf7d0;padding:5px 12px;border-radius:4px">📖 metadata-reader</span>
      <span style="color:#475569">→</span>
      <span style="background:#166534;color:#bbf7d0;padding:5px 12px;border-radius:4px">📐 dimension-resolver</span>
      <span style="color:#475569">→</span>
      <span style="background:#166534;color:#bbf7d0;padding:5px 12px;border-radius:4px">🔍 composition-analyzer</span>
      <span style="color:#475569">→</span>
      <span style="background:#166534;color:#bbf7d0;padding:5px 12px;border-radius:4px">🧠 strategy-analyzer</span>
      <span style="color:#475569">→</span>
      <span style="background:#166534;color:#bbf7d0;padding:5px 12px;border-radius:4px">🎯 strategy-agent</span>
      <span style="color:#475569">→</span>
      <span style="background:#166534;color:#bbf7d0;padding:5px 12px;border-radius:4px">⚙️ image-processor</span>
    </div>
    <p style="color:#94a3b8;font-size:13px;margin-top:12px;line-height:1.6">
      <strong>Sequence axiom</strong>: Controller runs all 6 agents in pipeline order.<br>
      <strong>Cabinet</strong>: Each agent writes results to a shared namespace; next agent reads them.<br>
      <strong>Mixed types</strong>: 5 code agents + 1 LLM agent communicate through the same cabinet.<br>
      <strong>Condition axiom</strong>: Pre-checks validate cabinet state before each agent runs.<br>
      <strong>Signal axiom</strong>: Reflex system ready for cross-cutting behavior (not used in this run).
    </p>
  </div>
</body></html>`);

console.log(`\n📄 Report: ${join(reportDir, 'index.html')}`);
