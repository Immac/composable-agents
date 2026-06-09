import { describe, it, expect } from 'vitest';
import { ReactiveEngine } from '../../src/runtime/reactive-engine.ts';
import { ConditionEngine } from '../../src/runtime/condition-engine.ts';
import { builtinEvaluators } from '../../src/conditions/built-in.ts';
import { Scope } from '../../src/context/scope.ts';
import { BlackboardImpl } from '../../src/context/blackboard.ts';
import type { Agent, AgentResult, ExecutionScope, ReactiveConfig } from '../../src/types/index.ts';

const testIdentity = {
  name: 'ReactiveTest',
  constraints: [],
  values: [],
};

function createScope(task = 'test task'): Scope {
  return new Scope('root', new BlackboardImpl(testIdentity, task));
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

describe('ReactiveEngine', () => {
  it('runs agents whose cabinet trigger is satisfied', async () => {
    const conditionEngine = new ConditionEngine();
    conditionEngine.registerAll(builtinEvaluators);

    const agent = createReactiveAgent(
      'triage',
      { when: 'cabinet-exists(path=bug/classification)' },
      (scope) => {
        scope.cabinet.put('bug/triage', 'ready');
        return { status: 'success', output: 'triaged' };
      },
    );

    const engine = new ReactiveEngine({
      resolveAgent: (id) => (id === 'triage' ? agent : undefined),
      conditionEngine,
    });

    const scope = createScope();
    scope.cabinet.put('bug/classification', 'present');

    const result = await engine.run(['triage'], scope);

    expect(result.converged).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.agentId).toBe('triage');
    expect(scope.cabinet.get('bug/triage')).toBe('ready');
  });

  it('repeats until downstream cabinet triggers converge', async () => {
    const conditionEngine = new ConditionEngine();
    conditionEngine.registerAll(builtinEvaluators);

    const order: string[] = [];
    const agents = new Map<string, Agent>();
    agents.set('classify', createReactiveAgent(
      'classify',
      { when: 'cabinet-exists(path=bug/input)' },
      (scope) => {
        order.push('classify');
        scope.cabinet.put('bug/classification', 'confirmed');
        return { status: 'success', output: 'classified' };
      },
    ));
    agents.set('fix', createReactiveAgent(
      'fix',
      { when: 'cabinet-exists(path=bug/classification)' },
      (scope) => {
        order.push('fix');
        scope.cabinet.put('bug/fix', 'done');
        return { status: 'success', output: 'fixed' };
      },
    ));

    const engine = new ReactiveEngine({
      resolveAgent: (id) => agents.get(id),
      conditionEngine,
    });

    const scope = createScope();
    scope.cabinet.put('bug/input', 'report');

    const result = await engine.run(['classify', 'fix'], scope);

    expect(result.converged).toBe(true);
    expect(result.results.map((entry) => entry.agentId)).toEqual(['classify', 'fix']);
    expect(order).toEqual(['classify', 'fix']);
    expect(scope.cabinet.get('bug/fix')).toBe('done');
  });

  it('uses priority when multiple agents trigger simultaneously', async () => {
    const conditionEngine = new ConditionEngine();
    conditionEngine.registerAll(builtinEvaluators);

    const order: string[] = [];
    const agents = new Map<string, Agent>();
    agents.set('low', createReactiveAgent(
      'low',
      { when: 'cabinet-exists(path=shared/ready)', priority: 1 },
      () => {
        order.push('low');
        return { status: 'success', output: 'low' };
      },
    ));
    agents.set('high', createReactiveAgent(
      'high',
      { when: 'cabinet-exists(path=shared/ready)', priority: 10 },
      () => {
        order.push('high');
        return { status: 'success', output: 'high' };
      },
    ));

    const engine = new ReactiveEngine({
      resolveAgent: (id) => agents.get(id),
      conditionEngine,
    });

    const scope = createScope();
    scope.cabinet.put('shared/ready', true);

    const result = await engine.run(['low', 'high'], scope);

    expect(result.results.map((entry) => entry.agentId)).toEqual(['high', 'low']);
    expect(order).toEqual(['high', 'low']);
  });
});
