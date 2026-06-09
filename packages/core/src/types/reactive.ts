/**
 * Reactive runtime types.
 *
 * Agents can declare triggers that are evaluated against the current scope.
 * When a trigger rises from false to true, the reactive runtime may execute
 * the agent and continue until no new triggers fire.
 */

import type { SequenceResult } from './sequence.ts';

export interface ReactiveConfig {
  /** Condition expression evaluated by the ConditionEngine */
  when: string;

  /** Higher values run first when multiple agents trigger together */
  priority?: number;
}

export interface ReactiveRunResult {
  results: SequenceResult[];
  iterations: number;
  converged: boolean;
}
