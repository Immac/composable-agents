/**
 * Condition — synchronous predicates that query a scope's state.
 *
 * Composable via and/or/not. Evaluated by named evaluators registered
 * with the condition engine. Never have side effects — they are pure queries.
 */

import type { ExecutionScope } from './agent.ts';

export type Condition =
  | { type: string; params?: Record<string, unknown> }
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition };

export type ConditionEval = (
  params: Record<string, unknown> | undefined,
  scope: ExecutionScope,
) => boolean;

export interface ConditionEvaluator {
  type: string;
  evaluate: ConditionEval;
  description?: string;
}
