/**
 * Reactive Engine — condition-driven execution until convergence.
 *
 * Agents declare reactive triggers in their manifests. The engine evaluates
 * those triggers against the current scope, runs newly-triggered agents in
 * priority order, and repeats until no new trigger edges appear.
 */

import type {
  Agent,
  AgentResult,
  ReactiveRunResult,
  SequenceResult,
} from '../types/index.ts';
import type { ConditionEngine } from './condition-engine.ts';
import { Scope } from '../context/scope.ts';
import type { AgentResolver } from './sequence-engine.ts';

export interface ReactiveEngineConfig {
  resolveAgent: AgentResolver;
  conditionEngine: ConditionEngine;
  maxIterations?: number;
}

interface ReactiveAgentDefinition {
  agent: Agent;
  condition: ReturnType<ConditionEngine['parseExpression']>;
  order: number;
  priority: number;
}

export class ReactiveEngine {
  private readonly config: ReactiveEngineConfig;

  constructor(config: ReactiveEngineConfig) {
    this.config = config;
  }

  async run(agentIds: string[], scope: Scope, signal?: AbortSignal): Promise<ReactiveRunResult> {
    const definitions = this.buildDefinitions(agentIds);
    const results: SequenceResult[] = [];
    const lastSatisfied = new Map<string, boolean>();
    const maxIterations = this.config.maxIterations ?? 100;
    let iterations = 0;

    while (!signal?.aborted && iterations < maxIterations) {
      iterations += 1;

      const evaluations = new Map<string, boolean>();
      const runnable: ReactiveAgentDefinition[] = [];

      for (const definition of definitions) {
        const satisfied = this.config.conditionEngine.evaluate(definition.condition, scope);
        evaluations.set(definition.agent.id, satisfied);

        if (satisfied && !(lastSatisfied.get(definition.agent.id) ?? false)) {
          runnable.push(definition);
        }
      }

      for (const definition of definitions) {
        lastSatisfied.set(definition.agent.id, evaluations.get(definition.agent.id) ?? false);
      }

      if (runnable.length === 0) {
        return { results, iterations, converged: true };
      }

      runnable.sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return a.order - b.order;
      });

      for (const definition of runnable) {
        if (signal?.aborted) {
          break;
        }

        const result = await this.runAgent(definition.agent, scope, signal);
        results.push(result);
      }
    }

    return {
      results,
      iterations,
      converged: false,
    };
  }

  private buildDefinitions(agentIds: string[]): ReactiveAgentDefinition[] {
    const definitions: ReactiveAgentDefinition[] = [];

    for (const [order, agentId] of agentIds.entries()) {
      const agent = this.config.resolveAgent(agentId);
      if (!agent?.manifest.reactive) {
        continue;
      }

      const trigger = agent.manifest.reactive;
      definitions.push({
        agent,
        condition: this.config.conditionEngine.parseExpression(trigger.when),
        order,
        priority: trigger.priority ?? 0,
      });
    }

    return definitions;
  }

  private async runAgent(agent: Agent, scope: Scope, signal?: AbortSignal): Promise<SequenceResult> {
    const startTime = Date.now();
    const agentScope = scope.clone(agent.id);

    try {
      const result = await agent.execute(agentScope, signal);
      return this.toSequenceResult(agent.id, result, startTime, scope, agentScope);
    } catch (error) {
      return {
        agentId: agent.id,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  private toSequenceResult(
    agentId: string,
    result: AgentResult,
    startTime: number,
    scope: Scope,
    agentScope: Scope,
  ): SequenceResult {
    const duration = Date.now() - startTime;

    if (result.status === 'aborted') {
      return { agentId, status: 'aborted', duration };
    }

    if (result.status === 'failed') {
      this.mergeScope(scope, agentScope);
      return {
        agentId,
        status: 'failed',
        error: result.error,
        output: result.output,
        duration,
      };
    }

    this.mergeScope(scope, agentScope);
    return {
      agentId,
      status: 'success',
      output: result.output,
      duration,
    };
  }

  private mergeScope(parent: Scope, child: Scope): void {
    if (child.blackboard.task.output !== undefined) {
      parent.blackboard.task.output = child.blackboard.task.output;
    }
    if (child.blackboard.task.error !== undefined) {
      parent.blackboard.task.error = child.blackboard.task.error;
    }
    parent.blackboard.task.status = child.blackboard.task.status;
    parent.blackboard.warnings.push(...child.blackboard.warnings);
    parent.cabinet.merge(child.cabinet, 'overwrite');
  }
}
