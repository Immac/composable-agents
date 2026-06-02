/**
 * Vision Analyzer Agent
 *
 * Single LLM agent that replaces composition-analyzer + strategy-analyzer.
 * Gets a thumbnail of the image + dimension data, and decides contain vs cover
 * by actually seeing the composition.
 *
 * Cabinet input:  input/path, dimensions/plan
 * Cabinet output: strategy/decision { strategy, confidence, reasoning, source }
 */

import sharp from 'sharp';
import { readFileSync, existsSync } from 'node:fs';
import type { Agent, AgentManifest, AgentResult, ExecutionScope, LLMProvider } from 'composable-agents';

const THUMB_MAX = 480; // thumbnail longest side for the LLM to look at

export const visionAnalyzerManifest: AgentManifest = {
  id: 'vision-analyzer',
  type: 'llm',
  version: '0.1.0',
  purpose: 'Analyze image visually and choose contain vs cover',
  learning: { channels: [] },
};

export function createVisionAnalyzer(provider: LLMProvider): Agent {
  return {
    id: 'vision-analyzer',
    manifest: visionAnalyzerManifest,

    async execute(context: ExecutionScope, signal?: AbortSignal): Promise<AgentResult> {
      if (signal?.aborted) return { status: 'aborted' };

      const inputPath = context.cabinet.get('input/path') as string | undefined;
      const plan = context.cabinet.get('dimensions/plan') as Record<string, unknown> | undefined;

      if (!inputPath || !existsSync(inputPath)) return { status: 'failed', error: 'No input image' };
      if (!plan) return { status: 'failed', error: 'No dimension plan' };

      // Generate a thumbnail and base64-encode it
      const thumbBuf = await sharp(inputPath)
        .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside' })
        .jpeg({ quality: 70 })
        .toBuffer();
      const b64 = thumbBuf.toString('base64');
      const dataUri = `data:image/jpeg;base64,${b64}`;

      const inW = plan.inputWidth as number;
      const inH = plan.inputHeight as number;
      const snapW = plan.snappedWidth as number;
      const snapH = plan.snappedHeight as number;
      const ratioChange = (plan as any).ratioDifference ?? 0;

      // Compute crop & pad pixel estimates
      const coverScale = Math.max(snapW / inW, snapH / inH);
      const cropL = Math.round((Math.round(inW * coverScale) - snapW) / 2);
      const cropR = Math.round(Math.round(inW * coverScale) - snapW - cropL);
      const cropT = Math.round((Math.round(inH * coverScale) - snapH) / 2);
      const cropB = Math.round(Math.round(inH * coverScale) - snapH - cropT);
      const padTotal = Math.abs(snapH - Math.round(snapW / (inW / inH)));

      const prompt = `You are a strategy selector for an image resize pipeline.

The image below is ${inW}×${inH}. After snapping to 64px boundaries, the target canvas is ${snapW}×${snapH} (ratio change: ${ratioChange}%).

Two strategies:
- **contain** (pad): image resized to fit inside the box, ~${padTotal}px of padding. All content preserved.
- **cover** (crop): image fills the box, ~${cropL}px/${cropR}px cropped from sides, ${cropT}px/${cropB}px from top/bottom. No padding, but edge content lost.

Look at the image below. Does it have important content near the edges that would be lost by cropping?
If yes → choose contain (padding).
If the edges are mostly uniform (sky, background, etc.) → cover (crop) is safe.

![thumbnail](${dataUri})

Respond with ONLY valid JSON:
{"strategy":"contain|cover","confidence":0.0-1.0,"reasoning":"Brief explanation based on what you see."}`;

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
          ...decision, source: 'vision-analyzer',
        });
        context.blackboard.setTaskOutput(`Vision decision: ${decision.strategy}`);
        return { status: 'success', output: `${decision.strategy} (conf: ${decision.confidence}) — ${(decision.reasoning as string ?? '').slice(0, 100)}` };
      } catch {
        context.cabinet.put('strategy/decision', {
          strategy: 'contain', confidence: 0.3, reasoning: 'LLM fallback',
          source: 'vision-analyzer-fallback',
        });
        return { status: 'success', output: 'LLM failed — fallback to contain' };
      }
    },
  };
}
