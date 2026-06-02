import { describe, it, expect } from 'vitest';
import { createJobAgent } from '../../src/agents/job/index';
import { MockProvider } from '../../src/llm/mock-provider';
import { Scope } from '../../src/context/scope';
import { BlackboardImpl } from '../../src/context/blackboard';

const testIdentity = {
  name: 'Persona',
  constraints: [],
  values: [],
};

function createScope(task: string): Scope {
  const bb = new BlackboardImpl(testIdentity, task);
  return new Scope('job-agent', bb);
}

describe('JobAgent', () => {
  it('executes task via LLM', async () => {
    const agent = createJobAgent(new MockProvider('Hello, world!'));
    const result = await agent.execute(createScope('Say hello'));
    expect(result.status).toBe('success');
    expect(result.output).toBe('Hello, world!');
  });

  it('sets task output on blackboard', async () => {
    const agent = createJobAgent(new MockProvider('Task output'));
    const scope = createScope('Do something');
    await agent.execute(scope);
    expect(scope.blackboard.task.output).toBe('Task output');
    expect(scope.blackboard.task.status).toBe('complete');
  });

  it('handles abort signal', async () => {
    const agent = createJobAgent(new MockProvider());
    const ac = new AbortController();
    ac.abort();
    const result = await agent.execute(createScope('test'), ac.signal);
    expect(result.status).toBe('aborted');
  });

  it('includes warnings in context', async () => {
    const agent = createJobAgent(new MockProvider('Response with context'));
    const scope = createScope('test');
    scope.blackboard.addWarning('Something to note');
    const result = await agent.execute(scope);
    expect(result.status).toBe('success');
  });
});
