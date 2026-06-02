import { describe, it, expect } from 'vitest';
import { learningAgent } from '../../src/agents/learning/index.ts';
import { Scope } from '../../src/context/scope.ts';
import { BlackboardImpl } from '../../src/context/blackboard.ts';

const testIdentity = {
  name: 'Persona',
  constraints: [],
  values: [],
};

function createScope(task: string, warnings: string[] = []): Scope {
  const bb = new BlackboardImpl(testIdentity, task);
  for (const w of warnings) bb.addWarning(w);
  return new Scope('learning-agent', bb);
}

describe('LearningAgent', () => {
  it('produces no lessons for clean history', async () => {
    const scope = createScope('test task');
    const result = await learningAgent.execute(scope);
    expect(result.status).toBe('success');
    expect(scope.cabinet.get('learning/lessons')).toBeUndefined();
  });

  it('detects repeated warnings', async () => {
    const scope = createScope('test task', [
      'Error: connection timeout',
      'Error: connection timeout',
      'Error: connection timeout',
    ]);
    const result = await learningAgent.execute(scope);
    expect(result.status).toBe('success');
    const lessons = scope.cabinet.get('learning/lessons') as any[];
    expect(lessons).toBeDefined();
    expect(lessons.length).toBeGreaterThanOrEqual(1);
    expect(lessons[0]?.type).toBe('add-reflex');
    expect(lessons[0]?.target).toBe('reflexes-agent');
  });

  it('produces add-reflex lessons', async () => {
    const scope = createScope('test task', [
      'Warning: deprecated API used',
      'Warning: deprecated API used',
      'Warning: deprecated API used',
    ]);
    await learningAgent.execute(scope);
    const lessons = scope.cabinet.get('learning/lessons') as any[];
    expect(lessons).toBeDefined();
    expect(lessons[0]?.payload.condition).toBeDefined();
    expect(lessons[0]?.payload.action).toBe('warn');
  });

  it('handles empty warnings', async () => {
    const scope = createScope('test task', []);
    const result = await learningAgent.execute(scope);
    expect(result.status).toBe('success');
    expect(result.output).toContain('No patterns detected');
  });

  it('handles abort signal', async () => {
    const ac = new AbortController();
    ac.abort();
    const scope = createScope('test');
    const result = await learningAgent.execute(scope, ac.signal);
    expect(result.status).toBe('aborted');
  });
});
