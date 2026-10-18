// Pure game state and rules for G7 "Signal Lock". No DOM access; everything here is
// unit-testable. The needle position is a fraction 0..1 across the dial; render.ts maps
// it to an angle.
//
// One-button tuning: a needle sweeps back and forth across a dial with a green target
// zone. LEFT ("Lock") stops the needle. Inside the zone a signal bar locks in, the zone
// moves and shrinks a little, and the needle speeds up a little. Outside the zone nothing
// is lost; the player simply tries again. Five bars wins. RIGHT does nothing.

import type { Button, ControlLabels } from '../types';

export { hashSeed } from '../../util/random';

export type { Button, ControlLabels } from '../types';

// ---- Difficulty (tweak these by hand) -------------------------------------------------
//
// Dial positions and widths are fractions of the full sweep (0..1). Speeds are in sweeps
// per second, so 1 / NEEDLE_SWEEP_SECONDS_START is the starting speed.

/** Width of the green zone with no bars locked. */
export const ZONE_WIDTH_START = 0.2;
/** Width the zone never shrinks below. */
export const ZONE_WIDTH_MIN = 0.1;
/** How much narrower the zone gets after each successful lock. */
export const ZONE_SHRINK_PER_LOCK = 0.025;
/** Seconds for one end-to-end sweep of the dial with no bars locked. */
export const NEEDLE_SWEEP_SECONDS_START = 1.8;
/** Speed multiplier applied after each successful lock (1.08 = 8% faster). */
export const NEEDLE_SPEEDUP_PER_LOCK = 1.08;
/** After a miss, the Lock button is disabled for this long. */
export const MISS_LOCKOUT_MS = 400;
/** Probability per second that the needle hesitates. Hesitations never start inside the zone. */
export const STUTTER_CHANCE_PER_SECOND = 0.15;

// ---- Other tuning ---------------------------------------------------------------

/** Signal bars to lock in to win. */
export const TARGET_BARS = 5;

export const WORLD_WIDTH = 320;
export const WORLD_HEIGHT = 480;

/** Fixed simulation step (60 Hz). */
export const TICK_MS = 1000 / 60;
const DT = TICK_MS / 1000;
/** Largest wall-clock gap simulated per step() call; longer stalls are clamped. */
export const MAX_STEP_MS = 250;

/** A new zone's centre must move at least this far from the old one. */
export const ZONE_MIN_SHIFT = 0.18;

/** How long the needle stays stopped after a successful lock, showing the result. */
export const HOLD_MS = 550;
export const SHAKE_MS = 300;
export const SUCCESS_HOLD_MS = 1000;

/** Length of one hesitation. */
export const STUTTER_MIN_MS = 90;
export const STUTTER_MAX_MS = 160;

// ---- Types ------------------------------------------------------------------

export type Phase = 'READY' | 'SWEEPING' | 'HOLD' | 'SUCCESS' | 'FAILED';

/** How long the FAILED state shows before onFail is called. */
export const FAILURE_HOLD_MS = 1000;

export type Result = 'HIT' | 'MISS' | null;

export interface Zone {
  /** Left edge, 0..1. */
  start: number;
  /** Width, 0..1. */
  width: number;
}

export interface GameState {
  phase: Phase;
  seed: number;
  /** mulberry32 state; advanced by nextRandom() so every draw is reproducible. */
  rngState: number;
  /** Needle position across the dial, 0..1. */
  needle: number;
  /** Sweep direction. */
  direction: 1 | -1;
  zone: Zone;
  /** Bars locked so far, 0..TARGET_BARS. */
  bars: number;
  /** Outcome of the last press, shown during HOLD. */
  lastResult: Result;
  /** Remaining HOLD time (the result pause after a hit, or the lockout after a miss). */
  holdMs: number;
  /** Remaining hesitation; the needle does not move while > 0. */
  stutterMs: number;
  /** Remaining dial shake after a miss. */
  shakeMs: number;
  /** Presses this session (for display only). */
  attempts: number;
  misses: number;
  /** Milliseconds spent in the current phase. */
  phaseMs: number;
  /** Total simulated milliseconds (for ambient animation). */
  timeMs: number;
  /** Fixed-step accumulator used by step(). */
  accumulatorMs: number;
  /** Set exactly once, when the success hold has elapsed. */
  completionFired: boolean;
}

// ---- Pure helpers -----------------------------------------------------------

/**
 * One-button game: LEFT locks, RIGHT is always inactive. During the miss lockout the Lock
 * button is shown inactive too, so the player can see they have to wait.
 */
export function labelsFor(state: GameState): ControlLabels {
  switch (state.phase) {
    case 'READY':
    case 'SWEEPING':
      return { left: 'Lock', right: '—' };
    case 'HOLD':
      return { left: state.lastResult === 'MISS' ? '—' : 'Lock', right: '—' };
    case 'SUCCESS':
      return { left: '—', right: '—' };
    case 'FAILED':
      return { left: '—', right: '—' };
  }
}

/** mulberry32: small deterministic PRNG. */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Same generator as createSeededRng, but keeps its state inside GameState. */
function nextRandom(state: GameState): number {
  state.rngState = (state.rngState + 0x6d2b79f5) >>> 0;
  let t = state.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Needle speed for a given bar count, in sweeps per second. */
export function needleSpeedFor(bars: number): number {
  return (1 / NEEDLE_SWEEP_SECONDS_START) * Math.pow(NEEDLE_SPEEDUP_PER_LOCK, bars);
}

/** Needle speed right now. */
export function needleSpeed(state: GameState): number {
  return needleSpeedFor(state.bars);
}

/** Zone width for a given bar count; never below ZONE_WIDTH_MIN. */
export function zoneWidthFor(bars: number): number {
  return Math.max(ZONE_WIDTH_MIN, ZONE_WIDTH_START - ZONE_SHRINK_PER_LOCK * bars);
}

/** True when the needle is inside the green zone. */
export function needleInZone(state: GameState): boolean {
  return state.needle >= state.zone.start && state.needle <= state.zone.start + state.zone.width;
}

/** Draw a fresh zone: new width for the bar count, centre moved well away from the old one. */
function newZone(state: GameState): Zone {
  const width = zoneWidthFor(state.bars);
  const oldCentre = state.zone.start + state.zone.width / 2;
  let start = nextRandom(state) * (1 - width);
  for (let i = 0; i < 8; i++) {
    if (Math.abs(start + width / 2 - oldCentre) >= ZONE_MIN_SHIFT) break;
    start = nextRandom(state) * (1 - width);
  }
  return { start, width };
}

export function createState(seed: number): GameState {
  const state: GameState = {
    phase: 'READY',
    seed,
    rngState: seed >>> 0,
    needle: 0,
    direction: 1,
    zone: { start: 0.5, width: 0 },
    bars: 0,
    lastResult: null,
    holdMs: 0,
    stutterMs: 0,
    shakeMs: 0,
    attempts: 0,
    misses: 0,
    phaseMs: 0,
    timeMs: 0,
    accumulatorMs: 0,
    completionFired: false,
  };
  // First zone anywhere; the placeholder centre of 0.5 just keeps it off dead centre.
  state.zone = newZone(state);
  return state;
}

function setPhase(state: GameState, phase: Phase): void {
  state.phase = phase;
  state.phaseMs = 0;
}

// ---- Simulation -------------------------------------------------------------

function tickNeedle(state: GameState): void {
  // Interference: a rare hesitation. It only ever starts while the needle is outside the
  // zone, and a stopped needle stays put, so it can never cause an unfair miss.
  if (state.stutterMs > 0) {
    state.stutterMs -= TICK_MS;
    return;
  }
  if (!needleInZone(state) && nextRandom(state) < STUTTER_CHANCE_PER_SECOND * DT) {
    state.stutterMs = lerp(STUTTER_MIN_MS, STUTTER_MAX_MS, nextRandom(state));
    return;
  }

  state.needle += state.direction * needleSpeed(state) * DT;
  if (state.needle >= 1) {
    state.needle = 1 - (state.needle - 1);
    state.direction = -1;
  } else if (state.needle <= 0) {
    state.needle = -state.needle;
    state.direction = 1;
  }
  state.needle = Math.min(1, Math.max(0, state.needle));
}

function tickHold(state: GameState): void {
  state.holdMs -= TICK_MS;
  if (state.holdMs > 0) return;
  if (state.lastResult === 'HIT') {
    if (state.bars >= TARGET_BARS) {
      setPhase(state, 'SUCCESS');
      return;
    }
    // The zone moves on and the needle picks up a little.
    state.zone = newZone(state);
  }
  setPhase(state, 'SWEEPING');
}

/** Advance exactly one fixed step. */
export function tick(state: GameState): void {
  state.timeMs += TICK_MS;
  state.phaseMs += TICK_MS;
  if (state.shakeMs > 0) state.shakeMs -= TICK_MS;

  switch (state.phase) {
    case 'SWEEPING':
      tickNeedle(state);
      break;
    case 'HOLD':
      tickHold(state);
      break;
    case 'SUCCESS':
      if (state.phaseMs >= SUCCESS_HOLD_MS && !state.completionFired) {
        state.completionFired = true;
      }
      break;
    case 'FAILED':
      // Wait for adapter to call onFail after FAILURE_HOLD_MS
      break;
    case 'READY':
      break;
  }
}

/** Advance by wall-clock time using a fixed-step accumulator. */
export function step(state: GameState, dtMs: number): void {
  state.accumulatorMs += Math.min(Math.max(dtMs, 0), MAX_STEP_MS);
  // Small epsilon so float drift never swallows a step at an exact boundary.
  while (state.accumulatorMs >= TICK_MS - 1e-6) {
    state.accumulatorMs -= TICK_MS;
    tick(state);
  }
}

/** Stop the needle and judge it. A miss ends the game (FAILED state). */
function lock(state: GameState): void {
  state.attempts += 1;
  if (needleInZone(state)) {
    state.bars = Math.min(TARGET_BARS, state.bars + 1);
    state.lastResult = 'HIT';
    state.holdMs = HOLD_MS;
    setPhase(state, 'HOLD');
  } else {
    state.misses += 1;
    state.lastResult = 'MISS';
    state.shakeMs = SHAKE_MS;
    setPhase(state, 'FAILED');
  }
}

/**
 * Apply a button press. Only LEFT does anything: it starts the sweep from READY and locks
 * the needle while SWEEPING. RIGHT is inactive and ignored. Presses during HOLD and
 * SUCCESS are ignored.
 */
export function press(state: GameState, button: Button): void {
  if (button !== 'LEFT') return;
  if (state.completionFired) return;
  switch (state.phase) {
    case 'READY':
      setPhase(state, 'SWEEPING');
      break;
    case 'SWEEPING':
      lock(state);
      break;
    case 'HOLD':
    case 'SUCCESS':
      break;
  }
}

// ---- Controller wrapper with callbacks ----------------------------------------

export interface GameOptions {
  seed?: number;
  onComplete?: () => void;
  onLabels?: (labels: ControlLabels) => void;
}

export interface Game {
  readonly state: GameState;
  readonly disposed: boolean;
  step(dtMs: number): void;
  tick(): void;
  press(button: Button): void;
  dispose(): void;
}

/** Wraps the pure functions, publishing label changes and firing onComplete once. */
export function createGame(opts: GameOptions = {}): Game {
  const state = createState(opts.seed ?? 1);
  let disposed = false;
  let completionNotified = false;
  let lastLabels = labelsFor(state);

  const afterChange = (): void => {
    if (disposed) return;
    const labels = labelsFor(state);
    if (labels.left !== lastLabels.left || labels.right !== lastLabels.right) {
      lastLabels = labels;
      opts.onLabels?.(labels);
    }
    if (state.completionFired && !completionNotified) {
      completionNotified = true;
      opts.onComplete?.();
    }
  };

  const game: Game = {
    get state() {
      return state;
    },
    get disposed() {
      return disposed;
    },
    step(dtMs: number): void {
      if (disposed) return;
      step(state, dtMs);
      afterChange();
    },
    tick(): void {
      if (disposed) return;
      tick(state);
      afterChange();
    },
    press(button: Button): void {
      if (disposed || completionNotified) return;
      press(state, button);
      afterChange();
    },
    dispose(): void {
      disposed = true;
    },
  };

  if (!disposed) opts.onLabels?.(lastLabels);
  return game;
}
