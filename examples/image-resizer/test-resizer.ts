/**
 * Manual test for image-resizer agent.
 *
 * Run: npx tsx examples/image-resizer/test-resizer.ts
 */

import sharp from 'sharp';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execute, computeTargetSize, type ResizeResult } from './index.ts';
import { Scope } from '../../packages/core/src/context/scope.ts';
import { BlackboardImpl } from '../../packages/core/src/context/blackboard.ts';
import { CabinetImpl } from '../../packages/core/src/context/cabinet.ts';

const testDir = resolve(import.meta.dirname ?? '.', '.test-output');

const identity = {
  name: 'Resizer',
  constraints: [],
  values: [],
};

async function createTestImage(
  width: number,
  height: number,
  color = { r: 255, g: 0, b: 0 },
): Promise<string> {
  const outputDir = resolve(testDir, 'input');
  await mkdir(outputDir, { recursive: true });
  const path = resolve(outputDir, `test_${width}x${height}.png`);
  await sharp({
    create: { width, height, channels: 3, background: color },
  })
    .png()
    .toFile(path);
  return path;
}

async function runTest(
  name: string,
  inputWidth: number,
  inputHeight: number,
  expectedWidth: number,
  expectedHeight: number,
): Promise<void> {
  const bb = new BlackboardImpl(identity, '');
  const cabinet = new CabinetImpl();

  const inputPath = await createTestImage(inputWidth, inputHeight);
  cabinet.put('input/image', inputPath);
  bb.task.input = inputPath;

  const scope = new Scope('image-resizer', bb, cabinet);

  const result = await execute(scope);

  // Check computeTargetSize directly too
  const computed = computeTargetSize(inputWidth, inputHeight);

  const pass =
    computed.width === expectedWidth && computed.height === expectedHeight;

  console.log(
    `${pass ? '✅' : '❌'} ${name}: ${inputWidth}×${inputHeight} → ` +
      `${computed.width}×${computed.height} ` +
      `(area: ${inputWidth * inputHeight} → ${computed.width * computed.height}px²) ` +
      `(expected: ${expectedWidth}×${expectedHeight})` +
      (pass ? '' : ` — GOT ${computed.width}×${computed.height}`),
  );

  if (result.status === 'failed') {
    console.log(`  Agent status: ${result.status}, error: ${result.error}`);
  }
}

async function main() {
  // Clean test output
  if (existsSync(testDir)) {
    await rm(testDir, { recursive: true });
  }

  console.log('\nImage Resizer — computeTargetSize tests\n');

  // Test 1: 1024×1024 (exactly 1MP, should stay the same)
  await runTest('Exact 1MP square', 1024, 1024, 1024, 1024);

  // Test 2: 512×512 (below 1MP, should scale up to at least 1MP)
  await runTest('Small square', 512, 512, 1024, 1024);

  // Test 3: 1920×1080 (above 1MP, should snap to 64)
  // 1080/64 = 16.875 → ceil = 17 → 17*64 = 1088
  await runTest('HD 16:9', 1920, 1080, 1920, 1088);

  // Test 4: 200×200 (very small, should scale up to exactly 1024)
  // sqrt(1048576/40000) = 5.12, 200*5.12 = 1024 exactly, snaps to 1024
  await runTest('Tiny square', 200, 200, 1024, 1024);

  // Test 5: 768×1024 (portrait, below 1MP)
  await runTest('Portrait below 1MP', 768, 1024, 896, 1216);

  // Test 6: 100×1000 (very narrow, below 1MP)
  // sqrt(1048576/100000) = 3.238, 100*3.238 = 323.8 → round 324, ceil(324/64)=6, 384
  await runTest('Narrow portrait', 100, 1000, 384, 3264);

  // Test 7: 64×64 (exact snap, below 1MP)
  // sqrt(1048576/4096) = 16, 64*16 = 1024 exactly
  await runTest('Minimal snap', 64, 64, 1024, 1024);

  console.log('\nDone. Check output images in:', resolve(testDir, 'output'));
}

main().catch(console.error);
