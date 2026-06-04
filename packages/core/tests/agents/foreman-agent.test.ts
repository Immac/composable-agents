import { describe, it, expect } from 'vitest';
import { createForemanAgent } from '../../src/agents/foreman/index';
import { Scope } from '../../src/context/scope';
import { BlackboardImpl } from '../../src/context/blackboard';
import { CabinetImpl } from '../../src/context/cabinet';
import type { Agent, AgentResult, ExecutionScope, ForemanConfig } from '../../src/types/index';

const testIdentity = {
  name: 'ForemanTest',
  constraints: [],
  values: [],
};

function createFakeAgent(id: string, result: AgentResult = { status: 'success', output: `${id}-done` }): Agent {
  return {
    id,
    manifest: { id, type: 'code', version: '0.1.0', purpose: 'test', learning: { channels: [] } },
    async execute(): Promise<AgentResult> {
      return result;
    },
  };
}

function createScoringAgent(id: string, scoreKey: string, score: number): Agent {
  return {
    id,
    manifest: { id, type: 'code', version: '0.1.0', purpose: 'test', learning: { channels: [] } },
    async execute(ctx: ExecutionScope): Promise<AgentResult> {
      ctx.cabinet.put(scoreKey, score);
      return { status: 'success', output: `${id}-scored` };
    },
  };
}

function createRevisionAgent(id: string, key: string, value: string): Agent {
  return {
    id,
    manifest: { id, type: 'code', version: '0.1.0', purpose: 'test', learning: { channels: [] } },
    async execute(ctx: ExecutionScope): Promise<AgentResult> {
      ctx.cabinet.put(key, value);
      return { status: 'success', output: `${id}-revised` };
    },
  };
}

function createScope(foremanConfig: ForemanConfig): Scope {
  const bb = new BlackboardImpl(testIdentity, 'test foreman');
  const cab = new CabinetImpl();
  cab.put('foreman/config', foremanConfig);
  return new Scope('foreman', bb, cab);
}

describe('ForemanAgent', () => {
  it('runs pipeline agents in sequence', async () => {
    const calls: string[] = [];
    const agent1 = createFakeAgent('alpha');
    const agent2 = createFakeAgent('beta');
    // Wrap to track order
    const alpha: Agent = {
      ...agent1,
      async execute(): Promise<AgentResult> {
        calls.push('alpha');
        return agent1.execute();
      },
    };
    const beta: Agent = {
      ...agent2,
      async execute(): Promise<AgentResult> {
        calls.push('beta');
        return agent2.execute();
      },
    };

    const foreman = createForemanAgent({
      resolveAgent: (id) => (id === 'alpha' ? alpha : id === 'beta' ? beta : undefined),
    });

    const scope = createScope({
      pipeline: [{ agent: 'alpha' }, { agent: 'beta' }],
      maxCycles: 1,
      products: [],
      critics: [],
      revision: [],
      approval: [],
      scoreHistoryKey: 'foreman/scores',
      plateauWindow: 3,
    });

    const result = await foreman.execute(scope);
    expect(result.status).toBe('success');
    expect(calls).toEqual(['alpha', 'beta']);
  });

  it('approves when all gates pass', async () => {
    const foreman = createForemanAgent({
      resolveAgent: (id) =>
        id === 'pipeline-agent' ? createFakeAgent('pipeline-agent') :
        id === 'critic' ? createScoringAgent('critic', 'foreman/quality', 95) :
        undefined,
    });

    const scope = createScope({
      pipeline: [{ agent: 'pipeline-agent' }],
      critics: ['critic'],
      revision: [],
      approval: [{ source: 'foreman/quality', min: 80 }],
      maxCycles: 10,
      products: [],
      scoreHistoryKey: 'foreman/scores',
      plateauWindow: 3,
    });

    const result = await foreman.execute(scope);
    expect(result.status).toBe('success');
    const out = JSON.parse(result.output!);
    expect(out.approved).toBe(true);
    expect(out.cycle).toBe(1);
  });

  it('rejects when below threshold and revises', async () => {
    let reviseCount = 0;

    const foreman = createForemanAgent({
      resolveAgent: (id) =>
        id === 'pipeline-agent' ? createFakeAgent('pipeline-agent') :
        id === 'critic' ? createScoringAgent('critic', 'foreman/score', 50) :
        id === 'reviser' ? {
          id: 'reviser',
          manifest: {
            id: 'reviser', type: 'code', version: '0.1.0', purpose: 'revision',
            learning: { channels: [] },
          },
          async execute(): Promise<AgentResult> {
            reviseCount++;
            return { status: 'success', output: 'revised' };
          },
        } : undefined,
    });

    const scope = createScope({
      pipeline: [{ agent: 'pipeline-agent' }],
      critics: ['critic'],
      revision: ['reviser'],
      approval: [{ source: 'foreman/score', min: 80 }],
      maxCycles: 3,
      products: [],
      scoreHistoryKey: 'foreman/scores',
      plateauWindow: 3,
    });

    const result = await foreman.execute(scope);
    expect(result.status).toBe('success');
    // Score never passes 50, so it should run max cycles
    expect(reviseCount).toBeGreaterThanOrEqual(2);
  });

  it('detects plateau and accepts if past half max cycles', async () => {
    const foreman = createForemanAgent({
      resolveAgent: (id) =>
        id === 'pipeline-agent' ? createFakeAgent('pipeline-agent') :
        id === 'critic' ? createScoringAgent('critic', 'foreman/score', 70) :
        id === 'reviser' ? {
          id: 'reviser',
          manifest: {
            id: 'reviser', type: 'code', version: '0.1.0', purpose: 'revision',
            learning: { channels: [] },
          },
          async execute(): Promise<AgentResult> {
            return { status: 'success', output: 'revised' };
          },
        } : undefined,
    });

    const scope = createScope({
      pipeline: [{ agent: 'pipeline-agent' }],
      critics: ['critic'],
      revision: ['reviser'],
      approval: [{ source: 'foreman/score', min: 80 }],
      maxCycles: 10,
      products: [],
      scoreHistoryKey: 'foreman/scores',
      plateauWindow: 3,
    });

    const result = await foreman.execute(scope);
    expect(result.status).toBe('success');
    const out = JSON.parse(result.output!);
    // Should plateau and accept (70 < 80, flat, past half max cycles)
    expect(out.plateau).toBe(true);
    expect(out.approved).toBe(false);
  });

  it('aborts on signal', async () => {
    const foreman = createForemanAgent({ resolveAgent: () => undefined });
    const ac = new AbortController();
    ac.abort();
    const scope = createScope({
      pipeline: [{ agent: 'alpha' }],
      maxCycles: 1,
      products: [],
      critics: [],
      revision: [],
      approval: [],
      scoreHistoryKey: 'foreman/scores',
      plateauWindow: 3,
    });
    const result = await foreman.execute(scope, ac.signal);
    expect(result.status).toBe('aborted');
  });

  it('fails on empty pipeline', async () => {
    const foreman = createForemanAgent({ resolveAgent: () => undefined });
    const scope = createScope({} as ForemanConfig);
    const result = await foreman.execute(scope);
    expect(result.status).toBe('failed');
  });

  it('waits for cabinet keys before running a step', async () => {
    const calls: string[] = [];
    const waiter: Agent = {
      id: 'waiter',
      manifest: { id: 'waiter', type: 'code', version: '0.1.0', purpose: 'test', learning: { channels: [] } },
      async execute(): Promise<AgentResult> {
        calls.push('waiter');
        return { status: 'success' };
      },
    };

    const foreman = createForemanAgent({
      resolveAgent: (id) => (id === 'waiter' ? waiter : undefined),
    });

    // Key exists, so step runs
    const scope = createScope({
      pipeline: [{ agent: 'waiter', waitFor: ['some/key'] }],
      maxCycles: 1,
      products: [],
      critics: [],
      revision: [],
      approval: [],
      scoreHistoryKey: 'foreman/scores',
      plateauWindow: 3,
    });
    scope.cabinet.put('some/key', 'present');

    const result = await foreman.execute(scope);
    expect(result.status).toBe('success');
    expect(calls).toEqual(['waiter']);
  });

  it('stores score history in cabinet', async () => {
    const foreman = createForemanAgent({
      resolveAgent: (id) =>
        id === 'pipeline-agent' ? createFakeAgent('pipeline-agent') :
        id === 'critic' ? createScoringAgent('critic', 'foreman/score', 85) :
        undefined,
    });

    const scope = createScope({
      pipeline: [{ agent: 'pipeline-agent' }],
      critics: ['critic'],
      revision: [],
      approval: [{ source: 'foreman/score', min: 80 }],
      maxCycles: 5,
      products: [],
      scoreHistoryKey: 'foreman/scores',
      plateauWindow: 3,
    });

    await foreman.execute(scope);
    const history = scope.cabinet.get('foreman/scores') as any[];
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBe(1);
    expect(history[0].cycle).toBe(1);
    expect(history[0].scores['foreman/score']).toBe(85);
    expect(history[0].status).toBe('approved');
  });
});
