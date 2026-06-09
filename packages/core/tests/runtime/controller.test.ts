import { describe, it, expect } from 'vitest';
import { Controller } from '../../src/runtime/controller.ts';
import { ConditionEngine } from '../../src/runtime/condition-engine.ts';
import { builtinEvaluators } from '../../src/conditions/built-in.ts';
import type { Agent, AgentResult, ExecutionScope, ReactiveConfig } from '../../src/types/index.ts';

function createMockAgent(id: string, result?: Partial<AgentResult>): Agent {
  return {
    id,
    manifest: { id, type: 'code', version: '0.1.0', purpose: 'test', learning: { channels: [] } },
    async execute(scope: ExecutionScope, _signal?: AbortSignal): Promise<AgentResult> {
      scope.blackboard.task = { ...scope.blackboard.task, output: `${id}: done`, status: 'complete' };
      return { status: 'success', output: `${id}: done`, ...result };
    },
  };
}

function createReactiveAgent(
  id: string,
  reactive: ReactiveConfig,
  execute: (scope: ExecutionScope) => Promise<AgentResult> | AgentResult,
): Agent {
  return {
    id,
    manifest: {
      id,
      type: 'code',
      version: '0.1.0',
      purpose: 'reactive test',
      learning: { channels: [] },
      reactive,
    },
    async execute(scope: ExecutionScope): Promise<AgentResult> {
      return execute(scope);
    },
  };
}

describe('Controller', () => {
  it('runs a simple pipeline', async () => {
    const ctrl = new Controller();
    const conditionEngine = new ConditionEngine();
    const agents = new Map<string, Agent>();
    agents.set('test', createMockAgent('test'));

    const result = await ctrl.run('hello', {
      pipeline: [{ agent: 'test' }],
      agents,
      conditionEngine,
    });

    expect(result.status).toBe('complete');
    expect(result.output).toBe('test: done');
    expect(result.history).toHaveLength(1);
  });

  it('runs multiple agents in sequence', async () => {
    const ctrl = new Controller();
    const conditionEngine = new ConditionEngine();
    const agents = new Map<string, Agent>();
    agents.set('a', createMockAgent('a'));
    agents.set('b', createMockAgent('b'));

    const result = await ctrl.run('task', {
      pipeline: [{ agent: 'a' }, { agent: 'b' }],
      agents,
      conditionEngine,
    });

    expect(result.status).toBe('complete');
    expect(result.history).toHaveLength(2);
    expect(result.history[0]?.agentId).toBe('a');
    expect(result.history[1]?.agentId).toBe('b');
  });

  it('handles missing agent gracefully', async () => {
    const ctrl = new Controller();
    const conditionEngine = new ConditionEngine();
    const agents = new Map<string, Agent>();

    const result = await ctrl.run('task', {
      pipeline: [{ agent: 'missing' }],
      agents,
      conditionEngine,
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('No agent registered');
  });

  it('handles agent failure with halt policy', async () => {
    const ctrl = new Controller();
    const conditionEngine = new ConditionEngine();
    const agents = new Map<string, Agent>();
    agents.set('a', createMockAgent('a'));
    agents.set('fail', {
      id: 'fail',
      manifest: { id: 'fail', type: 'code', version: '0.1.0', purpose: 'test', learning: { channels: [] } },
      async execute(): Promise<AgentResult> {
        return { status: 'failed', error: 'intentional failure' };
      },
    });

    const result = await ctrl.run('task', {
      pipeline: [
        { agent: 'a' },
        { agent: 'fail', onError: 'halt' as const },
      ],
      agents,
      conditionEngine,
    });

    expect(result.status).toBe('failed');
  });

  it('respects abort signal', async () => {
    const ctrl = new Controller();
    const conditionEngine = new ConditionEngine();
    const agents = new Map<string, Agent>();
    agents.set('a', createMockAgent('a'));

    const ac = new AbortController();
    ac.abort();
    const result = await ctrl.run('task', {
      pipeline: [{ agent: 'a' }],
      agents,
      conditionEngine,
    }, ac.signal);

    expect(result.output).toBeNull();
  });

  it('runs multiple cycles', async () => {
    const ctrl = new Controller();
    const conditionEngine = new ConditionEngine();
    const agents = new Map<string, Agent>();
    agents.set('a', createMockAgent('a'));

    const result = await ctrl.run('task', {
      pipeline: [{ agent: 'a' }],
      agents,
      conditionEngine,
      maxCycles: 3,
    });

    expect(result.history).toHaveLength(3);
  });

  it('runs reactive agents until convergence', async () => {
    const ctrl = new Controller();
    const conditionEngine = new ConditionEngine();
    conditionEngine.registerAll(builtinEvaluators);

    const agents = new Map<string, Agent>();
    agents.set('classify', createReactiveAgent(
      'classify',
      { when: 'task-contains(text=bug)', priority: 10 },
      (scope) => {
        scope.cabinet.put('bug/classification', 'confirmed');
        scope.blackboard.task = { ...scope.blackboard.task, output: 'classified', status: 'complete' };
        return { status: 'success', output: 'classified' };
      },
    ));
    agents.set('fix', createReactiveAgent(
      'fix',
      { when: 'cabinet-exists(path=bug/classification)', priority: 5 },
      (scope) => {
        scope.cabinet.put('bug/fix', 'done');
        scope.blackboard.task = { ...scope.blackboard.task, output: 'bug fixed', status: 'complete' };
        return { status: 'success', output: 'bug fixed' };
      },
    ));

    const result = await ctrl.run('bug report', {
      agents,
      conditionEngine,
      runtime: { mode: 'reactive' },
    });

    expect(result.status).toBe('complete');
    expect(result.output).toBe('bug fixed');
    expect(result.history.map((entry) => entry.agentId)).toEqual(['classify', 'fix']);
  });
});
