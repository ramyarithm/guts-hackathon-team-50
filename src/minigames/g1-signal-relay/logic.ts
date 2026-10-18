// Pure game state and physics for G1. No DOM access; everything here is unit-testable.
// Coordinates are in logical "world units"; render.ts scales them to the canvas.

import type { Button, ControlLabels } from '../types';

export type { Button, ControlLabels } from '../types';
export { createSeededRng, hashSeed } from '../../util/random';

// ---- Tuning -----------------------------------------------------------------

/** Number of pylon gaps the pulse must pass to restore the line. */
export const TARGET_GAPS = 8;

export const WORLD_WIDTH = 320;
export const WORLD_HEIGHT = 480;
export const FLOOR_HEIGHT = 28;
/** Top edge of the floor band; the pulse crashes if it touches this. */
export const FLOOR_Y = WORLD_HEIGHT - FLOOR_HEIGHT;

/** Fixed simulation step (60 Hz). */
export const TICK_MS = 1000 / 60;
const DT = TICK_MS / 1000;
/** Largest wall-clock gap simulated per tick() call; longer stalls are clamped. */
export const MAX_TICK_MS = 250;

export const GRAVITY = 900; // units / s²
export const PULSE_IMPULSE = -300; // units / s, set (not added) on each pulse
export const MAX_FALL_SPEED = 380; // units / s
export const SCROLL_SPEED = 80; // units / s

export const PULSE_X = 80;
export const PULSE_RADIUS = 10;
/** Forgiving hit radius, smaller than the drawn pulse. */
export const HITBOX_RADIUS = 7;
export const START_Y = 220;

export const OBSTACLE_WIDTH = 44;
export const OBSTACLE_SPACING = 200;
export const FIRST_OBSTACLE_X = WORLD_WIDTH + 60;
export const GAP_HEIGHT = 170;
/** Minimum pylon thickness above and below any gap. */
export const GAP_MARGIN = 36;
export const MIN_GAP_TOP = GAP_MARGIN;
export const MAX_GAP_TOP = FLOOR_Y - GAP_MARGIN - GAP_HEIGHT;
/** Largest vertical move between consecutive gaps, so every gap is reachable. */
export const MAX_GAP_SHIFT = 120;

export const CRASH_LOCKOUT_MS = 400;
export const SUCCESS_HOLD_MS = 1000;

// ---- Types ------------------------------------------------------------------

export type Phase = 'READY' | 'PLAYING' | 'CRASHED' | 'SUCCESS';

export interface Obstacle {
  x: number;
  gapTop: number;
  passed: boolean;
}

export interface GameState {
  phase: Phase;
  pulseY: number;
  pulseVy: number;
  obstacles: Obstacle[];
  /** Gaps passed so far in this attempt (0..TARGET_GAPS). */
  passed: number;
  /** Obstacles spawned in this attempt. */
  spawned: number;
  /** Total scrolled distance, for parallax. */
  distance: number;
  /** Milliseconds spent in the current phase. */
  phaseMs: number;
  /** Milliseconds of PLAYING time in this attempt. */
  elapsedPlayMs: number;
  /** Total simulated milliseconds since the game was created (for ambient animation). */
  timeMs: number;
  /** Simulated time of the last pulse, for the flash effect; -Infinity if none yet. */
  lastPulseMs: number;
  completionFired: boolean;
}

export interface GameOptions {
  /** Random source in [0, 1). Defaults to Math.random; inject for deterministic tests. */
  rng?: () => number;
  onComplete?: () => void;
  onLabels?: (labels: ControlLabels) => void;
}

export interface Game {
  readonly state: GameState;
  readonly disposed: boolean;
  /** Advance the simulation by wall-clock time using a fixed-step accumulator. */
  tick(elapsedMs: number): void;
  /** Advance exactly one fixed step. */
  step(): void;
  input(button: Button): void;
  dispose(): void;
}

// ---- Pure helpers -----------------------------------------------------------

export function labelsFor(phase: Phase): ControlLabels {
  switch (phase) {
    case 'READY':
    case 'PLAYING':
      return { left: 'Pulse', right: 'Pulse' };
    case 'CRASHED':
      return { left: 'Retry', right: 'Retry' };
    case 'SUCCESS':
      return { left: '—', right: '—' };
  }
}

/**
 * Pick the top of the next gap. The first gap is anywhere in bounds; later gaps stay within
 * MAX_GAP_SHIFT of the previous one so the pulse can always get there in time.
 */
export function generateGapTop(prevGapTop: number | undefined, rng: () => number): number {
  let lo = MIN_GAP_TOP;
  let hi = MAX_GAP_TOP;
  if (prevGapTop !== undefined) {
    lo = Math.max(lo, prevGapTop - MAX_GAP_SHIFT);
    hi = Math.min(hi, prevGapTop + MAX_GAP_SHIFT);
  }
  return Math.round(lo + rng() * (hi - lo));
}

function createInitialState(rng: () => number): GameState {
  const obstacles: Obstacle[] = [];
  let prev: number | undefined;
  for (let i = 0; i < TARGET_GAPS; i++) {
    const gapTop = generateGapTop(prev, rng);
    obstacles.push({ x: FIRST_OBSTACLE_X + i * OBSTACLE_SPACING, gapTop, passed: false });
    prev = gapTop;
  }
  return {
    phase: 'READY',
    pulseY: START_Y,
    pulseVy: 0,
    obstacles,
    passed: 0,
    spawned: TARGET_GAPS,
    distance: 0,
    phaseMs: 0,
    elapsedPlayMs: 0,
    timeMs: 0,
    lastPulseMs: -Infinity,
    completionFired: false,
  };
}

function hitsObstacle(y: number, o: Obstacle): boolean {
  const overlapsX = PULSE_X + HITBOX_RADIUS > o.x && PULSE_X - HITBOX_RADIUS < o.x + OBSTACLE_WIDTH;
  if (!overlapsX) return false;
  return y - HITBOX_RADIUS < o.gapTop || y + HITBOX_RADIUS > o.gapTop + GAP_HEIGHT;
}

// ---- Game controller ----------------------------------------------------------

export function createGame(opts: GameOptions = {}): Game {
  const rng = opts.rng ?? Math.random;
  let state = createInitialState(rng);
  let disposed = false;
  let accumulator = 0;

  const publishLabels = (): void => {
    if (!disposed) opts.onLabels?.(labelsFor(state.phase));
  };

  const setPhase = (phase: Phase): void => {
    state.phase = phase;
    state.phaseMs = 0;
    publishLabels();
  };

  const pulse = (): void => {
    state.pulseVy = PULSE_IMPULSE;
    state.lastPulseMs = state.timeMs;
  };

  const stepPlaying = (): void => {
    state.elapsedPlayMs += TICK_MS;

    state.pulseVy = Math.min(state.pulseVy + GRAVITY * DT, MAX_FALL_SPEED);
    state.pulseY += state.pulseVy * DT;

    const scroll = SCROLL_SPEED * DT;
    state.distance += scroll;
    for (const o of state.obstacles) o.x -= scroll;

    // Ceiling / floor.
    if (state.pulseY - HITBOX_RADIUS < 0) {
      state.pulseY = HITBOX_RADIUS;
      setPhase('CRASHED');
      return;
    }
    if (state.pulseY + HITBOX_RADIUS > FLOOR_Y) {
      state.pulseY = FLOOR_Y - HITBOX_RADIUS;
      setPhase('CRASHED');
      return;
    }

    // Pylons.
    for (const o of state.obstacles) {
      if (hitsObstacle(state.pulseY, o)) {
        setPhase('CRASHED');
        return;
      }
    }

    // Passing.
    for (const o of state.obstacles) {
      if (!o.passed && o.x + OBSTACLE_WIDTH < PULSE_X) {
        o.passed = true;
        state.passed += 1;
      }
    }
    // Drop pylons that have scrolled fully off screen.
    state.obstacles = state.obstacles.filter((o) => o.x + OBSTACLE_WIDTH > -OBSTACLE_WIDTH);

    if (state.passed >= TARGET_GAPS) {
      state.pulseVy = 0;
      setPhase('SUCCESS');
    }
  };

  const stepSuccess = (): void => {
    // Keep the world drifting while the "Line restored" card shows.
    const scroll = SCROLL_SPEED * DT;
    state.distance += scroll;
    for (const o of state.obstacles) o.x -= scroll;
    if (state.phaseMs >= SUCCESS_HOLD_MS && !state.completionFired) {
      state.completionFired = true;
      opts.onComplete?.();
    }
  };

  const step = (): void => {
    if (disposed) return;
    state.timeMs += TICK_MS;
    state.phaseMs += TICK_MS;
    switch (state.phase) {
      case 'READY':
      case 'CRASHED':
        break;
      case 'PLAYING':
        stepPlaying();
        break;
      case 'SUCCESS':
        stepSuccess();
        break;
    }
  };

  const game: Game = {
    get state() {
      return state;
    },
    get disposed() {
      return disposed;
    },
    tick(elapsedMs: number): void {
      if (disposed) return;
      accumulator += Math.min(Math.max(elapsedMs, 0), MAX_TICK_MS);
      // Small epsilon so float drift never swallows a step at an exact boundary.
      while (accumulator >= TICK_MS - 1e-6) {
        accumulator -= TICK_MS;
        step();
      }
    },
    step,
    input(_button: Button): void {
      if (disposed || state.completionFired) return;
      switch (state.phase) {
        case 'READY':
          setPhase('PLAYING');
          pulse();
          break;
        case 'PLAYING':
          pulse();
          break;
        case 'CRASHED':
          if (state.phaseMs >= CRASH_LOCKOUT_MS) {
            const timeMs = state.timeMs;
            state = createInitialState(rng);
            state.timeMs = timeMs;
            publishLabels();
          }
          break;
        case 'SUCCESS':
          break;
      }
    },
    dispose(): void {
      disposed = true;
      accumulator = 0;
    },
  };

  publishLabels();
  return game;
}
