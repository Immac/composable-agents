/**
 * Strategy Analyzer Agent (LLM)
 *
 * Reads edge scan results from the composition-analyzer and decides
 * contain (pad) vs cover (crop). Only runs when edges have important content
 * — the composition-analyzer already pre-chooses cover for uniform edges.
 */

import type { Agent, AgentManifest, AgentResult, ExecutionScope, LLMProvider } from 'composable-agents';
import type { EdgeReport } from '../composition-analyzer/index.ts';

export const strategyAnalyzerManifest: AgentManifest = {
  id: 'strategy-analyzer',
  type: 'llm',
  version: '0.1.0',
  purpose: 'Choose contain vs cover based on edge scan',
  learning: { channels: [{ type: 'modify-prompt', handler: async () => {} }] },
};

export function createStrategyAnalyzer(provider: LLMProvider): Agent {
  return {
    id: 'strategy-analyzer',
    manifest: strategyAnalyzerManifest,

    async execute(context: ExecutionScope, signal?: AbortSignal): Promise<AgentResult> {
      if (signal?.aborted) return { status: 'aborted' };

      // Skip if composition-analyzer already made a decision
      if (context.cabinet.exists('strategy/decision')) {
        return { status: 'success', output: 'Decision already made — skipping' };
      }

      const analysis = context.cabinet.get('composition/analysis') as
        (EdgeReport & { cropInfo: Record<string, number>; ratioChange: number }) | undefined;
      if (!analysis) return { status: 'failed', error: 'No composition analysis' };

      // Estimate padding pixels for contain
      const padTotal = Math.max(0, analysis.snappedHeight - Math.round(analysis.snappedWidth / (analysis.inputWidth / analysis.inputHeight)));

      const prompt = `You are a strategy selector for an image resize pipeline.

The image's aspect ratio changes by ${analysis.ratioChange}% after snapping to 64px boundaries.

Two strategies:
- **contain** (pad): all content preserved, ~${padTotal}px of black bars
- **cover** (crop): ~${analysis.cropInfo.leftPx}px/${analysis.cropInfo.rightPx}px cropped from sides, ${analysis.cropInfo.topPx}px/${analysis.cropInfo.bottomPx}px from top/bottom

Edge scan variance (higher = more content):
- Top: ${analysis.edges.top.toFixed(1)}
- Bottom: ${analysis.edges.bottom.toFixed(1)}
- Left: ${analysis.edges.left.toFixed(1)}
- Right: ${analysis.edges.right.toFixed(1)}

Important edges (contain meaningful content): ${analysis.importantEdges.join(', ') || 'none'}

Reply with ONLY valid JSON:
{"strategy":"contain|cover","confidence":0.0-1.0,"reasoning":"..."}`;

      if (signal?.aborted) return { status: 'aborted' };

      try {
        const response = await provider.generate(
          'You are a precise strategy selector. Respond with ONLY valid JSON.',
          prompt, signal,
        );
        if (signal?.aborted) return { status: 'aborted' };

        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch?.[0] ?? response.content;
        const decision = JSON.parse(jsonStr) as Record<string, unknown>;

        if (!['contain', 'cover'].includes(decision.strategy as string)) {
          decision.strategy = 'contain';
        }

        context.cabinet.put('strategy/decision', {
          ...decision, source: 'strategy-analyzer',
        });
        context.blackboard.setTaskOutput(`Decision: ${decision.strategy}`);
        return { status: 'success', output: `${decision.strategy} (conf: ${decision.confidence})` };
      } catch {
        context.cabinet.put('strategy/decision', {
          strategy: 'contain', confidence: 0.3, reasoning: 'LLM fallback',
          source: 'strategy-analyzer-fallback',
        });
        return { status: 'success', output: 'LLM failed — fallback to contain' };
      }
    },
  };
}
