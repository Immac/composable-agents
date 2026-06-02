/**
 * Image Processor Agent
 *
 * Executes the image resize using sharp with the strategy chosen
 * by the strategy-agent.
 *
 * Input:  cabinet["input/path"]  — source image path
 *         cabinet["strategy/plan"] — resize strategy
 * Output: Resized image file saved
 *         cabinet["output/path"] — output file path
 *         cabinet["output/metadata"] — result metadata
 */

import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname, extname, basename } from 'node:path';
import type { AgentResult, ExecutionScope } from 'composable-agents';
import type { StrategyPlan } from '../strategy-agent/index.ts';

export async function execute(
  scope: ExecutionScope,
  signal?: AbortSignal,
): Promise<AgentResult> {
  if (signal?.aborted) return { status: 'aborted' };

  const inputPath = scope.cabinet.get('input/path') as string | undefined;
  const strategy = scope.cabinet.get('strategy/plan') as StrategyPlan | undefined;

  if (!inputPath || !existsSync(inputPath)) {
    return { status: 'failed', error: `Input image not found: ${inputPath}` };
  }
  if (!strategy) {
    return { status: 'failed', error: 'No strategy plan found in cabinet' };
  }

  try {
    if (signal?.aborted) return { status: 'aborted' };

    // Build output path
    const outDir = resolve(process.cwd(), 'output');
    const ext = extname(inputPath);
    const base = basename(inputPath, ext);
    const outputPath = resolve(
      outDir,
      `${base}_${strategy.targetWidth}x${strategy.targetHeight}${ext}`,
    );

    await mkdir(outDir, { recursive: true });
    if (signal?.aborted) return { status: 'aborted' };

    // Map strategy to sharp fit mode
    const fitMap: Record<string, 'fill' | 'contain' | 'cover' | 'inside' | 'outside'> = {
      fill: 'fill',
      contain: 'contain',
      cover: 'cover',
    };

    // Resize
    const pipeline = sharp(inputPath).resize(strategy.targetWidth, strategy.targetHeight, {
      fit: fitMap[strategy.resizeMode] ?? 'contain',
      kernel: 'lanczos3',
      background: strategy.background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    });

    const result = await pipeline.toFile(outputPath);
    if (signal?.aborted) return { status: 'aborted' };

    const outMeta = await sharp(outputPath).metadata();
    const metadata = {
      outputWidth: outMeta.width,
      outputHeight: outMeta.height,
      outputArea: (outMeta.width ?? 0) * (outMeta.height ?? 0),
      resizeMode: strategy.resizeMode,
      strategy: strategy.description,
    };

    scope.cabinet.put('output/path', outputPath);
    scope.cabinet.put('output/metadata', metadata);
    scope.blackboard.setTaskOutput(
      `Resized to ${strategy.targetWidth}×${strategy.targetHeight} (${strategy.resizeMode})`,
    );

    return {
      status: 'success',
      output: `${inputPath} → ${outputPath} (${strategy.resizeMode}, ${strategy.targetWidth}×${strategy.targetHeight})`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'failed', error: `Processing failed: ${message}` };
  }
}
