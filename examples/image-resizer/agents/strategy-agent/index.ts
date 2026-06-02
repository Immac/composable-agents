/**
 * Strategy Agent
 *
 * Given a dimension plan, selects the resize + pad/crop strategy.
 * - If ratio is preserved:   fill (direct resize)
 * - If ratio changed:        contain (pad) or cover (crop)
 *
 * The strategy determines which sharp fit mode to use.
 */

import type { AgentResult, ExecutionScope } from 'composable-agents';
import type { DimensionPlan } from '../dimension-resolver/index.ts';

// Resize modes for sharp
export type ResizeStrategy = 'fill' | 'contain' | 'cover';

export interface StrategyPlan {
  targetWidth: number;
  targetHeight: number;
  resizeMode: ResizeStrategy;
  /** Background color for padding (only for contain) */
  background?: { r: number; g: number; b: number; alpha?: number };
  description: string;
}

export async function execute(
  scope: ExecutionScope,
  signal?: AbortSignal,
): Promise<AgentResult> {
  if (signal?.aborted) return { status: 'aborted' };

  const plan = scope.cabinet.get('dimensions/plan') as DimensionPlan | undefined;
  if (!plan) {
    return { status: 'failed', error: 'No dimension plan found' };
  }

  // Read decision from strategy-analyzer (or composition-analyzer fallback)
  const decision = scope.cabinet.get('strategy/decision') as
    { strategy: string; confidence?: number; reasoning?: string } | undefined;

  let strategy: StrategyPlan;

  if (plan.ratioChanged === false) {
    // Ratio preserved — direct fill
    strategy = {
      targetWidth: plan.snappedWidth,
      targetHeight: plan.snappedHeight,
      resizeMode: 'fill',
      description: `Direct resize to ${plan.snappedWidth}×${plan.snappedHeight} (ratio preserved)`,
    };
  } else if (decision?.strategy === 'cover') {
    // Strategy analyzer chose cover (crop to fill)
    strategy = {
      targetWidth: plan.snappedWidth,
      targetHeight: plan.snappedHeight,
      resizeMode: 'cover',
      description: `Crop to fill ${plan.snappedWidth}×${plan.snappedHeight} (ratio delta: ${plan.ratioDifference}%)`,
    };
  } else {
    // Default: contain (pad to fit, never loses content)
    strategy = {
      targetWidth: plan.snappedWidth,
      targetHeight: plan.snappedHeight,
      resizeMode: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      description: `Resize to fit ${plan.snappedWidth}×${plan.snappedHeight} with padding (ratio delta: ${plan.ratioDifference}%)`,
    };
  }

  scope.cabinet.put('strategy/plan', strategy);
  scope.blackboard.setTaskOutput(`Strategy: ${strategy.resizeMode} — ${strategy.description}`);

  return { status: 'success', output: strategy.description };
}
