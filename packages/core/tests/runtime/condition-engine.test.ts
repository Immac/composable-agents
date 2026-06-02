import { describe, it, expect } from 'vitest';
import { ConditionEngine } from '../../src/runtime/condition-engine.ts';
import type { ExecutionScope } from '../../src/types/index.ts';

function createMockScope(overrides?: Partial<ExecutionScope['blackboard']>): ExecutionScope {
  return {
    agentId: 'test',
    blackboard: {
      identity: { name: 'test', constraints: [], values: [] },
      task: { input: 'hello world', goal: 'hello world', status: 'pending' },
      warnings: [],
      ...overrides,
    },
    cabinet: {
      put: () => {},
      get: () => undefined,
      exists: () => false,
      query: () => [],
      remove: () => {},
      clear: () => {},
    },
    snapshot: () => 'snap',
    rollback: () => {},
  } as unknown as ExecutionScope;
}

describe('ConditionEngine', () => {
  it('registers and evaluates a simple condition', () => {
    const engine = new ConditionEngine();
    engine.register({
      type: 'always-true',
      evaluate: () => true,
    });
    expect(engine.evaluate({ type: 'always-true' }, createMockScope())).toBe(true);
  });

  it('returns false for unknown conditions', () => {
    const engine = new ConditionEngine();
    expect(engine.evaluate({ type: 'unknown' }, createMockScope())).toBe(false);
  });

  it('evaluates AND composition', () => {
    const engine = new ConditionEngine();
    engine.registerAll([
      { type: 'true', evaluate: () => true },
      { type: 'false', evaluate: () => false },
    ]);
    expect(engine.evaluate({ and: [{ type: 'true' }, { type: 'true' }] }, createMockScope())).toBe(true);
    expect(engine.evaluate({ and: [{ type: 'true' }, { type: 'false' }] }, createMockScope())).toBe(false);
  });

  it('evaluates OR composition', () => {
    const engine = new ConditionEngine();
    engine.registerAll([
      { type: 'true', evaluate: () => true },
      { type: 'false', evaluate: () => false },
    ]);
    expect(engine.evaluate({ or: [{ type: 'true' }, { type: 'false' }] }, createMockScope())).toBe(true);
    expect(engine.evaluate({ or: [{ type: 'false' }, { type: 'false' }] }, createMockScope())).toBe(false);
  });

  it('evaluates NOT composition', () => {
    const engine = new ConditionEngine();
    engine.register({ type: 'true', evaluate: () => true });
    expect(engine.evaluate({ not: { type: 'true' } }, createMockScope())).toBe(false);
    expect(engine.evaluate({ not: { not: { type: 'true' } } }, createMockScope())).toBe(true);
  });

  it('evaluates nested compositions', () => {
    const engine = new ConditionEngine();
    engine.registerAll([
      { type: 'a', evaluate: () => true },
      { type: 'b', evaluate: () => false },
      { type: 'c', evaluate: () => true },
    ]);
    const condition = {
      and: [
        { type: 'a' },
        { or: [{ type: 'b' }, { type: 'c' }] },
      ],
    };
    expect(engine.evaluate(condition, createMockScope())).toBe(true);
  });

  it('passes params to evaluators', () => {
    const engine = new ConditionEngine();
    const calls: Array<{ params: unknown; scope: unknown }> = [];
    engine.register({
      type: 'check',
      evaluate: (params, scope) => {
        calls.push({ params, scope });
        return true;
      },
    });
    engine.evaluate({ type: 'check', params: { threshold: 3 } }, createMockScope());
    expect(calls).toHaveLength(1);
    expect(calls[0]?.params).toEqual({ threshold: 3 });
  });

  describe('parseExpression', () => {
    it('parses simple condition', () => {
      const engine = new ConditionEngine();
      const result = engine.parseExpression('has-output');
      expect(result).toEqual({ type: 'has-output' });
    });

    it('parses condition with params', () => {
      const engine = new ConditionEngine();
      const result = engine.parseExpression('repeated-error(threshold=3)');
      expect(result).toEqual({ type: 'repeated-error', params: { threshold: 3 } });
    });

    it('parses AND expression', () => {
      const engine = new ConditionEngine();
      const result = engine.parseExpression('has-output AND has-error');
      expect(result).toEqual({
        and: [{ type: 'has-output' }, { type: 'has-error' }],
      });
    });

    it('parses NOT expression', () => {
      const engine = new ConditionEngine();
      const result = engine.parseExpression('NOT has-error');
      expect(result).toEqual({ not: { type: 'has-error' } });
    });

    it('parses complex expression', () => {
      const engine = new ConditionEngine();
      const result = engine.parseExpression('has-output AND NOT has-error OR warnings-count(threshold=3)');
      // AND has higher precedence
      expect(result).toHaveProperty('and');
    });

    it('evaluates parsed expression', () => {
      const engine = new ConditionEngine();
      engine.registerAll([
        { type: 'has-output', evaluate: () => true },
        { type: 'has-error', evaluate: () => false },
      ]);
      const condition = engine.parseExpression('has-output AND NOT has-error');
      expect(engine.evaluate(condition, createMockScope())).toBe(true);
    });
  });
});
