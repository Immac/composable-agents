/**
 * Sequence Engine — ordered + parallel execution of agents.
 *
 * Steps can be singular agents, sequential groups, or parallel groups.
 * Parallel branches get isolated cabinets merged at join time.
 */

import type {
  SequenceStep,
  ParallelGroup,
  SequenceResult,
  ErrorPolicy,
  Agent,
} from '../types/index';
import { Scope } from '../context/scope';

export type AgentResolver = (agentId: string) => Agent | undefined;

export interface SequenceEngineConfig {
  resolveAgent: AgentResolver;
}

export class SequenceEngine {
  private config: SequenceEngineConfig;

  constructor(config: SequenceEngineConfig) {
    this.config = config;
  }

  /**
   * Run a sequence of steps against a scope.
   * Returns results for each step.
   */
  async run(
    steps: SequenceStep[],
    scope: Scope,
    signal?: AbortSignal,
  ): Promise<SequenceResult[]> {
    const results: SequenceResult[] = [];

    for (const step of steps) {
      if (signal?.aborted) break;

      if ('parallel' in step) {
        const parallelResults = await this.runParallel(step.parallel, scope, signal);
        results.push(...parallelResults);
      } else if ('sequence' in step) {
        const seqResults = await this.run(step.sequence, scope, signal);
        results.push(...seqResults);
      } else {
        const result = await this.runStep(step, scope, signal);
        results.push(result);
        // If step failed with halt policy, stop the pipeline
        if (result.status === 'failed' && (step as Record<string, unknown>).onError === 'halt') {
          break;
        }
      }
    }

    return results;
  }

  private async runStep(
    step: { agent: string; config?: Record<string, unknown>; onError?: ErrorPolicy },
    scope: Scope,
    signal?: AbortSignal,
  ): Promise<SequenceResult> {
    const startTime = Date.now();
    const agentId = step.agent;
    const onError = step.onError ?? 'continue';

    const agent = this.config.resolveAgent(agentId);
    if (!agent) {
      return {
        agentId,
        status: 'failed',
        error: `No agent registered for ID: ${agentId}`,
        duration: Date.now() - startTime,
      };
    }

    // Create a scoped execution context for the agent
    const agentScope = scope.clone(agentId);

    try {
      const result = await agent.execute(agentScope, signal);

      if (result.status === 'aborted') {
        return { agentId, status: 'aborted', duration: Date.now() - startTime };
      }

      if (result.status === 'failed') {
        // Apply error policy
        if (onError === 'halt') {
          return { agentId, status: 'failed', error: result.error, duration: Date.now() - startTime };
        }
        if (onError === 'skip') {
          // Rollback — don't propagate scope changes
          return { agentId, status: 'skipped', error: result.error, duration: Date.now() - startTime };
        }
        // continue — propagate scope changes
        this.mergeScope(scope, agentScope);
        return { agentId, status: 'failed', error: result.error, output: result.output, duration: Date.now() - startTime };
      }

      // Success — propagate scope changes
      this.mergeScope(scope, agentScope);
      return { agentId, status: 'success', output: result.output, duration: Date.now() - startTime };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (onError === 'halt') {
        return { agentId, status: 'failed', error: errorMessage, duration: Date.now() - startTime };
      }
      if (onError === 'skip') {
        return { agentId, status: 'skipped', error: errorMessage, duration: Date.now() - startTime };
      }
      return { agentId, status: 'failed', error: errorMessage, duration: Date.now() - startTime };
    }
  }

  private async runParallel(
    group: ParallelGroup,
    parentScope: Scope,
    signal?: AbortSignal,
  ): Promise<SequenceResult[]> {
    const branches = group.run.map((step, index) => {
      const branchScope = parentScope.clone(`parallel/${index}`);
      return this.executeBranch(step, branchScope, signal);
    });

    const branchResults = await Promise.all(branches);

    // Merge cabinets based on strategy
    for (let i = 0; i < branchResults.length; i++) {
      const result = branchResults[i];
      if (!result) continue;

      if (result.scope) {
        parentScope.cabinet.merge(
          result.scope.cabinet,
          group.merge.cabinet,
          group.merge.cabinet === 'namespaced' ? `parallel/${i}` : undefined,
        );
      }
    }

    return branchResults.map((r) => ({
      agentId: r.agentId,
      status: r.status,
      output: r.output,
      error: r.error,
      duration: r.duration,
    }));
  }

  private async executeBranch(
    step: string | SequenceStep,
    scope: Scope,
    signal?: AbortSignal,
  ): Promise<BranchResult> {
    if (typeof step === 'string') {
      const agent = this.config.resolveAgent(step);
      if (!agent) {
        return { agentId: step, status: 'failed', error: `No agent registered for ID: ${step}`, duration: 0, scope };
      }
      const agentScope = scope.clone(step);
      const startTime = Date.now();
      try {
        const result = await agent.execute(agentScope, signal);
        return { agentId: step, status: result.status, output: result.output, error: result.error, duration: Date.now() - startTime, scope: agentScope };
      } catch (e) {
        return { agentId: step, status: 'failed', error: e instanceof Error ? e.message : String(e), duration: Date.now() - startTime, scope: agentScope };
      }
    }

    if ('parallel' in step) {
      // Nested parallel — flatten?
      return { agentId: 'nested-parallel', status: 'success', duration: 0, scope };
    }

    if ('sequence' in step) {
      const results = await this.run(step.sequence, scope, signal);
      const last = results[results.length - 1];
      return { agentId: last?.agentId ?? 'sequence', status: last?.status ?? 'success', output: last?.output, error: last?.error, duration: last?.duration ?? 0, scope };
    }

    const agentId = step.agent;
    const result = await this.runStep(step, scope, signal);
    return { agentId, status: result.status as 'success' | 'failed' | 'aborted', output: result.output, error: result.error, duration: result.duration, scope };
  }

  private mergeScope(parent: Scope, child: Scope): void {
    // Copy blackboard state
    if (child.blackboard.task.output) {
      parent.blackboard.task.output = child.blackboard.task.output;
    }
    if (child.blackboard.task.error) {
      parent.blackboard.task.error = child.blackboard.task.error;
    }
    parent.blackboard.task.status = child.blackboard.task.status;
    parent.blackboard.warnings.push(...child.blackboard.warnings);

    // Merge cabinet
    parent.cabinet.merge(child.cabinet, 'overwrite');
  }
}

interface BranchResult {
  agentId: string;
  status: 'success' | 'failed' | 'aborted' | 'skipped';
  output?: string;
  error?: string;
  duration: number;
  scope: Scope;
}
