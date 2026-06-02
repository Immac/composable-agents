import { describe, it, expect } from 'vitest';
import { builtinEvaluators } from '../../src/conditions/built-in.ts';
import type { ExecutionScope } from '../../src/types/index.ts';

function createScope(overrides?: Partial<ExecutionScope['blackboard']>): ExecutionScope {
  return {
    agentId: 'test',
    blackboard: {
      identity: { name: 'test', constraints: [], values: [] },
      task: { input: 'hello world', goal: 'hello world', status: 'complete', output: 'done' },
      warnings: [],
      ...overrides,
    },
    cabinet: {
      put: () => {},
      get: () => undefined,
      exists: (key: string) => key === 'test/output',
      query: (pattern: string) => pattern === 'test/*' ? [{ key: 'test/output', value: 'data' }] : [],
      remove: () => {},
      clear: () => {},
    },
    snapshot: () => 'snap',
    rollback: () => {},
  } as unknown as ExecutionScope;
}

describe('Built-in condition evaluators', () => {
  const evaluators = new Map(builtinEvaluators.map((e) => [e.type, e]));

  it('has-output returns true when output exists', () => {
    const e = evaluators.get('has-output')!;
    expect(e.evaluate(undefined, createScope())).toBe(true);
    expect(e.evaluate(undefined, createScope({ task: { input: '', goal: '', status: 'pending', output: undefined } }))).toBe(false);
  });

  it('has-error returns true when task has error', () => {
    const e = evaluators.get('has-error')!;
    expect(e.evaluate(undefined, createScope({ task: { input: '', goal: '', status: 'failed', output: undefined, error: 'fail' } }))).toBe(true);
    expect(e.evaluate(undefined, createScope())).toBe(false);
  });

  it('complete returns true when task is complete', () => {
    const e = evaluators.get('complete')!;
    expect(e.evaluate(undefined, createScope())).toBe(true);
    expect(e.evaluate(undefined, createScope({ task: { input: '', goal: '', status: 'pending' } }))).toBe(false);
  });

  it('failed returns true when task is failed', () => {
    const e = evaluators.get('failed')!;
    expect(e.evaluate(undefined, createScope({ task: { input: '', goal: '', status: 'failed' } }))).toBe(true);
    expect(e.evaluate(undefined, createScope())).toBe(false);
  });

  it('has-warnings returns true when warnings exist', () => {
    const e = evaluators.get('has-warnings')!;
    expect(e.evaluate(undefined, createScope({ warnings: ['warning'] }))).toBe(true);
    expect(e.evaluate(undefined, createScope())).toBe(false);
  });

  it('repeated-error checks threshold', () => {
    const e = evaluators.get('repeated-error')!;
    expect(e.evaluate({ threshold: 2 }, createScope({ warnings: ['error: 1', 'error: 2'] }))).toBe(true);
    expect(e.evaluate({ threshold: 3 }, createScope({ warnings: ['error: 1'] }))).toBe(false);
  });

  it('cabinet-exists checks cabinet path', () => {
    const e = evaluators.get('cabinet-exists')!;
    expect(e.evaluate({ path: 'test/*' }, createScope())).toBe(true);
    expect(e.evaluate({ path: 'nonexistent/*' }, createScope())).toBe(false);
  });

  it('task-contains checks task text', () => {
    const e = evaluators.get('task-contains')!;
    expect(e.evaluate({ text: 'hello' }, createScope())).toBe(true);
    expect(e.evaluate({ text: 'missing' }, createScope())).toBe(false);
  });

  it('always-true returns true', () => {
    const e = evaluators.get('always-true')!;
    expect(e.evaluate(undefined, createScope())).toBe(true);
  });

  it('always-false returns false', () => {
    const e = evaluators.get('always-false')!;
    expect(e.evaluate(undefined, createScope())).toBe(false);
  });
});
