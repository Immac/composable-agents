/**
 * Story Critic Agent
 *
 * Reviews the draft for issues and produces a verdict + critique.
 * In iterative mode, the verdict triggers another revision cycle.
 *
 * Cabinet input:  story/draft, story/concept (for reference)
 * Cabinet output: story/critique, story/verdict
 */

import type { Agent, AgentManifest, AgentResult, ExecutionScope, LLMProvider } from 'composable-agents';

export const storyCriticManifest: AgentManifest = {
  id: 'story-critic',
  type: 'llm',
  version: '0.1.0',
  purpose: 'Review story draft and produce verdict + critique',
  learning: { channels: [] },
};

const SYSTEM = `You are a story editor reviewing a draft. You have two jobs:

1. DECIDE: Is the story ready, or does it need revision?
   - "approved" — the story is solid. Minor polish only.
   - "needs-revision" — there are meaningful issues to fix.

2. FEEDBACK: If "needs-revision", list the specific issues to address.

Output format (strict):
First line: a JSON object: {"status":"approved"|"needs-revision","issues":["issue1","issue2"]}
Then "---" on its own line.
Then your critique (2-4 sentences of feedback for the writer).

Rules:
- Be concise. The writer will read your feedback, not a novel.
- Focus on substance: plot holes, character arc gaps, tonal shifts, pacing.
- Do NOT flag style preferences as issues — only flag things that break the story.
- If the draft is good, say so. Don't invent problems.
- Maximum 3 issues per critique. Prioritize the most important.`;

export function createStoryCritic(provider: LLMProvider): Agent {
  return {
    id: 'story-critic',
    manifest: storyCriticManifest,

    async execute(context: ExecutionScope, signal?: AbortSignal): Promise<AgentResult> {
      if (signal?.aborted) return { status: 'aborted' };

      const draft = context.cabinet.get('story/draft') as string | undefined;
      const concept = context.cabinet.get('story/concept') as Record<string, unknown> | undefined;
      if (!draft) return { status: 'failed', error: 'No draft — run writer first' };

      // Count previous revisions
      const revisionCount = (context.cabinet.get('story/revision-count') as number) || 0;

      try {
        const prompt = `Concept:\n${JSON.stringify(concept ?? {}, null, 2)}\n\nDraft (revision ${revisionCount + 1}):\n${draft}`;
        const response = await provider.generate(SYSTEM, prompt, signal);
        if (signal?.aborted) return { status: 'aborted' };

        // Parse the structured output
        const parts = response.content.split('---');
        let verdict = { status: 'approved' as string, issues: [] as string[] };
        let critique = response.content.trim();

        if (parts.length >= 2) {
          // Try to parse the JSON verdict from the first part
          const jsonMatch = parts[0].match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);
              verdict = {
                status: parsed.status === 'needs-revision' ? 'needs-revision' : 'approved',
                issues: Array.isArray(parsed.issues) ? parsed.issues : [],
              };
            } catch {
              // If JSON parsing fails, default to approved
              verdict = { status: 'approved', issues: [] };
            }
          }
          critique = parts.slice(1).join('---').trim();
        }

        // Force approve if max revisions reached (safety valve)
        if (revisionCount >= 2 && verdict.status === 'needs-revision') {
          verdict = { status: 'approved', issues: [...verdict.issues, '(auto-approved: max revisions reached)'] };
        }

        context.cabinet.put('story/critique', critique);
        context.cabinet.put('story/verdict', verdict);
        context.cabinet.put('story/revision-count', revisionCount + 1);

        return {
          status: 'success',
          output: verdict.status === 'approved'
            ? `Approved (revision ${revisionCount + 1})`
            : `Needs revision: ${verdict.issues.join('; ').slice(0, 100)}`,
        };
      } catch (err) {
        return { status: 'failed', error: `Critic error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}
