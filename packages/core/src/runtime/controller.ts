/**
 * Controller — orchestrates Sequence + Signal + Condition axioms.
 *
 * Creates the execution scope, runs the pipeline through the Sequence Engine,
 * evaluates reflexes at timing points, and routes lessons.
 */

import type {
  Agent,
  ExecutionScope,
  Lesson,
  LessonHandler,
  ReflexRule,
  SequenceStep,
} from '../types/index';

import { SequenceEngine } from './sequence-engine';
import { SignalBusImpl, ReflexEngine, LessonRouter } from './signal-bus';
import type { ConditionEngine } from './condition-engine';
import { Scope } from '../context/scope';
import { BlackboardImpl } from '../context/blackboard';

export interface ControllerConfig {
  identity?: {
    name: string;
    constraints: string[];
    values: string[];
  };
}

export interface RunOptions {
  pipeline: SequenceStep[];
  agents: Map<string, Agent>;
  conditionEngine: ConditionEngine;
  reflexes?: ReflexRule[];
  lessonHandlers?: Map<string, LessonHandler>;
  maxCycles?: number;
  config?: ControllerConfig;
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
    const { pipeline, agents, conditionEngine, reflexes, lessonHandlers, maxCycles } = options;
    const identity = options.config?.identity ?? {
      name: 'Agent',
      constraints: ['Never claim to be human', 'Never execute code without explicit user approval'],
      values: ['Accuracy', 'Clarity'],
    };

    const scope = new Scope('root', new BlackboardImpl(identity, task));
    const signalBus = new SignalBusImpl();
    const reflexEngine = new ReflexEngine();
    const lessonRouter = new LessonRouter();
    const sequenceEngine = new SequenceEngine({
      resolveAgent: (id) => agents.get(id),
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

      // Run pipeline through sequence engine
      const seqResults = await sequenceEngine.run(pipeline, scope, signal);

      // Record history and evaluate post-agent reflexes
      let hasFatalFailure = false;
      for (const r of seqResults) {
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
}
