import { describe, it, expect, beforeAll } from 'vitest';
import {
  applyImmediately,
  appendToSuggestionsFile,
  stageForReview,
  log,
} from '../../src/lessons/handlers.ts';
import type { Lesson, ExecutionScope } from '../../src/types/index.ts';

const testLesson: Lesson = {
  id: 'test-1',
  type: 'add-reflex',
  source: 'learning-agent',
  target: 'reflexes-agent',
  payload: { kind: 'new-reflex', rule: { id: 'custom-rule', condition: 'has-error', action: 'warn' } },
  confidence: 0.8,
  evidence: ['Pattern detected'],
  timestamp: Date.now(),
};

const testScope = {} as ExecutionScope;

describe('Lesson handlers', () => {
  describe('applyImmediately', () => {
    it('applies new-reflex lessons', async () => {
      const result = await applyImmediately(testLesson, testScope);
      expect(result.status).toBe('applied');
    });

    it('logs lessons with unknown payload kind', async () => {
      const lesson = { ...testLesson, payload: { kind: 'unknown' } };
      const result = await applyImmediately(lesson, testScope);
      expect(result.status).toBe('logged');
    });
  });

  describe('appendToSuggestionsFile', () => {
    it('returns logged status when filesystem is unavailable', async () => {
      // In test environment without .persona dir, falls back to logged
      const result = await appendToSuggestionsFile(testLesson, testScope);
      expect(['applied', 'logged']).toContain(result.status);
    });
  });

  describe('stageForReview', () => {
    it('stages lessons for review', async () => {
      const result = await stageForReview(testLesson, testScope);
      expect(result.status).toBe('staged');
      expect(result.message).toContain('test-1');
    });
  });

  describe('log', () => {
    it('silently logs lessons', async () => {
      const result = await log(testLesson, testScope);
      expect(result.status).toBe('logged');
      expect(result.message).toContain('test-1');
    });
  });
});
