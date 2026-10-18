// Pure game state and rules for G6. No DOM access; everything here is unit-testable.
// Pressures are 0..1 fractions of each tank's scale; render.ts maps them to world units.
//
// Two-button valve tending: two air tanks rise at drifting rates. LEFT vents the left
// tank and RIGHT vents the right one. Venting one valve too many times in a row jams it
// briefly. A tank that sits in the red zone for too long ruptures and the round restarts.
// Keep both tanks safe until the round timer runs out to win.

import type { Button, ControlLabels } from "../types";

export { hashSeed } from "../../util/random";

export type { Button, ControlLabels } from "../types";

// ---- Tuning -----------------------------------------------------------------

/** How long both tanks must be held safe to win. */
export const ROUND_MS = 36000;

export const WORLD_WIDTH = 320;
export const WORLD_HEIGHT = 480;

/** Fixed simulation step (60 Hz). */
export const TICK_MS = 1000 / 60;
const DT = TICK_MS / 1000;
/** Largest wall-clock gap simulated per step() call; longer stalls are clamped. */
export const MAX_STEP_MS = 250;

/** Pressure at or above this is the red zone. */
export const RED_ZONE = 0.72;
/** Continuous red-zone time that ruptures a tank. */
export const BURST_MS = 1600;
/** Red-zone time drains at this multiple of real time once the tank drops out of the red. */
export const RED_RECOVERY_RATE = 2;

export const START_PRESSURE = 0.35;
/** Pressure removed by one successful vent. */
export const VENT_AMOUNT = 0.18;

/** The Nth consecutive vent of the same valve jams it instead of venting. */
export const STICK_THRESHOLD = 4;
/** How long a jammed valve ignores presses. */
export const STICK_MS = 1200;
/** A pause this long between vents of one valve forgets its streak. */
export const STREAK_RESET_MS = 1000;

/** Rise-rate range (units/s) at the start of the round and at the end. */
export const RATE_LO_START = 0.07;
export const RATE_HI_START = 0.13;
export const RATE_LO_END = 0.15;
export const RATE_HI_END = 0.23;
/** Each tank picks a new target rate this often. */
export const RATE_RETARGET_MIN_MS = 2500;
export const RATE_RETARGET_MAX_MS = 5000;
/** Rates ease toward their target at this fraction per second. */
export const RATE_EASE_PER_S = 1.5;

/** Grace period before the first surge. */
export const SURGE_FIRST_MS = 5000;
/** Mean time between surges at the start and end of the round. */
export const SURGE_INTERVAL_START = 7000;
export const SURGE_INTERVAL_END = 2800;
/** Surge size at the start and end of the round. */
export const SURGE_MIN = 0.12;
export const SURGE_MAX = 0.3;
/** A surge flashes a warning for this long, then ramps in over SURGE_RAMP_MS. */
export const SURGE_WARN_MS = 600;
export const SURGE_RAMP_MS = 450;

export const VENT_FLASH_MS = 220;
export const BURST_LOCKOUT_MS = 400;
export const SUCCESS_HOLD_MS = 1000;

// ---- Types ------------------------------------------------------------------

export type Phase = "READY" | "PLAYING" | "BURST" | "SUCCESS";

/** 0 is the left tank/valve, 1 is the right. */
export type Side = 0 | 1;

export interface Gauge {
  /** 0..1 fraction of the tank's scale. */
  pressure: number;
  /** Current rise rate in units/s. */
  rate: number;
  targetRate: number;
  /** Countdown until the next target rate is drawn. */
  retargetMs: number;
  /** Continuous time spent in the red zone (drains after leaving it). */
  redMs: number;
  /** Consecutive vents of this valve without the other being used. */
  streak: number;
  /** Simulated time of the last press on this valve; -Infinity if none. */
  lastPressMs: number;
  /** Remaining jam time; > 0 means presses are ignored. */
  stuckMs: number;
  /** Remaining warning time before a queued surge begins. */
  warnMs: number;
  /** Surge amount waiting for the warning to finish. */
  pendingSurge: number;
  /** Remaining ramp time of the surge in progress. */
  surgeMs: number;
  /** Extra rise (units/s) applied while surgeMs > 0. */
  surgeRate: number;
  /** Remaining vent-flash time, for the renderer. */
  ventFlashMs: number;
  /** Successful vents this round, for the valve wheel animation. */
  vents: number;
}

export interface GameState {
  phase: Phase;
  seed: number;
  /** mulberry32 state; advanced by nextRandom() so every draw is reproducible. */
  rngState: number;
  gauges: [Gauge, Gauge];
  /** Milliseconds of PLAYING time this round. */
  elapsedMs: number;
  /** Countdown until the next surge is queued. */
  nextSurgeMs: number;
  /** Which tank ruptured, while in BURST. */
  burstSide: Side | null;
  /** Milliseconds spent in the current phase. */
  phaseMs: number;
  /** Total simulated milliseconds (for ambient animation). */
  timeMs: number;
  /** Fixed-step accumulator used by step(). */
  accumulatorMs: number;
  /** Set exactly once, when the success hold has elapsed. */
  completionFired: boolean;
  /** Ruptures this session (for display only). */
  bursts: number;
}

// ---- Pure helpers -----------------------------------------------------------

export function labelsFor(state: GameState): ControlLabels {
  switch (state.phase) {
    case "READY":
      return { left: "Start", right: "Start" };
    case "PLAYING":
      return {
        left: state.gauges[0].stuckMs > 0 ? "Stuck" : "Vent L",
        right: state.gauges[1].stuckMs > 0 ? "Stuck" : "Vent R",
      };
    case "BURST":
      return { left: "Retry", right: "Retry" };
    case "SUCCESS":
      return { left: "—", right: "—" };
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

/** Round progress in [0, 1]. Rates and surges scale with this. */
export function progress(state: GameState): number {
  return Math.min(1, Math.max(0, state.elapsedMs / ROUND_MS));
}

/** Whole seconds left on the round clock. */
export function secondsLeft(state: GameState): number {
  return Math.max(0, Math.ceil((ROUND_MS - state.elapsedMs) / 1000));
}

function createGauge(): Gauge {
  return {
    pressure: START_PRESSURE,
    rate: RATE_LO_START,
    targetRate: RATE_LO_START,
    retargetMs: 0,
    redMs: 0,
    streak: 0,
    lastPressMs: -Infinity,
    stuckMs: 0,
    warnMs: 0,
    pendingSurge: 0,
    surgeMs: 0,
    surgeRate: 0,
    ventFlashMs: 0,
    vents: 0,
  };
}

export function createState(seed: number): GameState {
  return {
    phase: "READY",
    seed,
    rngState: seed >>> 0,
    gauges: [createGauge(), createGauge()],
    elapsedMs: 0,
    nextSurgeMs: SURGE_FIRST_MS,
    burstSide: null,
    phaseMs: 0,
    timeMs: 0,
    accumulatorMs: 0,
    completionFired: false,
    bursts: 0,
  };
}

function setPhase(state: GameState, phase: Phase): void {
  state.phase = phase;
  state.phaseMs = 0;
}

/** Rebuild the round for a retry; the seeded sequence restarts from the top. */
function resetRound(state: GameState): void {
  const fresh = createState(state.seed);
  fresh.timeMs = state.timeMs;
  fresh.accumulatorMs = state.accumulatorMs;
  fresh.bursts = state.bursts;
  Object.assign(state, fresh);
}

// ---- Simulation -------------------------------------------------------------

function pickTargetRate(state: GameState, g: Gauge): void {
  const p = progress(state);
  const lo = lerp(RATE_LO_START, RATE_LO_END, p);
  const hi = lerp(RATE_HI_START, RATE_HI_END, p);
  g.targetRate = lo + nextRandom(state) * (hi - lo);
  g.retargetMs = RATE_RETARGET_MIN_MS + nextRandom(state) * (RATE_RETARGET_MAX_MS - RATE_RETARGET_MIN_MS);
}

/** Queue a surge on a seeded tank; size and spacing scale with round progress. */
function scheduleSurge(state: GameState): void {
  const p = progress(state);
  const side: Side = nextRandom(state) < 0.5 ? 0 : 1;
  const g = state.gauges[side];
  const amount = lerp(SURGE_MIN, SURGE_MAX, p) * (0.8 + nextRandom(state) * 0.4);
  // A tank already surging or warning just gets the larger of the two.
  g.pendingSurge = Math.max(g.pendingSurge, amount);
  if (g.warnMs <= 0) g.warnMs = SURGE_WARN_MS;
  const interval = lerp(SURGE_INTERVAL_START, SURGE_INTERVAL_END, p);
  state.nextSurgeMs = interval * (0.75 + nextRandom(state) * 0.5);
}

function tickGauge(state: GameState, g: Gauge, side: Side): void {
  g.retargetMs -= TICK_MS;
  if (g.retargetMs <= 0) pickTargetRate(state, g);
  g.rate += (g.targetRate - g.rate) * Math.min(1, RATE_EASE_PER_S * DT);

  if (g.warnMs > 0) {
    g.warnMs -= TICK_MS;
    if (g.warnMs <= 0) {
      g.surgeMs = SURGE_RAMP_MS;
      g.surgeRate = g.pendingSurge / (SURGE_RAMP_MS / 1000);
      g.pendingSurge = 0;
    }
  }
  let rise = g.rate;
  if (g.surgeMs > 0) {
    g.surgeMs -= TICK_MS;
    rise += g.surgeRate;
  }
  g.pressure = Math.min(1, Math.max(0, g.pressure + rise * DT));

  if (g.stuckMs > 0) g.stuckMs -= TICK_MS;
  if (g.ventFlashMs > 0) g.ventFlashMs -= TICK_MS;
  if (g.streak > 0 && state.timeMs - g.lastPressMs > STREAK_RESET_MS) g.streak = 0;

  if (g.pressure >= RED_ZONE) {
    g.redMs += TICK_MS;
    if (g.redMs >= BURST_MS) {
      state.burstSide = side;
      state.bursts += 1;
      setPhase(state, "BURST");
    }
  } else {
    g.redMs = Math.max(0, g.redMs - TICK_MS * RED_RECOVERY_RATE);
  }
}

function tickPlaying(state: GameState): void {
  state.elapsedMs += TICK_MS;

  state.nextSurgeMs -= TICK_MS;
  if (state.nextSurgeMs <= 0) scheduleSurge(state);

  tickGauge(state, state.gauges[0], 0);
  if (state.phase !== "PLAYING") return;
  tickGauge(state, state.gauges[1], 1);
  if (state.phase !== "PLAYING") return;

  if (state.elapsedMs >= ROUND_MS) setPhase(state, "SUCCESS");
}

/** Advance exactly one fixed step. */
export function tick(state: GameState): void {
  state.timeMs += TICK_MS;
  state.phaseMs += TICK_MS;
  switch (state.phase) {
    case "PLAYING":
      tickPlaying(state);
      break;
    case "SUCCESS":
      if (state.phaseMs >= SUCCESS_HOLD_MS && !state.completionFired) {
        state.completionFired = true;
      }
      break;
    case "READY":
    case "BURST":
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

/**
 * Vent one valve. Using a valve resets the other valve's streak. A jammed valve ignores
 * the press. The STICK_THRESHOLD-th consecutive press jams the valve instead of venting.
 */
function vent(state: GameState, side: Side): void {
  const g = state.gauges[side];
  const other = state.gauges[side === 0 ? 1 : 0];
  other.streak = 0;
  if (g.stuckMs > 0) return;

  g.streak += 1;
  g.lastPressMs = state.timeMs;
  if (g.streak >= STICK_THRESHOLD) {
    g.stuckMs = STICK_MS;
    g.streak = 0;
    return;
  }
  g.pressure = Math.max(0, g.pressure - VENT_AMOUNT);
  g.ventFlashMs = VENT_FLASH_MS;
  g.vents += 1;
}

/**
 * Apply a button press. In PLAYING, LEFT vents the left tank and RIGHT the right tank.
 * In BURST, any press after the lockout restarts the round.
 */
export function press(state: GameState, button: Button): void {
  if (state.completionFired) return;
  switch (state.phase) {
    case "READY":
      setPhase(state, "PLAYING");
      break;
    case "PLAYING":
      vent(state, button === "LEFT" ? 0 : 1);
      break;
    case "BURST":
      if (state.phaseMs >= BURST_LOCKOUT_MS) resetRound(state);
      break;
    case "SUCCESS":
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
