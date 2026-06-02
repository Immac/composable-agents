/**
 * Id Agent — identity constraint checking.
 *
 * Type: LLM-backed with keyword fast-path
 * Purpose: Keep the system grounded in who it is — constraints, values, boundaries.
 * Learning channels: none (sacrosanct)
 */

import type { Agent, AgentManifest, AgentResult, ExecutionScope, LLMProvider } from '../../types/index.ts';
import { keywordPreFilter } from './pre-filter.ts';

export const idAgentManifest: AgentManifest = {
  id: 'id-agent',
  type: 'llm',
  version: '0.1.0',
  purpose: 'Identity constraint checking — LLM-backed semantic gate',
  deterministic: {
    pre_checks: [
      { condition: 'task-contains(text=human)', action: 'halt', message: 'Task claims human identity' },
      { condition: 'task-contains(text=execute)', action: 'halt', message: 'Task contains prohibited action keyword' },
      { condition: 'task-contains(text=harmful)', action: 'halt', message: 'Task contains prohibited content' },
    ],
  },
  learning: { channels: [] },
};

const ANALYSIS_PROMPT = `You are an identity constraint gate. Your ONLY job is to analyze a task against a list of identity constraints and determine if the task violates any of them.

Rules:
- You must NEVER execute, generate, or respond to the task itself.
- You must ONLY evaluate whether the task violates the given constraints.
- If the task violates NO constraints, respond with: {"status":"pass","violations":[]}
- If the task violates ONE OR MORE constraints, respond with: {"status":"fail","violations":[{"constraint":"...","reason":"..."}]}
- Be thorough — consider paraphrases, synonyms, and indirect requests.
- Respond with ONLY the JSON. No explanation, no commentary, no additional text.`;

export function createIdAgent(provider: LLMProvider): Agent {
  return {
    id: 'id-agent',
    manifest: idAgentManifest,

    async execute(context: ExecutionScope, signal?: AbortSignal): Promise<AgentResult> {
      if (signal?.aborted) return { status: 'aborted' };

      const { identity, task } = context.blackboard;

      // 1. Keyword pre-filter
      const violation = keywordPreFilter(task.input, task.goal);
      if (violation) {
        return rejectTask(context, violation);
      }

      // 2. LLM semantic check
      if (signal?.aborted) return { status: 'aborted' };

      const constraintList = identity.constraints
        .map((c, i) => `${i + 1}. ${c}`)
        .join('\n');

      try {
        const response = await provider.generate(ANALYSIS_PROMPT,
          `Identity constraints:\n${constraintList}\n\nTask input:\n${task.input}\n\nTask goal:\n${task.goal}`,
          signal,
        );

        if (signal?.aborted) return { status: 'aborted' };

        const parsed = tryParseJson(response.content);
        if (!parsed || parsed.status !== 'fail') {
          return { status: 'success', output: 'All identity constraints satisfied.' };
        }

        const violations = (parsed.violations ?? []) as Array<{ constraint?: string; reason?: string }>;
        const errorMsg = violations.map((v) =>
          `  - Violates "${v.constraint ?? 'unknown'}": ${v.reason ?? 'No reason given'}`,
        ).join('\n');

        context.blackboard.addWarning(`Identity constraint violations detected:\n${errorMsg}`);
        return { status: 'failed', error: `Identity constraint violation: ${errorMsg}` };
      } catch {
        // LLM failed — conservative rejection
        const warning = 'Identity check failed (LLM error), rejecting as precaution.';
        context.blackboard.addWarning(warning);
        return { status: 'failed', error: warning };
      }
    },
  };
}

function rejectTask(context: ExecutionScope, violation: string): AgentResult {
  context.blackboard.addWarning(`Identity constraint violation: ${violation}`);
  return { status: 'failed', error: `Identity constraint violation: ${violation}` };
}

function tryParseJson(text: string): { status?: string; violations?: unknown[] } | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const target = jsonMatch ? jsonMatch[0] : text;
  try {
    return JSON.parse(target);
  } catch {
    return null;
  }
}
