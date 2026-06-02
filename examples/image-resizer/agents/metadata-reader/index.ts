/**
 * Metadata Reader Agent
 *
 * Reads an image file's metadata (dimensions, format) and stores
 * it in the cabinet for downstream agents.
 *
 * Input:  task.input = path to image file
 * Output: cabinet["input/metadata"] = { width, height, format, size }
 *         cabinet["input/path"] = file path
 */

import sharp from 'sharp';
import { statSync } from 'node:fs';
import type { AgentResult, ExecutionScope } from 'composable-agents';

export async function execute(
  scope: ExecutionScope,
  signal?: AbortSignal,
): Promise<AgentResult> {
  if (signal?.aborted) return { status: 'aborted' };

  const inputPath = scope.blackboard.task.input;
  if (!inputPath || typeof inputPath !== 'string') {
    return { status: 'failed', error: 'No input path provided (task.input)' };
  }

  try {
    const meta = await sharp(inputPath).metadata();
    if (signal?.aborted) return { status: 'aborted' };

    if (!meta.width || !meta.height) {
      return { status: 'failed', error: 'Could not read image dimensions' };
    }

    const stat = statSync(inputPath);

    const metadata = {
      width: meta.width,
      height: meta.height,
      format: meta.format ?? 'unknown',
      sizeBytes: stat.size,
      filePath: inputPath,
    };

    scope.cabinet.put('input/metadata', metadata);
    scope.cabinet.put('input/path', inputPath);
    scope.blackboard.setTaskOutput(`Read ${meta.width}×${meta.height} ${meta.format}`);

    return { status: 'success', output: `${meta.width}×${meta.height} ${meta.format} (${stat.size} bytes)` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'failed', error: `Failed to read image: ${message}` };
  }
}
