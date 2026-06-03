/**
 * No AI Slop Critic Agent
 *
 * Detects AI writing patterns in prose using the rules from:
 * https://github.com/realrossmanngroup/no_ai_slop_writing_rules
 *
 * Cabinet input:  story/draft
 * Cabinet output: story/slop-report, story/verdict
 */

import type { Agent, AgentManifest, AgentResult, ExecutionScope, LLMProvider } from 'composable-agents';

export const noAiSlopCriticManifest: AgentManifest = {
  id: 'no-ai-slop-critic',
  type: 'llm',
  version: '0.1.0',
  purpose: 'Detect AI writing patterns and score prose authenticity',
  learning: { channels: [] },
};

const SYSTEM = `You are an editorial AI-detection critic. Your ONLY job is to find AI writing patterns in prose. You are ruthless and specific.

Check for these patterns (in order of severity):

### Critical (P0) — Must fix
1. **Em dashes (—)**: Banned. Every one must go. Use commas, semicolons, periods, or restructure.
2. **Hallucinated markup**: Any oaicite, contentReference, turn0search0, grok_card strings.
3. **Fabricated attributions**: Putting words in named people's mouths without source.

### High (P1) — Should fix
4. **Banned verbs**: delve, leverage, utilize, foster, bolster, underscore, unveil, streamline, navigate, enhance, endeavour, ascertain, elucidate, optimize
5. **Banned adjectives**: robust, comprehensive, pivotal, crucial, vital, transformative, cutting-edge, groundbreaking, innovative, seamless, intricate, nuanced, multifaceted, holistic
6. **Intensifiers**: significantly, dramatically, extremely, truly, incredibly, fundamentally, absolutely, definitely, obviously, essentially
7. **Filler phrases**: "In today's world", "It's important to note", "When it comes to", "That being said", "Furthermore", "Moreover", "In essence"
8. **Weasel words**: may potentially, can help to, might be able to, arguably, it seems, it appears
9. **Structural slop**: Three or more sections with identical paragraph count and sentence rhythm.
10. **Contrasting parallelism overuse**: More than 2 "It's not X. It's Y." patterns per 500 words.
11. **Dramatic headings**: headings that tease or dramatize rather than describe.

### Medium (P2) — Consider fixing
12. **Paragraph uniformity**: All paragraphs within 15% word count of each other.
13. **Sentence length uniformity**: No sentences under 8 words or over 30 words in a 500-word block.
14. **Transition density**: More than 30% of paragraphs begin with a transition word.
15. **Opening-word repetition**: 3+ consecutive paragraphs starting with the same word.
16. **Hedging overload**: More than 3 hedging markers per paragraph.
17. **Metaphorical noun abuse**: "tapestry of", "symphony of", "beacon of", "realm of", "testament to"
18. **Academic tells**: "shed light on", "pave the way for", "a myriad of", "a plethora of"
19. **Inflated symbolism**: "provide a valuable insight", "left an indelible mark", "watershed moment"

### Output format (strict JSON):
{
  "score": 0-100 (100 = perfect human writing, 0 = pure AI slop),
  "verdict": "approved" | "needs-revision",
  "issues": [
    { "rule": "Rule 1: No em dashes", "severity": "P0", "count": 5, "examples": ["exact phrase 1", "exact phrase 2"] },
    { "rule": "Rule 4: No intensifiers", "severity": "P1", "count": 3, "examples": ["significantly", "dramatically"] }
  ],
  "summary": "Brief 1-2 sentence summary of the worst offenders."
}

Score thresholds:
- 85-100: approved (minor issues only)
- 60-84: needs-revision (moderate slop)
- 0-59: needs-revision (heavy slop)

Be ruthless. The whole point is to catch patterns humans miss.`;

export function createNoAiSlopCritic(provider: LLMProvider): Agent {
  return {
    id: 'no-ai-slop-critic',
    manifest: noAiSlopCriticManifest,

    async execute(context: ExecutionScope, signal?: AbortSignal): Promise<AgentResult> {
      if (signal?.aborted) return { status: 'aborted' };

      const draft = context.cabinet.get('story/draft') as string | undefined;
      if (!draft) return { status: 'failed', error: 'No draft to analyze' };

      try {
        const prompt = `Analyze this prose for AI writing patterns. Be specific and ruthless.\n\n${draft}`;
        const response = await provider.generate(SYSTEM, prompt, signal);
        if (signal?.aborted) return { status: 'aborted' };

        // Parse the JSON verdict
        let report = { score: 70, verdict: 'needs-revision' as string, issues: [] as any[], summary: '' };
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            report = JSON.parse(jsonMatch[0]);
          } catch {
            // If JSON fails, try to extract key info
            const scoreMatch = response.content.match(/score[":\s]+(\d+)/i);
            if (scoreMatch) report.score = parseInt(scoreMatch[1]);
            report.summary = response.content.slice(0, 200);
          }
        }

        // Ensure verdict matches score
        if (report.score >= 85) report.verdict = 'approved';
        else report.verdict = 'needs-revision';

        // Count total issues
        const totalIssues = report.issues.reduce((sum: number, i: any) => sum + (i.count || 0), 0);

        context.cabinet.put('story/slop-report', report);
        context.cabinet.put('story/verdict', {
          status: report.verdict,
          issues: report.issues.map((i: any) => `${i.rule} (${i.severity}): ${i.count} instance(s)`),
        });
        // Write a human-readable critique for the revision writer
        const critiqueLines = report.issues.map((i: any) => {
          const examples = i.examples?.length ? ` (e.g. "${i.examples.slice(0, 2).join('", "')}")` : '';
          return `${i.rule} [${i.severity}]: ${i.count} instance(s)${examples}`;
        });
        context.cabinet.put('story/critique', `Slop score: ${report.score}/100.\n\n${critiqueLines.join('\n')}\n\n${report.summary || ''}`);

        return {
          status: 'success',
          output: `Score: ${report.score}/100 — ${report.verdict} (${totalIssues} issues)${report.summary ? ': ' + report.summary.slice(0, 80) : ''}`,
        };
      } catch (err) {
        return { status: 'failed', error: `Slop critic error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}
