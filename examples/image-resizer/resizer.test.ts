import { describe, it, expect } from 'vitest';
import { computeTargetSize } from './index.ts';

describe('ImageResizer — computeTargetSize', () => {
  it('exact 1MP square stays the same', () => {
    const result = computeTargetSize(1024, 1024);
    expect(result).toEqual({ width: 1024, height: 1024 });
  });

  it('512×512 scales up to exactly 1024×1024', () => {
    const result = computeTargetSize(512, 512);
    expect(result).toEqual({ width: 1024, height: 1024 });
  });

  it('1920×1080 snaps height to 64px ceiling', () => {
    const result = computeTargetSize(1920, 1080);
    // 1080/64 = 16.875 → ceil = 17 → 17*64 = 1088
    expect(result).toEqual({ width: 1920, height: 1088 });
  });

  it('200×200 scales up to 1024×1024 (exact multiple)', () => {
    const result = computeTargetSize(200, 200);
    expect(result).toEqual({ width: 1024, height: 1024 });
  });

  it('768×1024 portrait scales up', () => {
    const result = computeTargetSize(768, 1024);
    expect(result).toEqual({ width: 896, height: 1216 });
  });

  it('100×1000 narrow portrait', () => {
    const result = computeTargetSize(100, 1000);
    expect(result).toEqual({ width: 384, height: 3264 });
  });

  it('64×64 scales up to 1024×1024', () => {
    const result = computeTargetSize(64, 64);
    expect(result).toEqual({ width: 1024, height: 1024 });
  });

  it('maintains area ≥ 1MP after snapping', () => {
    const cases = [
      { w: 512, h: 512 },
      { w: 100, h: 1000 },
      { w: 200, h: 200 },
      { w: 768, h: 1024 },
      { w: 64, h: 64 },
      { w: 1920, h: 1080 },
    ];
    for (const c of cases) {
      const result = computeTargetSize(c.w, c.h);
      const area = result.width * result.height;
      expect(area).toBeGreaterThanOrEqual(1024 * 1024);
    }
  });
});
