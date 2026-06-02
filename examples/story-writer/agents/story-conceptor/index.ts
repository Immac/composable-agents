/**
 * Story Conceptor Agent
 *
 * Takes the user prompt and produces a structured story plan in the cabinet.
 *
 * Cabinet input:  input/prompt (from pipeline context)
 * Cabinet output: story/concept { genre, tone, setting, characters, acts }
 */

import type { Agent, AgentManifest, AgentResult, ExecutionScope, LLMProvider } from 'composable-agents';

export const storyConceptorManifest: AgentManifest = {
  id: 'story-conceptor',
  type: 'llm',
  version: '0.1.0',
  purpose: 'Analyze prompt and produce structured story concept',
  learning: { channels: [] },
};

const SYSTEM = `You are a story conceptor. Given a prompt, produce a structured story plan as JSON.
Output ONLY valid JSON with this exact shape:

{
  "title": "string — evocative title",
  "genre": "string — e.g. sci-fi, fantasy, horror, romance, comedy",
  "tone": "string — e.g. optimistic, bleak, humorous, mysterious",
  "voice": "first-person" | "third-person-limited" | "third-person-omniscient",
  "setting": { "time": "string", "place": "string", "mood": "string" },
  "characters": [
    { "name": "string", "role": "string", "motivation": "string", "arc": "string" }
  ],
  "acts": [
    { "name": "string", "summary": "string", "scenes": ["string scene descriptions"] }
  ]
}

Be creative but follow the shape exactly. Minimum 1 character, minimum 2 acts.`;

export function createStoryConceptor(provider: LLMProvider): Agent {
  return {
    id: 'story-conceptor',
    manifest: storyConceptorManifest,

    async execute(context: ExecutionScope, signal?: AbortSignal): Promise<AgentResult> {
      if (signal?.aborted) return { status: 'aborted' };

      const prompt = (context.cabinet.get('input/prompt') as string) || (context.blackboard.task.input as string) || '';
      if (!prompt.trim()) return { status: 'failed', error: 'Empty prompt' };

      try {
        const response = await provider.generate(SYSTEM, prompt, signal);
        if (signal?.aborted) return { status: 'aborted' };

        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        const concept = JSON.parse(jsonMatch?.[0] ?? response.content);

        // Validate required fields
        if (!concept.genre || !concept.tone || !Array.isArray(concept.characters)) {
          return { status: 'failed', error: 'Concept missing required fields' };
        }

        context.cabinet.put('story/concept', concept);
        return { status: 'success', output: `Concepted: ${concept.title} (${concept.genre}, ${concept.characters.length} characters, ${concept.acts.length} acts)` };
      } catch (err) {
        return { status: 'failed', error: `Conceptor error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}
