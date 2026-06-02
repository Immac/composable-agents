/**
 * Image Resizer Agent
 *
 * Resizes an image while maintaining aspect ratio.
 * Snaps dimensions to 64px multiples.
 * Minimum area: 1024×1024 = 1,048,576 pixels.
 *
 * Input:  cabinet path "input/image" or task.input as file path
 * Output: resized image saved, metadata in cabinet
 */

import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { basename, extname, resolve, dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { ExecutionScope, AgentResult } from 'composable-agents';

const MIN_PIXELS = 1024 * 1024; // 1,048,576 (1 megapixel)
const SNAP = 64;

export interface ResizeResult {
  inputWidth: number;
  inputHeight: number;
  outputWidth: number;
  outputHeight: number;
  inputArea: number;
  outputArea: number;
  snapMultiple: number;
  aspectRatio: string;
}

/**
 * Compute target dimensions:
 * 1. Maintain aspect ratio
 * 2. Snap to 64px (ceiling to maintain minimum area)
 * 3. Minimum area of 1MP
 */
export function computeTargetSize(
  width: number,
  height: number,
): { width: number; height: number } {
  let w = width;
  let h = height;
  const area = w * h;

  // Scale up to minimum area if needed
  if (area < MIN_PIXELS) {
    const scale = Math.sqrt(MIN_PIXELS / area);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  // Snap to SNAP multiple (ceiling to preserve minimum area)
  w = Math.ceil(w / SNAP) * SNAP;
  h = Math.ceil(h / SNAP) * SNAP;

  return { width: w, height: h };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function formatAspect(w: number, h: number): string {
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}

export async function execute(
  scope: ExecutionScope,
  signal?: AbortSignal,
): Promise<AgentResult> {
  try {
    // Resolve input image path
    const cabinetEntry = scope.cabinet.query('input/*');
    let inputPath: string | undefined;

    if (cabinetEntry.length > 0) {
      inputPath = cabinetEntry[0]?.value as string;
    } else if (scope.blackboard.task.input) {
      // Use task.input as file path
      inputPath = scope.blackboard.task.input;
    }

    if (!inputPath || !existsSync(inputPath)) {
      return {
        status: 'failed',
        error: `Input image not found at: ${inputPath ?? 'undefined'}`,
      };
    }

    if (signal?.aborted) return { status: 'aborted' };

    // Read image metadata
    const metadata = await sharp(inputPath).metadata();
    const inputWidth = metadata.width;
    const inputHeight = metadata.height;

    if (!inputWidth || !inputHeight) {
      return {
        status: 'failed',
        error: 'Could not read image dimensions',
      };
    }

    if (signal?.aborted) return { status: 'aborted' };

    // Compute target dimensions
    const target = computeTargetSize(inputWidth, inputHeight);

    // Build output path
    const ext = extname(inputPath) || '.png';
    const base = basename(inputPath, ext);
    const outputDir = resolve(dirname(inputPath), '..', 'output');
    const outputPath = resolve(outputDir, `${base}_${target.width}x${target.height}${ext}`);

    await mkdir(outputDir, { recursive: true });

    if (signal?.aborted) return { status: 'aborted' };

    // Resize
    const buffer = await sharp(inputPath)
      .resize(target.width, target.height, {
        fit: 'fill',
        kernel: 'lanczos3',
      })
      .toFile(outputPath);

    // Build result metadata
    const result: ResizeResult = {
      inputWidth,
      inputHeight,
      outputWidth: target.width,
      outputHeight: target.height,
      inputArea: inputWidth * inputHeight,
      outputArea: target.width * target.height,
      snapMultiple: SNAP,
      aspectRatio: formatAspect(inputWidth, inputHeight),
    };

    // Store results
    scope.cabinet.put('output/path', outputPath);
    scope.cabinet.put('output/metadata', result);
    scope.blackboard.setTaskOutput(
      `Resized ${inputWidth}×${inputHeight} → ${target.width}×${target.height}`,
    );

    return {
      status: 'success',
      output: `Resized ${inputWidth}×${inputHeight} to ${target.width}×${target.height} (snapped to ${SNAP}px, min ${MIN_PIXELS}px²)`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'failed', error: message };
  }
}
