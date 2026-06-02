/**
 * Job Agent — task execution via LLM.
 *
 * Type: LLM
 * Purpose: Execute the actual task — the thing the system was asked to do.
 * Learning channels: suggestions-file (for prompt tweaks)
 */

import type { Agent, AgentManifest, AgentResult, ExecutionScope, LLMProvider } from '../../types/index.ts';

export const jobAgentManifest: AgentManifest = {
  id: 'job-agent',
  type: 'llm',
  version: '0.1.0',
  purpose: 'Task execution via LLM',
  learning: {
    channels: [{ type: 'suggestions-file', handler: async () => {} }],
  },
};

const EXECUTION_PROMPT = `You are a task execution agent. Your job is to complete the given task.

Rules:
- Focus exclusively on completing the stated task.
- Stay within the identity constraints provided.
- Provide a clear, complete response.
- If the task is impossible or unclear, explain why.`;

export function createJobAgent(provider: LLMProvider): Agent {
  return {
    id: 'job-agent',
    manifest: jobAgentManifest,

    async execute(context: ExecutionScope, signal?: AbortSignal): Promise<AgentResult> {
      if (signal?.aborted) return { status: 'aborted' };

      const warnings = context.blackboard.warnings;
      const constraints = context.blackboard.identity.constraints;

      const systemPrompt = [
        EXECUTION_PROMPT,
        ...(constraints.length > 0 ? ['\nIdentity constraints:\n' + constraints.map((c, i) => `${i + 1}. ${c}`).join('\n')] : []),
        ...(warnings.length > 0 ? ['\nWarnings from previous steps:\n' + warnings.join('\n')] : []),
      ].join('\n');

      try {
        const response = await provider.generate(
          systemPrompt,
          context.blackboard.task.input,
          signal,
        );

        if (signal?.aborted) return { status: 'aborted' };

        context.blackboard.setTaskOutput(response.content);
        return { status: 'success', output: response.content };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        context.blackboard.setTaskError(errorMessage);
        return { status: 'failed', error: errorMessage };
      }
    },
  };
}
