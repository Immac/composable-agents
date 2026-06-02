/**
 * Built-in condition evaluators.
 *
 * Register these with the ConditionEngine at startup to provide
 * the standard library of conditions that all agents can use.
 */

import type { ConditionEvaluator, ExecutionScope } from '../types/index.ts';

export const builtinEvaluators: ConditionEvaluator[] = [
  {
    type: 'has-output',
    description: 'True when task has produced output',
    evaluate: (_params, scope) => scope.blackboard.task.output !== undefined,
  },
  {
    type: 'has-error',
    description: 'True when task has an error',
    evaluate: (_params, scope) => scope.blackboard.task.error !== undefined,
  },
  {
    type: 'complete',
    description: 'True when task status is complete',
    evaluate: (_params, scope) => scope.blackboard.task.status === 'complete',
  },
  {
    type: 'failed',
    description: 'True when task status is failed',
    evaluate: (_params, scope) => scope.blackboard.task.status === 'failed',
  },
  {
    type: 'has-warnings',
    description: 'True when there are pending warnings',
    evaluate: (_params, scope) => scope.blackboard.warnings.length > 0,
  },
  {
    type: 'repeated-error',
    description: 'True when the same error appears N+ times (default: 3)',
    evaluate: (params, scope) => {
      const threshold = (params?.threshold as number) ?? 3;
      const errorEntries = scope.blackboard.warnings.filter(
        (w) => w.toLowerCase().includes('error'),
      );
      return errorEntries.length >= threshold;
    },
  },
  {
    type: 'cabinet-exists',
    description: 'True when a cabinet path matches the given pattern',
    evaluate: (params, scope) => {
      const path = params?.path as string | undefined;
      if (!path) return false;
      const results = scope.cabinet.query(path);
      return results.length > 0;
    },
  },
  {
    type: 'warnings-count',
    description: 'True when warning count meets or exceeds threshold',
    evaluate: (params, scope) => {
      const threshold = (params?.threshold as number) ?? 1;
      return scope.blackboard.warnings.length >= threshold;
    },
  },
  {
    type: 'task-contains',
    description: 'True when task input or goal contains the given text',
    evaluate: (params, scope) => {
      const text = (params?.text as string) ?? '';
      if (!text) return false;
      const combined = `${scope.blackboard.task.input} ${scope.blackboard.task.goal}`.toLowerCase();
      return combined.includes(text.toLowerCase());
    },
  },
  {
    type: 'always-true',
    description: 'Always evaluates to true (for testing)',
    evaluate: () => true,
  },
  {
    type: 'always-false',
    description: 'Always evaluates to false (fallback for invalid conditions)',
    evaluate: () => false,
  },
];
