/**
 * Story Writer Agent
 *
 * Reads the story concept and writes complete narrative prose.
 *
 * Cabinet input:  story/concept
 * Cabinet output: story/draft (full prose text)
 */

import type { Agent, AgentManifest, AgentResult, ExecutionScope, LLMProvider } from 'composable-agents';

export const storyWriterManifest: AgentManifest = {
  id: 'story-writer',
  type: 'llm',
  version: '0.1.0',
  purpose: 'Write narrative prose from story concept',
  learning: { channels: [] },
};

const SYSTEM = `You are a fiction writer. Given a story concept (genre, tone, setting, characters, acts), write the full narrative prose.

Requirements:
- Follow the concept's genre, tone, and voice exactly
- Include all characters from the concept with their arcs
- Cover all acts and scenes from the outline
- Write vivid, engaging prose with sensory detail
- Use proper paragraph structure and dialogue formatting
- Target roughly 150–300 words per scene
- Do NOT include meta-commentary or notes — just the story

Write the complete story as one continuous text with section breaks (---) between acts.`;

export function createStoryWriter(provider: LLMProvider): Agent {
  return {
    id: 'story-writer',
    manifest: storyWriterManifest,

    async execute(context: ExecutionScope, signal?: AbortSignal): Promise<AgentResult> {
      if (signal?.aborted) return { status: 'aborted' };

      const concept = context.cabinet.get('story/concept') as Record<string, unknown> | undefined;
      if (!concept) return { status: 'failed', error: 'No concept — run conceptor first' };

      try {
        const prompt = `Write a story from this concept:\n\n${JSON.stringify(concept, null, 2)}`;
        const response = await provider.generate(SYSTEM, prompt, signal);
        if (signal?.aborted) return { status: 'aborted' };

        context.cabinet.put('story/draft', response.content);
        return { status: 'success', output: `Wrote ${response.content.split(/\s+/).length} words` };
      } catch (err) {
        return { status: 'failed', error: `Writer error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}
