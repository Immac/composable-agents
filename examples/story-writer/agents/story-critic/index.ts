/**
 * Story Critic Agent
 *
 * Reviews the draft for issues and produces a polished final version.
 *
 * Cabinet input:  story/draft, story/concept (for reference)
 * Cabinet output: story/final, story/critique
 */

import type { Agent, AgentManifest, AgentResult, ExecutionScope, LLMProvider } from 'composable-agents';

export const storyCriticManifest: AgentManifest = {
  id: 'story-critic',
  type: 'llm',
  version: '0.1.0',
  purpose: 'Review and polish story draft',
  learning: { channels: [] },
};

const SYSTEM = `You are a story editor. Given a draft story and its concept,:

1. Check for continuity errors, tone violations, character voice drift, plot holes
2. Fix grammar, awkward phrasing, pacing issues
3. PRESERVE the author's voice — don't rewrite for style, only for clarity and correctness
4. If the draft is solid, return it with minimal changes

Output your critique first (brief, 2-3 sentences),
then "---FINAL---" on its own line,
then the polished story text.`;

export function createStoryCritic(provider: LLMProvider): Agent {
  return {
    id: 'story-critic',
    manifest: storyCriticManifest,

    async execute(context: ExecutionScope, signal?: AbortSignal): Promise<AgentResult> {
      if (signal?.aborted) return { status: 'aborted' };

      const draft = context.cabinet.get('story/draft') as string | undefined;
      const concept = context.cabinet.get('story/concept') as Record<string, unknown> | undefined;
      if (!draft) return { status: 'failed', error: 'No draft — run writer first' };

      try {
        const prompt = `Concept:\n${JSON.stringify(concept ?? {}, null, 2)}\n\nDraft:\n${draft}`;
        const response = await provider.generate(SYSTEM, prompt, signal);
        if (signal?.aborted) return { status: 'aborted' };

        // Split into critique and final
        const separator = '---FINAL---';
        const sepIdx = response.content.indexOf(separator);
        const critique = sepIdx >= 0 ? response.content.slice(0, sepIdx).trim() : 'No issues found.';
        const final = sepIdx >= 0 ? response.content.slice(sepIdx + separator.length).trim() : response.content.trim();

        context.cabinet.put('story/critique', critique);
        context.cabinet.put('story/final', final);
        return { status: 'success', output: `Critique: ${critique.slice(0, 120)}` };
      } catch (err) {
        return { status: 'failed', error: `Critic error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}
