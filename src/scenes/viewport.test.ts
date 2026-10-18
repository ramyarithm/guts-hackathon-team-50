// Tests for the shared stage fit (no DOM). Run from the repo root with the Vitest installed
// in chicken-cross/:
//   ./chicken-cross/node_modules/.bin/vitest run src/scenes
import { describe, expect, it } from 'vitest';
import {
  MAX_DPR,
  SCENE_LAYOUT,
  STAGE_LOGICAL_H,
  STAGE_LOGICAL_W,
  STAGE_MAX_VH,
  STAGE_MAX_VW,
  backingSize,
  fitStage,
  type FitInput,
} from './viewport';

const base: FitInput = { viewportW: 1920, viewportH: 1080, reservedTop: 40 };
const aspect = STAGE_LOGICAL_W / STAGE_LOGICAL_H;

describe('fitStage', () => {
  it('keeps the stage aspect ratio and fills the height budget on desktop screens', () => {
    for (const [w, h] of [
      [1280, 720],
      [1440, 900],
      [1920, 1080],
    ] as const) {
      const fit = fitStage({ ...base, viewportW: w, viewportH: h });
      expect(fit.width / fit.height).toBeCloseTo(aspect, 6);
      expect(fit.height).toBeCloseTo((h * STAGE_MAX_VH) / 100, 6);
      expect(fit.height).toBeLessThanOrEqual(h - base.reservedTop);
      expect(fit.width).toBeLessThanOrEqual((w * STAGE_MAX_VW) / 100);
      expect(fit.scale).toBeCloseTo(fit.width / STAGE_LOGICAL_W, 9);
    }
  });

  it('is centred horizontally and vertically in the area under the header', () => {
    const fit = fitStage(base);
    expect(fit.left).toBeCloseTo((base.viewportW - fit.width) / 2, 6);
    const area = base.viewportH - base.reservedTop;
    expect(fit.top).toBeCloseTo(base.reservedTop + (area - fit.height) / 2, 6);
  });

  it('uses nearly the full width on a narrow portrait screen', () => {
    const fit = fitStage({ ...base, viewportW: 390, viewportH: 844 });
    expect(fit.width).toBeGreaterThanOrEqual(390 * 0.9);
    expect(fit.width).toBeLessThanOrEqual((390 * STAGE_MAX_VW) / 100 + 1e-6);
    expect(fit.width / fit.height).toBeCloseTo(aspect, 6);
    expect(fit.left + fit.width).toBeLessThanOrEqual(390);
    expect(fit.top + fit.height).toBeLessThanOrEqual(844);
  });

  it("applies a scene's height cap and offsets, as percentages of the viewport", () => {
    const fit = fitStage({ ...base, maxVh: 68, offsetX: 4, offsetY: 8 });
    expect(fit.height).toBeCloseTo((1080 * 68) / 100, 6);
    const plain = fitStage({ ...base, maxVh: 68 });
    expect(fit.left).toBeCloseTo(plain.left + (4 * 1080) / 100, 6);
    expect(fit.top).toBeCloseTo(plain.top + (8 * 1080) / 100, 6);
  });

  it('when an offset would push the stage off screen it shrinks a little first, then clamps', () => {
    // Full-height stage pushed down by 10% of the viewport: no room, so it shrinks (at most
    // MAX_SHRINK) and still sits fully inside the viewport.
    const plain = fitStage(base);
    const fit = fitStage({ ...base, offsetY: 10 });
    expect(fit.top + fit.height).toBeLessThanOrEqual(base.viewportH + 1e-6);
    expect(fit.top).toBeGreaterThanOrEqual(base.reservedTop - 1e-6);
    expect(fit.height).toBeLessThan(plain.height);
    expect(fit.height).toBeGreaterThanOrEqual(plain.height * 0.9 - 1e-6);
    expect(fit.width / fit.height).toBeCloseTo(aspect, 6);
    // An absurd offset is clamped to the edge rather than shrinking further.
    const far = fitStage({ ...base, offsetY: 60 });
    expect(far.top + far.height).toBeCloseTo(base.viewportH, 6);
    expect(far.height).toBeCloseTo(plain.height * 0.9, 6);
  });

  it('never produces overflow at any of the checked sizes and scenes', () => {
    for (const [w, h] of [
      [1280, 720],
      [1440, 900],
      [1920, 1080],
      [390, 844],
    ] as const) {
      for (const layout of Object.values(SCENE_LAYOUT)) {
        const fit = fitStage({ ...base, viewportW: w, viewportH: h, ...layout });
        expect(fit.left).toBeGreaterThanOrEqual(-1e-6);
        expect(fit.top).toBeGreaterThanOrEqual(base.reservedTop - 1e-6);
        expect(fit.left + fit.width).toBeLessThanOrEqual(w + 1e-6);
        expect(fit.top + fit.height).toBeLessThanOrEqual(h + 1e-6);
      }
    }
  });
});

describe('backingSize', () => {
  it('multiplies the displayed size by the device pixel ratio, capped at MAX_DPR', () => {
    expect(backingSize(320, 480, 2)).toEqual({ width: 640, height: 960 });
    expect(backingSize(300.4, 450.6, 1)).toEqual({ width: 300, height: 451 });
    expect(backingSize(100, 100, 5)).toEqual({ width: 100 * MAX_DPR, height: 100 * MAX_DPR });
    expect(backingSize(100, 100, 0)).toEqual({ width: 100, height: 100 });
  });
});
