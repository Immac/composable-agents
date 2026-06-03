/**
 * Story Revision Writer Agent
 *
 * Reads the previous draft + critic feedback and produces a revised draft.
 * Only runs when a draft already exists (first draft was written by story-writer).
 *
 * Cabinet input:  story/draft, story/critique, story/concept (for reference)
 * Cabinet output: story/draft (overwrites with revised version)
 */

import type { Agent, AgentManifest, AgentResult, ExecutionScope, LLMProvider } from 'composable-agents';

export const storyRevisionWriterManifest: AgentManifest = {
  id: 'story-revision-writer',
  type: 'llm',
  version: '0.1.0',
  purpose: 'Revise story draft based on critic feedback',
  learning: { channels: [] },
};

const SYSTEM = `You are a fiction editor revising a story draft. You will receive:
1. The original story concept (for reference)
2. The current draft
3. The critic's feedback

Your job:
- Address every issue the critic raised
- Preserve the author's voice and style — do NOT rewrite for style, only for substance
- Keep what works — the critic may praise parts of the draft; don't change those
- Fix what doesn't — plot holes, character arc gaps, tonal inconsistencies
- If the critic suggests a specific fix, consider it but use your own judgment
- Output the COMPLETE revised story, not a diff or summary

Write the full revised story as one continuous text with section breaks (---) between acts.`;

export function createStoryRevisionWriter(provider: LLMProvider): Agent {
  return {
    id: 'story-revision-writer',
    manifest: storyRevisionWriterManifest,

    async execute(context: ExecutionScope, signal?: AbortSignal): Promise<AgentResult> {
      if (signal?.aborted) return { status: 'aborted' };

      const draft = context.cabinet.get('story/draft') as string | undefined;
      const critique = context.cabinet.get('story/critique') as string | undefined;
      const concept = context.cabinet.get('story/concept') as Record<string, unknown> | undefined;

      if (!draft) return { status: 'failed', error: 'No draft to revise' };
      if (!critique) return { status: 'failed', error: 'No critique to respond to' };

      try {
        const prompt = `Original concept:\n${JSON.stringify(concept ?? {}, null, 2)}\n\nCurrent draft:\n${draft}\n\nCritic's feedback:\n${critique}\n\nWrite the complete revised story.`;
        const response = await provider.generate(SYSTEM, prompt, signal);
        if (signal?.aborted) return { status: 'aborted' };

        context.cabinet.put('story/draft', response.content);
        return { status: 'success', output: `Revised: ${response.content.split(/\s+/).length} words` };
      } catch (err) {
        return { status: 'failed', error: `Revision writer error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}
