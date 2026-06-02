import { describe, it, expect } from 'vitest';
import { SequenceEngine } from '../../src/runtime/sequence-engine.ts';
import { Scope } from '../../src/context/scope.ts';
import { BlackboardImpl } from '../../src/context/blackboard.ts';
import type { Agent, ExecutionScope, AgentResult } from '../../src/types/index.ts';

const testIdentity = {
  name: 'TestAgent',
  constraints: [],
  values: [],
};

function createAgent(id: string, result?: Partial<AgentResult>): Agent {
  return {
    id,
    manifest: { id, type: 'code', version: '0.1.0', purpose: 'test', learning: { channels: [] } },
    async execute(_scope: ExecutionScope, _signal?: AbortSignal): Promise<AgentResult> {
      return { status: 'success', output: `${id} done`, ...result };
    },
  };
}

function createFailingAgent(id: string, errorMsg = 'oops'): Agent {
  return {
    id,
    manifest: { id, type: 'code', version: '0.1.0', purpose: 'test', learning: { channels: [] } },
    async execute(): Promise<AgentResult> {
      return { status: 'failed', error: errorMsg };
    },
  };
}

function createScope(): Scope {
  const bb = new BlackboardImpl(testIdentity, 'test task');
  return new Scope('root', bb);
}

describe('SequenceEngine', () => {
  it('runs a single agent', async () => {
    const engine = new SequenceEngine({
      resolveAgent: (id) => (id === 'a' ? createAgent('a') : undefined),
    });
    const results = await engine.run([{ agent: 'a' }], createScope());
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('success');
    expect(results[0]?.output).toBe('a done');
  });

  it('runs multiple agents in order', async () => {
    const order: string[] = [];
    const engine = new SequenceEngine({
      resolveAgent: (id) => ({
        id,
        manifest: { id, type: 'code', version: '0.1.0', purpose: 'test', learning: { channels: [] } },
        async execute(): Promise<AgentResult> {
          order.push(id);
          return { status: 'success' as const, output: `${id} done` };
        },
      }),
    });
    await engine.run([{ agent: 'a' }, { agent: 'b' }, { agent: 'c' }], createScope());
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('handles missing agent', async () => {
    const engine = new SequenceEngine({
      resolveAgent: () => undefined,
    });
    const results = await engine.run([{ agent: 'missing' }], createScope());
    expect(results[0]?.status).toBe('failed');
    expect(results[0]?.error).toContain('No agent registered');
  });

  it('handles error with continue policy', async () => {
    const engine = new SequenceEngine({
      resolveAgent: (id) =>
        id === 'fail' ? createFailingAgent('fail') : createAgent(id),
    });
    const results = await engine.run([
      { agent: 'a' },
      { agent: 'fail', onError: 'continue' },
      { agent: 'b' },
    ], createScope());
    expect(results).toHaveLength(3);
    expect(results[0]?.status).toBe('success');
    expect(results[1]?.status).toBe('failed');
    expect(results[2]?.status).toBe('success');
  });

  it('handles error with skip policy (rollback)', async () => {
    const engine = new SequenceEngine({
      resolveAgent: (id) =>
        id === 'fail' ? createFailingAgent('fail') : createAgent(id),
    });
    const results = await engine.run([
      { agent: 'a' },
      { agent: 'fail', onError: 'skip' },
      { agent: 'b' },
    ], createScope());
    expect(results).toHaveLength(3);
    expect(results[1]?.status).toBe('skipped');
  });

  it('handles error with halt policy', async () => {
    const engine = new SequenceEngine({
      resolveAgent: (id) =>
        id === 'fail' ? createFailingAgent('fail') : createAgent(id),
    });
    const results = await engine.run([
      { agent: 'a' },
      { agent: 'fail', onError: 'halt' },
      { agent: 'c' },
    ], createScope());
    // halt stops the pipeline but the failed step is still recorded
    expect(results[results.length - 1]?.status).toBe('failed');
    // c's result should not be present
    const cResult = results.find(r => r.agentId === 'c');
    expect(cResult).toBeUndefined();
  });

  it('respects abort signal', async () => {
    const ac = new AbortController();
    const engine = new SequenceEngine({
      resolveAgent: (id) => createAgent(id),
    });
    ac.abort();
    const results = await engine.run([{ agent: 'a' }], createScope(), ac.signal);
    expect(results).toHaveLength(0);
  });

  it('runs parallel group', async () => {
    const results: string[] = [];
    const engine = new SequenceEngine({
      resolveAgent: (id) => ({
        id,
        manifest: { id, type: 'code', version: '0.1.0', purpose: 'test', learning: { channels: [] } },
        async execute(): Promise<AgentResult> {
          results.push(id);
          return { status: 'success' as const, output: `${id} done` };
        },
      }),
    });
    const seqResults = await engine.run([{
      parallel: {
        run: ['a', 'b'],
        join: 'all',
        merge: { cabinet: 'namespaced' },
      },
    }], createScope());
    expect(results).toContain('a');
    expect(results).toContain('b');
    expect(seqResults).toHaveLength(2);
  });

  it('runs sequential sub-group', async () => {
    const order: string[] = [];
    const engine = new SequenceEngine({
      resolveAgent: (id) => {
        const agent = createAgent(id);
        const origExecute = agent.execute;
        agent.execute = async () => {
          order.push(id);
          return { status: 'success' as const, output: `${id} done` };
        };
        return agent;
      },
    });
    await engine.run([{ sequence: [{ agent: 'a' }, { agent: 'b' }] }], createScope());
    expect(order).toEqual(['a', 'b']);
  });

  it('propagates scope changes to parent', async () => {
    const engine = new SequenceEngine({
      resolveAgent: (id) => ({
        id,
        manifest: { id, type: 'code', version: '0.1.0', purpose: 'test', learning: { channels: [] } },
        async execute(scope: ExecutionScope): Promise<AgentResult> {
          scope.blackboard.task = { ...scope.blackboard.task, output: `${id} result`, status: 'complete' };
          scope.cabinet.put('test/key', `${id} data`);
          return { status: 'success' };
        },
      }),
    });
    const scope = createScope();
    await engine.run([{ agent: 'a' }, { agent: 'b' }], scope);
    expect(scope.blackboard.task.output).toBe('b result');
    expect(scope.cabinet.get('test/key')).toBe('b data');
  });
});
