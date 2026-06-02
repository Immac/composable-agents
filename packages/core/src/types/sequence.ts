/**
 * Sequence — ordered execution topology.
 *
 * Steps can be singular agents, sequential groups, or parallel groups.
 * Parallel branches get isolated cabinets merged at join time.
 */

export type JoinMode = 'all' | 'any' | 'first';

export type MergeStrategy = 'namespaced' | 'concat' | 'union' | 'overwrite';

export type SequenceStep =
  | { agent: string }
  | { agent: string; config?: Record<string, unknown>; onError?: ErrorPolicy }
  | { sequence: SequenceStep[] }
  | { parallel: ParallelGroup };

export interface ParallelGroup {
  run: (string | SequenceStep)[];
  join: JoinMode;
  merge: {
    cabinet: MergeStrategy;
    blackboard?: Record<string, MergeStrategy>;
  };
}

export type ErrorPolicy = 'halt' | 'continue' | 'skip';

export interface SequenceResult {
  agentId: string;
  status: 'success' | 'failed' | 'aborted' | 'skipped';
  output?: string;
  error?: string;
  duration: number;
}
