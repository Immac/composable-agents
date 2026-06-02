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

  // Self-check: if ratio is preserved, write a fill strategy and short-circuit
  const ratioChanged = scope.cabinet.get('dimensions/ratio-changed') as boolean | undefined;
  if (ratioChanged === false) {
    const plan = scope.cabinet.get('dimensions/plan') as DimensionPlan | undefined;
    const strategy: StrategyPlan = {
      targetWidth: plan?.snappedWidth ?? 1024,
      targetHeight: plan?.snappedHeight ?? 1024,
      resizeMode: 'fill',
      description: `Direct resize to ${plan?.snappedWidth}×${plan?.snappedHeight} (ratio preserved)`,
    };
    scope.cabinet.put('strategy/plan', strategy);
    scope.blackboard.setTaskOutput('Ratio preserved — direct fill');
    return { status: 'success', output: `Fill ${strategy.targetWidth}×${strategy.targetHeight}` };
  }

  const plan = scope.cabinet.get('dimensions/plan') as DimensionPlan | undefined;
  if (!plan) {
    return { status: 'failed', error: 'No dimension plan found' };
  }

  // Ratio changed — use contain (pad) to avoid losing image content
  // Sharp's "contain" mode resizes to fit within the box, maintaining ratio
  // and pads the remaining space
  const strategy: StrategyPlan = {
    targetWidth: plan.snappedWidth,
    targetHeight: plan.snappedHeight,
    resizeMode: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 }, // transparent padding
    description: `Resize to fit ${plan.snappedWidth}×${plan.snappedHeight} with padding (ratio delta: ${plan.ratioDifference}%)`,
  };

  scope.cabinet.put('strategy/plan', strategy);
  scope.blackboard.setTaskOutput(`Strategy: ${strategy.description}`);

  return { status: 'success', output: strategy.description };
}
