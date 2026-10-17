// Pure game state and rules for G7. No DOM access; everything here is unit-testable.
// Tilt is a signed fraction: -1 spills to the left, +1 spills to the right. render.ts
// turns it into a cup angle and a meter needle.
//
// Two-button balancing: the engineer walks the maintenance walkway on his own, carrying
// a full cup. The cup wobbles; LEFT tips it back left, RIGHT tips it back right. Tilting
// past SPILL_TILT spills a third of the cup. Three spills and he is out of coffee, which
// restarts the round. Reach the end of the walkway with coffee left to win.

import type { Button, ControlLabels } from "../types";

export type { Button, ControlLabels } from "../types";

// ---- Tuning -----------------------------------------------------------------

/** How long the walk takes from the door to the exit. */
export const ROUND_MS = 34000;

export const WORLD_WIDTH = 320;
export const WORLD_HEIGHT = 480;

/** Fixed simulation step (60 Hz). */
export const TICK_MS = 1000 / 60;
const DT = TICK_MS / 1000;
/** Largest wall-clock gap simulated per step() call; longer stalls are clamped. */
export const MAX_STEP_MS = 250;

/** |tilt| at or beyond this spills. */
export const SPILL_TILT = 1;
/** Spills before the cup is empty. */
export const MAX_SPILLS = 3;
/** Tilt velocity added by one press. */
export const KICK = 0.75;
/** The cup is top-heavy: tilt accelerates away from level at this rate (per s²). */
export const INSTABILITY = 1.8;
/** Velocity damping (fraction per second). */
export const DAMPING = 1.6;
/** Smooth walking wobble, in tilt units/s², at the start and end of the walk. */
export const WOBBLE_START = 0.6;
export const WOBBLE_END = 1.6;
/** Random footstep nudges: spacing and impulse size (scaled up with progress). */
export const NUDGE_MIN_MS = 800;
export const NUDGE_MAX_MS = 1600;
export const NUDGE_MIN = 0.2;
export const NUDGE_MAX = 0.45;

/** After a spill the cup is steadied and input is ignored for this long. */
export const SPILL_RECOVER_MS = 900;
export const FAIL_LOCKOUT_MS = 1600;
/** Long enough for the sip and the "ahhh". */
export const SUCCESS_HOLD_MS = 1600;

/** Hazard scheduling: grace period, then spacing that shrinks as the walk goes on. */
export const HAZARD_FIRST_MS = 4000;
export const HAZARD_INTERVAL_START = 6500;
export const HAZARD_INTERVAL_END = 3200;
/** Every hazard telegraphs itself for this long before it lands. */
export const HAZARD_WARN_MS = 700;
export const PIPE_JOLT = 1.4;
export const FAN_MS = 3000;
export const FAN_FORCE = 1.2;
export const DARK_MS = 2500;
export const INTERCOM_MS = 1200;
export const FLINCH_JOLT = 0.9;

export const SPEECH_MS = 1800;
export const SHAKE_MS = 350;
export const FLINCH_MS = 450;
export const SPILL_FX_MS = 600;

// ---- Types ------------------------------------------------------------------

export type Phase = "READY" | "WALKING" | "SUCCESS" | "FAILED";

export type HazardKind = "PIPE" | "FAN" | "DARK" | "INTERCOM";

export const HAZARD_KINDS: readonly HazardKind[] = ["PIPE", "FAN", "DARK", "INTERCOM"];

export interface Hazard {
  kind: HazardKind;
  /** -1 pushes/arrives from the left, +1 from the right. */
  side: -1 | 1;
  /** Remaining telegraph time; the hazard lands when this reaches 0. */
  warnMs: number;
  /** Remaining active time once landed (0 for instant hazards). */
  activeMs: number;
  /** Active time this hazard started with, for the renderer. */
  totalActiveMs: number;
}

export interface Speech {
  text: string;
  /** Remaining display time. */
  ms: number;
}

export interface GameState {
  phase: Phase;
  seed: number;
  /** mulberry32 state; advanced by nextRandom() so every draw is reproducible. */
  rngState: number;
  /** Signed tilt; |tilt| >= SPILL_TILT spills. */
  tilt: number;
  tiltV: number;
  /** Coffee left, 0..1. */
  cupLevel: number;
  spills: number;
  /** Milliseconds of WALKING time this round. */
  elapsedMs: number;
  /** Seeded wobble frequencies (Hz) and phases. */
  wobbleF1: number;
  wobbleF2: number;
  wobbleP1: number;
  wobbleP2: number;
  /** Countdown to the next footstep nudge. */
  nudgeMs: number;
  hazard: Hazard | null;
  /** Countdown until the next hazard is queued. */
  nextHazardMs: number;
  /** Remaining steadying time after a spill; input and physics are paused. */
  recoverMs: number;
  /** Side of the last spill, for the splash effect. */
  lastSpillSide: -1 | 1;
  spillFxMs: number;
  speech: Speech | null;
  /** Remaining walkway shake (pipe bump). */
  shakeMs: number;
  /** Remaining flinch (intercom). */
  flinchMs: number;
  /** Set once the halfway quip has played. */
  halfwaySaid: boolean;
  /** Milliseconds spent in the current phase. */
  phaseMs: number;
  /** Total simulated milliseconds (for ambient animation). */
  timeMs: number;
  /** Fixed-step accumulator used by step(). */
  accumulatorMs: number;
  /** Set exactly once, when the success hold has elapsed. */
  completionFired: boolean;
  /** Rounds lost this session (for display only). */
  fails: number;
}

// ---- Pure helpers -----------------------------------------------------------

export function labelsFor(phase: Phase): ControlLabels {
  switch (phase) {
    case "READY":
      return { left: "Start", right: "Start" };
    case "WALKING":
      return { left: "Tip L", right: "Tip R" };
    case "FAILED":
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

/** FNV-1a hash of a string to a 32-bit seed, so a runId can seed the walk. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
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

/** Walk progress in [0, 1]. Wobble and hazard spacing scale with this. */
export function progress(state: GameState): number {
  return Math.min(1, Math.max(0, state.elapsedMs / ROUND_MS));
}

/** Whole seconds left on the walk. */
export function secondsLeft(state: GameState): number {
  return Math.max(0, Math.ceil((ROUND_MS - state.elapsedMs) / 1000));
}

/** Smooth seeded wobble acceleration at the current time. */
export function wobbleAt(state: GameState): number {
  const t = state.elapsedMs / 1000;
  const amp = lerp(WOBBLE_START, WOBBLE_END, progress(state));
  return (
    amp *
    (0.6 * Math.sin(2 * Math.PI * state.wobbleF1 * t + state.wobbleP1) +
      0.4 * Math.sin(2 * Math.PI * state.wobbleF2 * t + state.wobbleP2))
  );
}

/** Sideways force from an active fan, in tilt units/s². */
export function fanForce(state: GameState): number {
  const h = state.hazard;
  if (!h || h.kind !== "FAN" || h.warnMs > 0 || h.activeMs <= 0) return 0;
  return h.side * FAN_FORCE * (1 + 0.4 * progress(state));
}

/** True while the lights are out. */
export function lightsOut(state: GameState): boolean {
  const h = state.hazard;
  return !!h && h.kind === "DARK" && h.warnMs <= 0 && h.activeMs > 0;
}

export function createState(seed: number): GameState {
  const state: GameState = {
    phase: "READY",
    seed,
    rngState: seed >>> 0,
    tilt: 0,
    tiltV: 0,
    cupLevel: 1,
    spills: 0,
    elapsedMs: 0,
    wobbleF1: 0,
    wobbleF2: 0,
    wobbleP1: 0,
    wobbleP2: 0,
    nudgeMs: NUDGE_MIN_MS,
    hazard: null,
    nextHazardMs: HAZARD_FIRST_MS,
    recoverMs: 0,
    lastSpillSide: 1,
    spillFxMs: 0,
    speech: null,
    shakeMs: 0,
    flinchMs: 0,
    halfwaySaid: false,
    phaseMs: 0,
    timeMs: 0,
    accumulatorMs: 0,
    completionFired: false,
    fails: 0,
  };
  state.wobbleF1 = 0.25 + nextRandom(state) * 0.2;
  state.wobbleF2 = 0.7 + nextRandom(state) * 0.4;
  state.wobbleP1 = nextRandom(state) * Math.PI * 2;
  state.wobbleP2 = nextRandom(state) * Math.PI * 2;
  return state;
}

function setPhase(state: GameState, phase: Phase): void {
  state.phase = phase;
  state.phaseMs = 0;
}

function say(state: GameState, text: string, ms = SPEECH_MS): void {
  state.speech = { text, ms };
}

/** Rebuild the round for a retry; the seeded sequence restarts from the top. */
function resetRound(state: GameState): void {
  const fresh = createState(state.seed);
  fresh.timeMs = state.timeMs;
  fresh.accumulatorMs = state.accumulatorMs;
  fresh.fails = state.fails;
  Object.assign(state, fresh);
}

// ---- Hazards ------------------------------------------------------------------

function queueHazard(state: GameState): void {
  const kind = HAZARD_KINDS[Math.floor(nextRandom(state) * HAZARD_KINDS.length)];
  const side: -1 | 1 = nextRandom(state) < 0.5 ? -1 : 1;
  let activeMs = 0;
  if (kind === "FAN") activeMs = FAN_MS;
  else if (kind === "DARK") activeMs = DARK_MS;
  else if (kind === "INTERCOM") activeMs = INTERCOM_MS;
  state.hazard = { kind, side, warnMs: HAZARD_WARN_MS, activeMs, totalActiveMs: activeMs };
}

function scheduleNextHazard(state: GameState): void {
  const interval = lerp(HAZARD_INTERVAL_START, HAZARD_INTERVAL_END, progress(state));
  state.nextHazardMs = interval * (0.75 + nextRandom(state) * 0.5);
}

function jolt(state: GameState, amount: number): void {
  if (state.recoverMs > 0) return;
  state.tiltV += amount;
}

function hazardLands(state: GameState, h: Hazard): void {
  const p = progress(state);
  switch (h.kind) {
    case "PIPE":
      jolt(state, h.side * PIPE_JOLT * (1 + 0.5 * p));
      state.shakeMs = SHAKE_MS;
      say(state, "oof—", 900);
      break;
    case "FAN":
      say(state, "a fan. of course.");
      break;
    case "DARK":
      say(state, "who killed the lights?");
      break;
    case "INTERCOM":
      say(state, "bzzt... bzzt...", INTERCOM_MS);
      break;
  }
}

function hazardEnds(state: GameState, h: Hazard): void {
  if (h.kind === "INTERCOM") {
    // The buzz stops and he jumps out of his skin.
    jolt(state, h.side * FLINCH_JOLT * (1 + 0.5 * progress(state)));
    state.flinchMs = FLINCH_MS;
    say(state, "AGH— not now!");
  }
}

function tickHazards(state: GameState): void {
  const h = state.hazard;
  if (!h) {
    state.nextHazardMs -= TICK_MS;
    if (state.nextHazardMs <= 0) queueHazard(state);
    return;
  }
  if (h.warnMs > 0) {
    h.warnMs -= TICK_MS;
    if (h.warnMs > 0) return;
    h.warnMs = 0;
    hazardLands(state, h);
    if (h.activeMs > 0) return;
  }
  if (h.activeMs > 0) {
    h.activeMs -= TICK_MS;
    if (h.activeMs > 0) return;
    h.activeMs = 0;
  }
  hazardEnds(state, h);
  state.hazard = null;
  scheduleNextHazard(state);
}

// ---- Simulation -------------------------------------------------------------

function spill(state: GameState): void {
  state.spills += 1;
  state.cupLevel = Math.max(0, 1 - state.spills / MAX_SPILLS);
  state.lastSpillSide = state.tilt < 0 ? -1 : 1;
  state.spillFxMs = SPILL_FX_MS;
  state.tilt = 0;
  state.tiltV = 0;
  if (state.spills >= MAX_SPILLS) {
    say(state, "NOOOO... *sob*", 60000);
    state.fails += 1;
    setPhase(state, "FAILED");
    return;
  }
  state.recoverMs = SPILL_RECOVER_MS;
  say(state, state.spills === 1 ? "oh no." : "my last coffee...");
}

function tickWalking(state: GameState): void {
  state.elapsedMs += TICK_MS;
  const p = progress(state);

  tickHazards(state);
  if (state.phase !== "WALKING") return;

  if (state.recoverMs > 0) {
    state.recoverMs -= TICK_MS;
  } else {
    // Footstep nudges.
    state.nudgeMs -= TICK_MS;
    if (state.nudgeMs <= 0) {
      const size = lerp(NUDGE_MIN, NUDGE_MAX, nextRandom(state)) * (1 + p);
      state.tiltV += nextRandom(state) < 0.5 ? -size : size;
      state.nudgeMs = lerp(NUDGE_MIN_MS, NUDGE_MAX_MS, nextRandom(state)) * (1 - 0.35 * p);
    }
    // Top-heavy cup plus wobble plus any fan.
    const accel = INSTABILITY * state.tilt + wobbleAt(state) + fanForce(state);
    state.tiltV += accel * DT;
    state.tiltV *= Math.max(0, 1 - DAMPING * DT);
    state.tilt += state.tiltV * DT;

    if (Math.abs(state.tilt) >= SPILL_TILT) {
      spill(state);
      if (state.phase !== "WALKING") return;
    }
  }

  if (!state.halfwaySaid && p >= 0.5) {
    state.halfwaySaid = true;
    if (!state.speech) say(state, "halfway. don't jinx it.");
  }

  if (state.elapsedMs >= ROUND_MS) {
    state.tilt = 0;
    state.tiltV = 0;
    state.hazard = null;
    say(state, "ahhh.", 60000);
    setPhase(state, "SUCCESS");
  }
}

/** Advance exactly one fixed step. */
export function tick(state: GameState): void {
  state.timeMs += TICK_MS;
  state.phaseMs += TICK_MS;
  if (state.speech) {
    state.speech.ms -= TICK_MS;
    if (state.speech.ms <= 0) state.speech = null;
  }
  if (state.shakeMs > 0) state.shakeMs -= TICK_MS;
  if (state.flinchMs > 0) state.flinchMs -= TICK_MS;
  if (state.spillFxMs > 0) state.spillFxMs -= TICK_MS;

  switch (state.phase) {
    case "WALKING":
      tickWalking(state);
      break;
    case "SUCCESS":
      if (state.phaseMs >= SUCCESS_HOLD_MS && !state.completionFired) {
        state.completionFired = true;
      }
      break;
    case "READY":
    case "FAILED":
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
 * Apply a button press. In WALKING, LEFT tips the cup back to the left and RIGHT tips it
 * back to the right; presses are ignored while he steadies the cup after a spill. In
 * FAILED, any press after the lockout restarts the round.
 */
export function press(state: GameState, button: Button): void {
  if (state.completionFired) return;
  switch (state.phase) {
    case "READY":
      setPhase(state, "WALKING");
      say(state, "okay. steady...", 1500);
      break;
    case "WALKING":
      if (state.recoverMs > 0) return;
      state.tiltV += button === "LEFT" ? -KICK : KICK;
      break;
    case "FAILED":
      if (state.phaseMs >= FAIL_LOCKOUT_MS) resetRound(state);
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
  let lastPhase: Phase = state.phase;

  const afterChange = (): void => {
    if (disposed) return;
    if (state.phase !== lastPhase) {
      lastPhase = state.phase;
      opts.onLabels?.(labelsFor(state.phase));
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

  if (!disposed) opts.onLabels?.(labelsFor(state.phase));
  return game;
}
