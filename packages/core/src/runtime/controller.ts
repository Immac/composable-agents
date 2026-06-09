/**
 * Controller — orchestrates Sequence + Signal + Condition axioms.
 *
 * Creates the execution scope, runs either the sequence or reactive runtime,
 * evaluates reflexes at timing points, and routes lessons.
 */

import type {
  Agent,
  ExecutionScope,
  Lesson,
  LessonHandler,
  ReflexRule,
  SequenceResult,
  SequenceStep,
} from '../types/index.ts';

import { SequenceEngine } from './sequence-engine.ts';
import { ReactiveEngine } from './reactive-engine.ts';
import { ReflexEngine, LessonRouter } from './signal-bus.ts';
import type { ConditionEngine } from './condition-engine.ts';
import { Scope } from '../context/scope.ts';
import { BlackboardImpl } from '../context/blackboard.ts';

export interface ControllerConfig {
  identity?: {
    name: string;
    constraints: string[];
    values: string[];
  };
}

export interface RuntimeModeOptions {
  mode?: 'sequence' | 'reactive';
  maxIterations?: number;
}

export interface RunOptions {
  pipeline?: SequenceStep[];
  agents: Map<string, Agent>;
  conditionEngine: ConditionEngine;
  reflexes?: ReflexRule[];
  lessonHandlers?: Map<string, LessonHandler>;
  maxCycles?: number;
  config?: ControllerConfig;
  runtime?: RuntimeModeOptions;
}

export interface RunResult {
  output: string | null;
  status: 'complete' | 'failed' | 'rejected';
  history: { agentId: string; status: string; timestamp: number }[];
  lessons: Lesson[];
  error?: string;
}

export class Controller {
  async run(task: string, options: RunOptions, signal?: AbortSignal): Promise<RunResult> {
    const { pipeline, agents, conditionEngine, reflexes, lessonHandlers, maxCycles, runtime } = options;
    const identity = options.config?.identity ?? {
      name: 'Agent',
      constraints: ['Never claim to be human', 'Never execute code without explicit user approval'],
      values: ['Accuracy', 'Clarity'],
    };

    const scope = new Scope('root', new BlackboardImpl(identity, task));
    const reflexEngine = new ReflexEngine();
    const lessonRouter = new LessonRouter();
    const resolveAgent = (id: string) => agents.get(id);
    const sequenceEngine = new SequenceEngine({ resolveAgent });
    const reactiveEngine = new ReactiveEngine({
      resolveAgent,
      conditionEngine,
      maxIterations: runtime?.maxIterations,
    });

    // Register reflexes
    if (reflexes) {
      reflexEngine.addRules(reflexes);
    }

    // Register lesson handlers
    if (lessonHandlers) {
      for (const [agentId, handler] of lessonHandlers) {
        lessonRouter.register(agentId, async (lesson) => {
          await handler(lesson, scope as unknown as ExecutionScope);
        });
      }
    }

    const allLessons: Lesson[] = [];
    const history: { agentId: string; status: string; timestamp: number }[] = [];
    const cycles = maxCycles ?? 1;

    for (let cycle = 0; cycle < cycles; cycle++) {
      if (signal?.aborted) break;

      // Pre-cycle reflexes
      if (reflexEngine.evaluate('pre-cycle', '*', (cond) =>
        conditionEngine.evaluate(conditionEngine.parseExpression(cond), scope),
      ).some((a) => a.action === 'abort-agent')) {
        break;
      }

      const executionResults = await this.runRuntime(
        runtime?.mode ?? 'sequence',
        pipeline ?? [],
        Array.from(agents.keys()),
        scope,
        sequenceEngine,
        reactiveEngine,
        signal,
      );

      // Record history and evaluate post-agent reflexes
      let hasFatalFailure = false;
      for (const r of executionResults) {
        history.push({ agentId: r.agentId, status: r.status, timestamp: Date.now() });
        if (r.status === 'failed' && !hasFatalFailure) {
          scope.blackboard.setTaskError(r.error ?? 'Agent execution failed');
          hasFatalFailure = true;
        }

        // Post-agent reflexes — evaluate after each step
        const postAgentActions = reflexEngine.evaluate('post-agent', r.agentId, (cond) =>
          conditionEngine.evaluate(conditionEngine.parseExpression(cond), scope),
        );
        for (const action of postAgentActions) {
          if (action.action === 'discard-output') {
            scope.blackboard.task.output = undefined;
            scope.cabinet.clear();
          } else if (action.action === 'rollback') {
            // Rollback handled by caller — mark as rejected
            hasFatalFailure = true;
          }
        }
      }

      // Post-cycle reflexes
      let abortCycle = false;
      const postCycleActions = reflexEngine.evaluate('post-cycle', '*', (cond) =>
        conditionEngine.evaluate(conditionEngine.parseExpression(cond), scope),
      );
      for (const action of postCycleActions) {
        if (action.action === 'abort-agent') {
          abortCycle = true;
        } else if (action.action === 'discard-output') {
          scope.blackboard.task.output = undefined;
          if (scope.blackboard.task.error) {
            scope.blackboard.task.error = undefined;
            scope.blackboard.task.status = 'pending';
          }
        }
      }
      if (abortCycle) break;
    }

    return {
      output: scope.blackboard.task.output ?? null,
      status: scope.blackboard.task.status === 'failed' ? 'failed' : 'complete',
      history,
      lessons: allLessons,
      error: scope.blackboard.task.error,
    };
  }

  private async runRuntime(
    mode: 'sequence' | 'reactive',
    pipeline: SequenceStep[],
    agentIds: string[],
    scope: Scope,
    sequenceEngine: SequenceEngine,
    reactiveEngine: ReactiveEngine,
    signal?: AbortSignal,
  ): Promise<SequenceResult[]> {
    if (mode === 'reactive') {
      const reactiveResult = await reactiveEngine.run(agentIds, scope, signal);
      return reactiveResult.results;
    }

    return sequenceEngine.run(pipeline, scope, signal);
  }
}
