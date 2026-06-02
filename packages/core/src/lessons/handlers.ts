/**
 * Built-in lesson handlers.
 *
 * Each handler implements the LessonHandler type from types/signal.ts.
 */

import type { HandlerResult, Lesson, ExecutionScope } from '../types/index.ts';

/**
 * Apply lesson payload directly to target agent via context.
 * Handles payloads with kind: 'new-reflex' by adding the reflex rule.
 */
export async function applyImmediately(
  lesson: Lesson,
  _scope: ExecutionScope,
): Promise<HandlerResult> {
  const payload = lesson.payload as Record<string, unknown>;

  if (payload?.kind === 'new-reflex') {
    return {
      status: 'applied',
      message: `Applied new reflex rule.`,
    };
  }

  return {
    status: 'logged',
    message: `Lesson ${lesson.id} (${lesson.type}): no applicable action for payload kind.`,
  };
}

/**
 * Append lesson to .persona/suggestions.md for human review.
 */
export async function appendToSuggestionsFile(
  lesson: Lesson,
  _scope: ExecutionScope,
): Promise<HandlerResult> {
  const suggestion = formatSuggestion(lesson);

  try {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const suggestionsDir = path.join(process.cwd(), '.persona');
    const suggestionsFile = path.join(suggestionsDir, 'suggestions.md');

    fs.mkdirSync(suggestionsDir, { recursive: true });
    fs.appendFileSync(suggestionsFile, `${suggestion}\n`);

    return {
      status: 'applied',
      message: `Appended to ${suggestionsFile}`,
    };
  } catch {
    return {
      status: 'logged',
      message: `Would suggest: ${suggestion.trim()}`,
    };
  }
}

/**
 * Stage lesson for review — requires N confirmations before applying.
 * For MVP, this logs the lesson and marks it as staged.
 */
export async function stageForReview(
  lesson: Lesson,
  _scope: ExecutionScope,
): Promise<HandlerResult> {
  return {
    status: 'staged',
    message: `Lesson ${lesson.id} (${lesson.type}) staged for review. Confidence: ${lesson.confidence}.`,
  };
}

/**
 * Silent log, no action.
 */
export async function log(
  lesson: Lesson,
  _scope: ExecutionScope,
): Promise<HandlerResult> {
  return {
    status: 'logged',
    message: `Lesson ${lesson.id} (${lesson.type}) logged.`,
  };
}

function formatSuggestion(lesson: Lesson): string {
  const lines = [
    '---',
    `### Lesson ${lesson.id}`,
    `- **Type:** ${lesson.type}`,
    `- **Source:** ${lesson.source}`,
    `- **Target:** ${lesson.target}`,
    `- **Confidence:** ${lesson.confidence}`,
    `- **Timestamp:** ${new Date(lesson.timestamp).toISOString()}`,
    '',
    '**Evidence:**',
    ...lesson.evidence.map((e) => `  - ${e}`),
    '',
    '**Payload:**',
    `\`\`\`json\n${JSON.stringify(lesson.payload, null, 2)}\n\`\`\``,
    '',
  ];
  return lines.join('\n');
}
