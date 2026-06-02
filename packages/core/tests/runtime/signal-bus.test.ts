import { describe, it, expect } from 'vitest';
import { SignalBusImpl, ReflexEngine, LessonRouter } from '../../src/runtime/signal-bus.ts';
import type { ReflexRule, Lesson } from '../../src/types/index.ts';

describe('SignalBusImpl', () => {
  it('emits and receives signals', () => {
    const bus = new SignalBusImpl();
    const received: string[] = [];
    bus.on('test', (s) => { received.push(s.payload as string); });
    bus.emit({ type: 'test', source: 'me', payload: 'hello', timestamp: Date.now() });
    expect(received).toEqual(['hello']);
  });

  it('supports wildcard subscription', () => {
    const bus = new SignalBusImpl();
    const received: string[] = [];
    bus.on('*', (s) => { received.push(s.type); });
    bus.emit({ type: 'a', source: 'me', payload: null, timestamp: Date.now() });
    bus.emit({ type: 'b', source: 'me', payload: null, timestamp: Date.now() });
    expect(received).toEqual(['a', 'b']);
  });

  it('unsubscribe works', () => {
    const bus = new SignalBusImpl();
    let count = 0;
    const unsub = bus.on('test', () => { count++; });
    bus.emit({ type: 'test', source: 'me', payload: null, timestamp: Date.now() });
    unsub();
    bus.emit({ type: 'test', source: 'me', payload: null, timestamp: Date.now() });
    expect(count).toBe(1);
  });

  it('tracks signal history', () => {
    const bus = new SignalBusImpl();
    bus.emit({ type: 'a', source: 'me', payload: 'x', timestamp: 1 });
    bus.emit({ type: 'b', source: 'me', payload: 'y', timestamp: 2 });
    expect(bus.getHistory()).toHaveLength(2);
    expect(bus.hasReceived('a')).toBe(true);
    expect(bus.hasReceived('c')).toBe(false);
  });

  it('clears subscriptions and history', () => {
    const bus = new SignalBusImpl();
    bus.on('test', () => {});
    bus.emit({ type: 'test', source: 'me', payload: null, timestamp: Date.now() });
    bus.clear();
    expect(bus.getHistory()).toHaveLength(0);
  });
});

describe('ReflexEngine', () => {
  it('evaluates matching reflex', () => {
    const engine = new ReflexEngine();
    engine.addRule({
      id: 'test-rule',
      timing: 'pre-agent',
      condition: 'has-error',
      action: 'skip-agent',
      triggerCount: 0,
    });

    const actions = engine.evaluate('pre-agent', 'job-agent', (cond) => cond === 'has-error');
    expect(actions).toHaveLength(1);
    expect(actions[0]?.action).toBe('skip-agent');
  });

  it('does not fire on non-matching condition', () => {
    const engine = new ReflexEngine();
    engine.addRule({
      id: 'test-rule',
      timing: 'pre-agent',
      condition: 'has-error',
      action: 'skip-agent',
      triggerCount: 0,
    });

    const actions = engine.evaluate('pre-agent', 'job-agent', () => false);
    expect(actions).toHaveLength(0);
  });

  it('filters by timing', () => {
    const engine = new ReflexEngine();
    engine.addRule({
      id: 'pre', timing: 'pre-agent', condition: 'true', action: 'warn', triggerCount: 0,
    });
    engine.addRule({
      id: 'post', timing: 'post-agent', condition: 'true', action: 'warn', triggerCount: 0,
    });

    const preActions = engine.evaluate('pre-agent', 'agent', () => true);
    expect(preActions).toHaveLength(1);
    expect(preActions[0]?.ruleId).toBe('pre');

    const postActions = engine.evaluate('post-agent', 'agent', () => true);
    expect(postActions).toHaveLength(1);
    expect(postActions[0]?.ruleId).toBe('post');
  });

  it('filters by target agent', () => {
    const engine = new ReflexEngine();
    engine.addRule({
      id: 'only-job', timing: 'pre-agent', condition: 'true', action: 'warn',
      target: 'job-agent', triggerCount: 0,
    });

    const jobActions = engine.evaluate('pre-agent', 'job-agent', () => true);
    expect(jobActions).toHaveLength(1);

    const idActions = engine.evaluate('pre-agent', 'id-agent', () => true);
    expect(idActions).toHaveLength(0);
  });

  it('increments trigger count', () => {
    const engine = new ReflexEngine();
    engine.addRule({
      id: 'counter', timing: 'pre-agent', condition: 'true', action: 'warn', triggerCount: 0,
    });
    engine.evaluate('pre-agent', 'agent', () => true);
    engine.evaluate('pre-agent', 'agent', () => true);
    expect(engine.getRules('pre-agent')[0]?.triggerCount).toBe(2);
  });
});

describe('LessonRouter', () => {
  it('routes lesson to registered handler', async () => {
    const router = new LessonRouter();
    const received: Lesson[] = [];
    router.register('target-agent', async (l) => { received.push(l); });

    const lesson: Lesson = {
      id: 'l1', type: 'reflex-def', source: 'learning-agent',
      target: 'target-agent', payload: {}, confidence: 0.9,
      evidence: [], timestamp: Date.now(),
    };

    const delivered = await router.route(lesson);
    expect(delivered).toBe(true);
    expect(received).toHaveLength(1);
  });

  it('returns false for unregistered target', async () => {
    const router = new LessonRouter();
    const lesson: Lesson = {
      id: 'l1', type: 'reflex-def', source: 'learning-agent',
      target: 'unknown-agent', payload: {}, confidence: 0.9,
      evidence: [], timestamp: Date.now(),
    };
    const delivered = await router.route(lesson);
    expect(delivered).toBe(false);
  });

  it('routes multiple lessons', async () => {
    const router = new LessonRouter();
    const received: string[] = [];
    router.register('target', async (l) => { received.push(l.id); });

    const lessons = [
      { id: 'a', type: 'x', source: 's', target: 'target', payload: {}, confidence: 0.5, evidence: [], timestamp: 1 },
      { id: 'b', type: 'x', source: 's', target: 'target', payload: {}, confidence: 0.5, evidence: [], timestamp: 2 },
    ];

    const results = await router.routeAll(lessons);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.delivered)).toBe(true);
  });
});
