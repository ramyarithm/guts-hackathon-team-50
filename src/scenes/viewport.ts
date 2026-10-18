// Shared stage viewport: sizes and positions the central play area (lives, stage
// progress, the phone screen and the control buttons) so it is as large as possible,
// keeps its aspect ratio, stays centred, and leaves each background's focal details
// visible. Pure maths in fitStage()/backingSize(); createStageViewport() applies it to
// CSS variables and re-fits on resize and orientation change.

// ---- Tuning ----------------------------------------------------------------------

/** Logical size of the whole stage block: 320 x (60 lives/progress + 480 screen + 80 controls). */
export const STAGE_LOGICAL_W = 320;
export const STAGE_LOGICAL_H = 620;
/** Default size limits, as percentages of the viewport (also the CSS --stage-max-vh/vw). */
export const STAGE_MAX_VH = 98;
export const STAGE_MAX_VW = 98;
/** How much the stage may shrink to honour a scene offset before it starts overlapping. */
export const MAX_SHRINK = 0.1;
/** Canvas backing resolution cap (very high DPR screens are expensive and not sharper). */
export const MAX_DPR = 3;

export interface SceneLayout {
  /** Height cap for this scene, % of the viewport height (default STAGE_MAX_VH). */
  maxVh?: number;
  /** Horizontal shift of the stage, % of the viewport height (same units as the art). */
  offsetX?: number;
  /** Vertical shift of the stage, % of the viewport height; positive moves it down. */
  offsetY?: number;
}

export type SceneId = 'menu' | 'c1' | 'c2' | 'c3' | 'c4' | 'pin' | 'e1' | 'e2' | 'door' | 'ending';

/**
 * Per-scene placement. Every scene uses the same size: the default caps (STAGE_MAX_VH /
 * STAGE_MAX_VW), exactly as stages C1 and C2, whichever minigame is assigned. A scene may
 * only add an offset, never a size override, and only where it keeps a background detail
 * visible without shrinking the stage (an offset that would push the stage off screen is
 * clamped). None is used today: every scene is centred. The backgrounds are 320x180
 * pixel art, cover-fitted.
 */
export const SCENE_LAYOUT: Record<SceneId, SceneLayout> = {
  // bunker_after_level1: D1 door at the left, COMMS panel at the right, the desk phone
  // dead centre (which the stage is, in the fiction). The reference layout.
  menu: {},
  c1: {},
  // bunker_after_level2 / level3: same room under red light; door left, COMMS right.
  c2: {},
  c3: {},
  // bunker_after_level4 (PIN keypad / vault dial / door frames): door left, keypad or dial
  // left of centre, COMMS right. The creature's eyes sit in the top-centre window; at
  // full size the stage covers part of that window and no offset can fix it without
  // shrinking, so the stage stays centred (the right eye still peeks out beside it).
  c4: {},
  pin: {},
  e1: {},
  e2: {},
  door: {},
  // sunrise: centred like every other scene; the sun sits just right of centre and its
  // right half stays visible beside the card.
  ending: {},
};

// ---- Pure maths ----------------------------------------------------------------------

export interface FitInput extends SceneLayout {
  viewportW: number;
  viewportH: number;
  /** Pixels taken by the fixed header at the top (the debug bar). */
  reservedTop: number;
  maxVw?: number;
}

export interface StageFit {
  scale: number;
  width: number;
  height: number;
  left: number;
  top: number;
}

/**
 * Fit the stage into the viewport: largest size under the height and width caps that
 * keeps the aspect ratio, centred in the area under the header, then shifted by the
 * scene offsets. If a shift would push it off screen it shrinks by up to MAX_SHRINK
 * first, and only then is clamped to the edge (overlapping the detail it tried to avoid).
 */
export function fitStage(input: FitInput): StageFit {
  const maxVh = input.maxVh ?? STAGE_MAX_VH;
  const maxVw = input.maxVw ?? STAGE_MAX_VW;
  const area = Math.max(0, input.viewportH - input.reservedTop);
  const hBudget = Math.min((input.viewportH * maxVh) / 100, area);
  const wBudget = (input.viewportW * maxVw) / 100;
  const fullScale = Math.max(0, Math.min(hBudget / STAGE_LOGICAL_H, wBudget / STAGE_LOGICAL_W));

  const centreY = input.reservedTop + area / 2;
  const offY = ((input.offsetY ?? 0) / 100) * input.viewportH;
  const offX = ((input.offsetX ?? 0) / 100) * input.viewportH;

  // Shrink a little if the offset pushes the stage past the top or bottom edge.
  let scale = fullScale;
  const height0 = fullScale * STAGE_LOGICAL_H;
  const bottomOverflow = centreY + height0 / 2 + offY - input.viewportH;
  const topOverflow = input.reservedTop - (centreY - height0 / 2 + offY);
  const overflow = Math.max(bottomOverflow, topOverflow, 0);
  if (overflow > 0) {
    const wanted = height0 - 2 * overflow; // keeps the centre + offset, trims both ends
    const minimum = height0 * (1 - MAX_SHRINK);
    scale = Math.max(wanted, minimum) / STAGE_LOGICAL_H;
  }

  const width = scale * STAGE_LOGICAL_W;
  const height = scale * STAGE_LOGICAL_H;
  let left = (input.viewportW - width) / 2 + offX;
  let top = centreY - height / 2 + offY;
  // Clamp inside the viewport (and under the header).
  left = Math.min(Math.max(left, 0), Math.max(0, input.viewportW - width));
  top = Math.min(
    Math.max(top, input.reservedTop),
    Math.max(input.reservedTop, input.viewportH - height),
  );
  return { scale, width, height, left, top };
}

/** Canvas backing-store size for a displayed CSS size: crisp at the device pixel ratio. */
export function backingSize(
  cssW: number,
  cssH: number,
  devicePixelRatio: number,
): { width: number; height: number } {
  const dpr = Math.min(Math.max(devicePixelRatio || 1, 1), MAX_DPR);
  return { width: Math.round(cssW * dpr), height: Math.round(cssH * dpr) };
}

// ---- DOM binding -----------------------------------------------------------------------

export interface StageViewport {
  /** Apply a scene's layout and re-fit. */
  setScene(scene: SceneId): void;
  /** Re-fit to the current window size. */
  refit(): void;
  dispose(): void;
}

export interface StageViewportOptions {
  /** The element that receives the CSS variables (--stage-*). */
  target: HTMLElement;
  /** The fixed header whose height is reserved at the top (optional). */
  header?: HTMLElement | null;
}

export function createStageViewport(options: StageViewportOptions): StageViewport {
  let scene: SceneId = 'menu';
  let disposed = false;

  const refit = (): void => {
    if (disposed) return;
    const fit = fitStage({
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      reservedTop: options.header?.getBoundingClientRect().height ?? 0,
      ...SCENE_LAYOUT[scene],
    });
    const s = options.target.style;
    s.setProperty('--stage-scale', fit.scale.toFixed(4));
    s.setProperty('--stage-w', `${fit.width.toFixed(2)}px`);
    s.setProperty('--stage-h', `${fit.height.toFixed(2)}px`);
    s.setProperty('--stage-left', `${fit.left.toFixed(2)}px`);
    s.setProperty('--stage-top', `${fit.top.toFixed(2)}px`);
  };

  const onResize = (): void => refit();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  refit();

  return {
    setScene(next: SceneId): void {
      scene = next;
      refit();
      // Minigames that only listen to window resize pick up the new screen size too.
      window.dispatchEvent(new Event('resize'));
    },
    refit,
    dispose(): void {
      disposed = true;
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    },
  };
}
