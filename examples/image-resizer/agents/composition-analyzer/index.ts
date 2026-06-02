/**
 * Composition Analyzer Agent
 *
 * Pre-scans image edges at thumbnail resolution (max 1024px on longest side)
 * to detect where important content lies. Produces a structured report used
 * by the strategy-analyzer LLM agent for the contain vs cover decision.
 *
 * Pure deterministic code — no LLM. Edge variance tells us if cropping
 * would lose meaningful content vs uniform areas (sky, gradients, etc.).
 */

import sharp from 'sharp';
import type { AgentResult, ExecutionScope } from 'composable-agents';

const MAX_PREVIEW_PX = 1024;
const EDGE_STRIP_RATIO = 0.05;
const VARIANCE_THRESHOLD = 15;

export interface EdgeReport {
  importantEdges: string[];
  edges: { top: number; bottom: number; left: number; right: number };
  centerBiased: boolean;
  safeToCrop: boolean;
  previewWidth: number;
  previewHeight: number;
}

function computeVariance(pixels: number[]): number {
  if (pixels.length === 0) return 0;
  const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;
  const sqDiffs = pixels.map((v) => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / pixels.length);
}

async function scanImage(imagePath: string): Promise<EdgeReport> {
  const meta = await sharp(imagePath).metadata();
  if (!meta.width || !meta.height) throw new Error('No dimensions');

  // Thumbnail at max 1024px longest side
  const scale = Math.min(MAX_PREVIEW_PX / meta.width, MAX_PREVIEW_PX / meta.height, 1);
  const pW = Math.round(meta.width * scale);
  const pH = Math.round(meta.height * scale);

  const preview = sharp(imagePath).resize(pW, pH, { fit: 'inside' });
  const { data, info } = await preview.raw().toBuffer({ resolveWithObject: true });

  const stripPx = Math.max(1, Math.round(Math.min(pW, pH) * EDGE_STRIP_RATIO));

  function getRegion(left: number, top: number, width: number, height: number): number[] {
    const region: number[] = [];
    for (let y = top; y < top + height && y < info.height; y++) {
      for (let x = left; x < left + width && x < info.width; x++) {
        const idx = (y * info.width + x) * info.channels;
        const gray = (data[idx]! + data[idx + 1]! + data[idx + 2]!) / 3;
        region.push(gray);
      }
    }
    return region;
  }

  const centerPixels = getRegion(stripPx, stripPx, Math.max(1, pW - stripPx * 2), Math.max(1, pH - stripPx * 2));
  const centerVar = computeVariance(centerPixels);

  const edges = {
    top: computeVariance(getRegion(0, 0, pW, stripPx)),
    bottom: computeVariance(getRegion(0, pH - stripPx, pW, stripPx)),
    left: computeVariance(getRegion(0, 0, stripPx, pH)),
    right: computeVariance(getRegion(pW - stripPx, 0, stripPx, pH)),
  };

  const importantEdges = Object.entries(edges)
    .filter(([, v]) => v > VARIANCE_THRESHOLD && v > centerVar * 0.3)
    .map(([k]) => k);

  return {
    importantEdges,
    edges,
    centerBiased: centerVar > Math.max(...Object.values(edges)) * 1.5,
    previewWidth: pW,
    previewHeight: pH,
    safeToCrop: importantEdges.length === 0,
  };
}

export async function execute(scope: ExecutionScope, signal?: AbortSignal): Promise<AgentResult> {
  if (signal?.aborted) return { status: 'aborted' };

  const inputPath = scope.cabinet.get('input/path') as string | undefined;
  const plan = scope.cabinet.get('dimensions/plan') as Record<string, unknown> | undefined;
  if (!inputPath) return { status: 'failed', error: 'No input path' };
  if (!plan) return { status: 'failed', error: 'No dimension plan' };

  try {
    const report = await scanImage(inputPath);

    // Compute crop dimensions
    const inW = plan.inputWidth as number;
    const inH = plan.inputHeight as number;
    const snapW = plan.snappedWidth as number;
    const snapH = plan.snappedHeight as number;
    const coverScale = Math.max(snapW / inW, snapH / inH);
    const cw = Math.round(inW * coverScale);
    const ch = Math.round(inH * coverScale);
    const cropLeft = Math.max(0, Math.round((cw - snapW) / 2));
    const cropRight = cw - snapW - cropLeft;
    const cropTop = Math.max(0, Math.round((ch - snapH) / 2));
    const cropBottom = ch - snapH - cropTop;

    const analysis = {
      ...report,
      cropInfo: { leftPx: Math.max(0, cropLeft), rightPx: Math.max(0, cropRight), topPx: Math.max(0, cropTop), bottomPx: Math.max(0, cropBottom) },
      ratioChange: (plan as any).ratioDifference ?? 0,
      inputWidth: inW, inputHeight: inH,
      snappedWidth: snapW, snappedHeight: snapH,
    };

    scope.cabinet.put('composition/analysis', analysis);

    if (report.safeToCrop) {
      scope.cabinet.put('strategy/decision', {
        strategy: 'cover', confidence: 0.9,
        reasoning: `Edge scan shows uniform edges (variances: ${Object.values(report.edges).map(v => v.toFixed(1)).join(', ')}). Safe to crop ~${cropLeft}/${cropRight}px from sides, ${cropTop}/${cropBottom}px from top/bottom.`,
        source: 'composition-analyzer',
      });
      scope.blackboard.setTaskOutput(`Edges uniform — pre-selected cover (crop ~${cropLeft}/${cropRight}px)`);
      return { status: 'success', output: `Edges uniform, pre-selected cover. Important edges: none` };
    }

    const importantList = report.importantEdges.join(', ');
    scope.blackboard.setTaskOutput(`Edges with content: ${importantList} — awaiting LLM decision`);
    return { status: 'success', output: `Edges with content: ${importantList}` };
  } catch (e) {
    return { status: 'failed', error: `Edge scan: ${(e as Error).message}` };
  }
}
