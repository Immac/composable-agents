/**
 * Learning Agent — pattern detection and lesson production.
 *
 * Type: System (code), rule-based for MVP
 * Purpose: Observe history, detect patterns, produce structured lessons.
 * Learning channels: stage-for-review (can receive meta-lessons)
 */

import type { Agent, AgentManifest, AgentResult, Lesson, ExecutionScope, LearningChannel } from '../../types/index.ts';

export const learningAgentManifest: AgentManifest = {
  id: 'learning-agent',
  type: 'code',
  version: '0.1.0',
  purpose: 'Pattern detection and lesson production',
  learning: {
    channels: [{ type: 'stage-for-review', handler: async () => {} }],
  },
  teaches: {
    formats: ['add-reflex', 'modify-prompt'],
    preferredFormat: 'add-reflex',
  },
};

export const learningAgent: Agent = {
  id: 'learning-agent',
  manifest: learningAgentManifest,

  async execute(context: ExecutionScope, _signal?: AbortSignal): Promise<AgentResult> {
    if (_signal?.aborted) return { status: 'aborted' };

    const warnings = context.blackboard.warnings;
    const lessons: Lesson[] = [];

    // Rule: repeated-error — if a warning repeats, suggest a reflex
    const repeatedErrors = findRepeatedPatterns(warnings);
    for (const pattern of repeatedErrors) {
      lessons.push({
        id: generateId(),
        type: 'add-reflex',
        source: 'learning-agent',
        target: 'reflexes-agent',
        payload: {
          condition: `task-contains(text=${pattern})`,
          action: 'warn',
          timing: 'pre-agent',
        },
        confidence: 0.7,
        evidence: [`Pattern "${pattern}" appeared multiple times`],
        timestamp: Date.now(),
      });
    }

    // Store lessons in cabinet for the lesson router to pick up
    if (lessons.length > 0) {
      context.cabinet.put('learning/lessons', lessons);
      context.cabinet.put('learning/lesson-count', lessons.length);
    }

    const summary = lessons.length > 0
      ? `Produced ${lessons.length} lessons: ${lessons.map((l) => l.type).join(', ')}`
      : 'No patterns detected.';

    return { status: 'success', output: summary };
  },
};

function findRepeatedPatterns(warnings: string[]): string[] {
  const patterns: string[] = [];
  const counts = new Map<string, number>();
  const seen = new Set<string>();

  for (const warning of warnings) {
    if (!seen.has(warning)) {
      seen.add(warning);
      counts.set(warning, 1);
    } else {
      const count = (counts.get(warning) ?? 0) + 1;
      counts.set(warning, count);
      if (count >= 3 && !patterns.includes(warning)) {
        // Extract a key phrase from the warning
        const phrase = warning.split(' ').slice(0, 4).join(' ');
        patterns.push(phrase);
      }
    }
  }

  return patterns;
}

function generateId(): string {
  return `lesson-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
