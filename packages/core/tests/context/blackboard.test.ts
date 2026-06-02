import { describe, it, expect } from 'vitest';
import { BlackboardImpl } from '../../src/context/blackboard.ts';

const testIdentity = {
  name: 'TestAgent',
  constraints: ['Never claim to be human'],
  values: ['Accuracy'],
};

describe('BlackboardImpl', () => {
  it('initializes with pending status', () => {
    const bb = new BlackboardImpl(testIdentity, 'hello');
    expect(bb.task.status).toBe('pending');
    expect(bb.task.input).toBe('hello');
    expect(bb.task.goal).toBe('hello');
  });

  it('uses goal when provided', () => {
    const bb = new BlackboardImpl(testIdentity, 'hello', 'world');
    expect(bb.task.goal).toBe('world');
  });

  it('sets output and marks complete', () => {
    const bb = new BlackboardImpl(testIdentity, 'test');
    bb.setTaskOutput('result');
    expect(bb.task.output).toBe('result');
    expect(bb.task.status).toBe('complete');
  });

  it('sets error and marks failed', () => {
    const bb = new BlackboardImpl(testIdentity, 'test');
    bb.setTaskError('something broke');
    expect(bb.task.error).toBe('something broke');
    expect(bb.task.status).toBe('failed');
  });

  it('adds warnings', () => {
    const bb = new BlackboardImpl(testIdentity, 'test');
    bb.addWarning('warning 1');
    bb.addWarning('warning 2');
    expect(bb.warnings).toHaveLength(2);
  });

  it('clones independently', () => {
    const bb = new BlackboardImpl(testIdentity, 'test');
    bb.setTaskOutput('original');
    const cloned = bb.clone();
    cloned.setTaskOutput('modified');
    expect(bb.task.output).toBe('original');
    expect(cloned.task.output).toBe('modified');
  });
});
