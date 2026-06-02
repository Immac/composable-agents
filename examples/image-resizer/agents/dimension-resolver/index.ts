/**
 * Dimension Resolver Agent
 *
 * Takes image dimensions and computes:
 * 1. Minimum area (1MP) scaled dimensions (preserves ratio)
 * 2. Snapped dimensions (64px ceiling, preserves ratio only if 64 divides evenly)
 * 3. The best fit-to-snap strategy
 *
 * Stores all three in cabinet for downstream agents.
 */

import type { AgentResult, ExecutionScope } from 'composable-agents';

const MIN_PIXELS = 1024 * 1024;
const SNAP = 64;

export interface DimensionPlan {
  /** Original input dimensions */
  inputWidth: number;
  inputHeight: number;
  inputArea: number;

  /** Scale factor to reach exactly 1MP (prior to snapping) */
  scaleToMin: number;

  /** Dimensions scaled to 1MP area (maintains ratio exactly) */
  minAreaWidth: number;
  minAreaHeight: number;
  minAreaAspect: number;

  /** Snapped dimensions (64px ceiling) */
  snappedWidth: number;
  snappedHeight: number;
  snappedAspect: number;

  /** Whether the aspect ratio changed after snapping */
  ratioChanged: boolean;
  ratioDifference: number; // percentage difference

  /** Recommended strategy */
  strategy: 'fill' | 'contain' | 'cover';
}

function computeTargetSize(width: number, height: number): {
  preSnapW: number; preSnapH: number;
  snapW: number; snapH: number;
} {
  const area = width * height;
  let preSnapW = width;
  let preSnapH = height;

  // Scale to minimum area
  if (area < MIN_PIXELS) {
    const scale = Math.sqrt(MIN_PIXELS / area);
    preSnapW = Math.round(width * scale);
    preSnapH = Math.round(height * scale);
  }

  // Snap to 64px ceiling
  const snapW = Math.ceil(preSnapW / SNAP) * SNAP;
  const snapH = Math.ceil(preSnapH / SNAP) * SNAP;

  return { preSnapW, preSnapH, snapW, snapH };
}

export function computePlan(width: number, height: number): DimensionPlan {
  const { preSnapW, preSnapH, snapW, snapH } = computeTargetSize(width, height);

  const inputArea = width * height;
  const scaleToMin = Math.sqrt(MIN_PIXELS / inputArea);
  const preSnapAspect = preSnapW / preSnapH;
  const snappedAspect = snapW / snapH;
  const aspectDiff = Math.abs(preSnapAspect - snappedAspect) / preSnapAspect;

  // Determine strategy
  let strategy: 'fill' | 'contain' | 'cover';
  if (aspectDiff < 0.001) {
    strategy = 'fill'; // Snapping didn't change ratio — direct resize is fine
  } else {
    // Snapping changed ratio — we need to pad (contain) or crop (cover)
    // Default to contain (pad) which doesn't lose image content
    strategy = 'contain';
  }

  return {
    inputWidth: width,
    inputHeight: height,
    inputArea,
    scaleToMin,
    minAreaWidth: preSnapW,
    minAreaHeight: preSnapH,
    minAreaAspect: preSnapAspect,
    snappedWidth: snapW,
    snappedHeight: snapH,
    snappedAspect,
    ratioChanged: aspectDiff >= 0.001,
    ratioDifference: Math.round(aspectDiff * 10000) / 100, // percentage
    strategy,
  };
}

export async function execute(
  scope: ExecutionScope,
  signal?: AbortSignal,
): Promise<AgentResult> {
  if (signal?.aborted) return { status: 'aborted' };

  const metadata = scope.cabinet.get('input/metadata') as
    { width: number; height: number } | undefined;

  if (!metadata) {
    // Try reading from blackboard task.input as a file path
    const inputPath = scope.blackboard.task.input;
    if (!inputPath) {
      return { status: 'failed', error: 'No input metadata or path provided' };
    }
    // Signal downstream that we need metadata first
    return { status: 'failed', error: 'Input metadata required — run metadata-reader first' };
  }

  const plan = computePlan(metadata.width, metadata.height);
  scope.cabinet.put('dimensions/plan', plan);
  scope.cabinet.put('dimensions/snapped', {
    width: plan.snappedWidth,
    height: plan.snappedHeight,
  });
  scope.cabinet.put('dimensions/ratio-changed', plan.ratioChanged);
  scope.cabinet.put('dimensions/strategy', plan.strategy);

  scope.blackboard.setTaskOutput(
    `Snapped ${plan.inputWidth}×${plan.inputHeight} → ${plan.snappedWidth}×${plan.snappedHeight}` +
    (plan.ratioChanged
      ? ` (ratio changed ${plan.ratioDifference}%, strategy: ${plan.strategy})`
      : ' (ratio preserved)'),
  );

  return { status: 'success', output: plan.strategy === 'fill'
    ? `${plan.snappedWidth}×${plan.snappedHeight} (ratio preserved)`
    : `${plan.snappedWidth}×${plan.snappedHeight} via ${plan.strategy} (ratio changed ${plan.ratioDifference}%)`,
  };
}
