import { describe, it, expect } from 'vitest';
import { Scope } from '../../src/context/scope.ts';
import { BlackboardImpl } from '../../src/context/blackboard.ts';

const testIdentity = {
  name: 'TestAgent',
  constraints: ['Never claim to be human'],
  values: ['Accuracy'],
};

describe('Scope', () => {
  it('creates scope with blackboard and cabinet', () => {
    const bb = new BlackboardImpl(testIdentity, 'test task');
    const scope = new Scope('test-agent', bb);
    expect(scope.agentId).toBe('test-agent');
    expect(scope.blackboard.task.input).toBe('test task');
  });

  it('snapshot and rollback restores state', () => {
    const bb = new BlackboardImpl(testIdentity, 'original');
    const scope = new Scope('test-agent', bb);
    const snap = scope.snapshot();

    scope.blackboard.setTaskOutput('modified');
    scope.cabinet.put('key', 'value');

    scope.rollback(snap);
    expect(scope.blackboard.task.output).toBeUndefined();
    expect(scope.blackboard.task.input).toBe('original');
    expect(scope.cabinet.exists('key')).toBe(false);
  });

  it('clone creates isolated copy', () => {
    const bb = new BlackboardImpl(testIdentity, 'test');
    const scope = new Scope('parent', bb);
    scope.cabinet.put('shared', 'data');

    const child = scope.clone('child');
    child.blackboard.setTaskOutput('child result');
    child.cabinet.put('private', 'data');

    expect(scope.blackboard.task.output).toBeUndefined();
    expect(child.blackboard.task.output).toBe('child result');
    expect(child.cabinet.exists('private')).toBe(true);
    expect(scope.cabinet.exists('private')).toBe(false);
  });

  it('rollback with invalid snapshot is safe', () => {
    const bb = new BlackboardImpl(testIdentity, 'test');
    const scope = new Scope('test-agent', bb);
    expect(() => scope.rollback('invalid json')).not.toThrow();
  });
});
