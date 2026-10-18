// Pure game state and rules for E1 (vault lock). No DOM access.
//
// The player cracks a combination dial with two buttons. At each step one button turns
// the dial in the required direction (right, left, right) and the other locks in the
// current position. A proximity meter and a click at the exact number make every
// combination deducible by observation. The combination is internal to this minigame
// and has nothing to do with the bunker PIN.

import type { Button, ControlLabels } from "../types";
import { createSeededRng } from "../../util/random";

export { createSeededRng, hashSeed } from "../../util/random";

export type { Button, ControlLabels } from "../types";

// ---- Tuning -----------------------------------------------------------------

/** Positions on the dial, 0..DIAL_SIZE-1, wrapping. */
export const DIAL_SIZE = 10;
/** Numbers in the combination. */
export const CODE_LENGTH = 3;
/** Where the dial sits when an instance starts. The first number is never this. */
export const START_POSITION = 0;
/** Turning direction required for each step: +1 right (clockwise), -1 left. */
export const STEP_DIRECTIONS: readonly (1 | -1)[] = [1, -1, 1];

export const WORLD_WIDTH = 320;
export const WORLD_HEIGHT = 480;

/** Fixed simulation step (60 Hz). */
export const TICK_MS = 1000 / 60;
/** Largest wall-clock gap simulated per step() call; longer stalls are clamped. */
export const MAX_STEP_MS = 250;

/** One press turns the dial one position with an eased rotation this long. */
export const TURN_DURATION_MS = 80;
export const TURN_TICKS = Math.ceil(TURN_DURATION_MS / TICK_MS);

export const DROP_LOCKOUT_MS = 400;
/** "Vault open" is shown for this long before onComplete. */
export const SUCCESS_HOLD_MS = 1000;
/** Visual durations for the click and lock-in flashes. */
export const CLICK_FLASH_MS = 260;
export const LOCK_FLASH_MS = 700;

// ---- Types ------------------------------------------------------------------

export type Phase = "READY" | "PLAYING" | "DROPPED" | "SUCCESS";

/** An in-progress one-position turn. */
export interface Rotation {
  from: number;
  to: number;
  dir: 1 | -1;
  elapsedMs: number;
}

export interface GameState {
  phase: Phase;
  seed: number;
  /** The combination: CODE_LENGTH dial positions. Internal to the minigame. */
  code: number[];
  /** Current step, 0..CODE_LENGTH-1. */
  step: number;
  /** Dial position under the indicator (the target of any rotation in progress). */
  position: number;
  rotation: Rotation | null;
  /** At most one press queued during a rotation; it runs when the rotation ends. */
  bufferedPress: Button | null;
  /** Numbers locked in during the current attempt. */
  found: boolean[];
  /** Numbers ever locked in; shown as faint hints after a drop. */
  hints: boolean[];
  /** Milliseconds spent in the current phase. */
  phaseMs: number;
  /** Total simulated milliseconds. */
  timeMs: number;
  /** Fixed-step accumulator used by step(). */
  accumulatorMs: number;
  /** Set exactly once, when the success hold has elapsed. */
  completionFired: boolean;
  /** Wrong lock-ins so far (for display only). */
  drops: number;
  /** Simulated time of the last click (dial landed on the target); -Infinity if none. */
  lastClickMs: number;
  /** Simulated time of the last correct lock-in; -Infinity if none. */
  lastLockMs: number;
}

export interface CreateStateOptions {
  /** Test hook: use this combination instead of generating one. */
  code?: number[];
}

// ---- Pure helpers -----------------------------------------------------------

/**
 * Generate a combination: CODE_LENGTH positions, no two consecutive equal, and the first
 * never equal to the starting position.
 */
export function generateCode(seed: number, startPosition = START_POSITION): number[] {
  const rng = createSeededRng(seed);
  const code: number[] = [];
  for (let i = 0; i < CODE_LENGTH; i++) {
    const forbidden = i === 0 ? startPosition : code[i - 1]!;
    // Pick among the DIAL_SIZE-1 allowed values so the loop always terminates.
    let n = Math.floor(rng() * (DIAL_SIZE - 1));
    if (n >= forbidden) n += 1;
    code.push(n);
  }
  return code;
}

/** Shortest distance between two dial positions going either way. */
export function circularDistance(a: number, b: number): number {
  const d = Math.abs(((a - b) % DIAL_SIZE) + DIAL_SIZE) % DIAL_SIZE;
  return Math.min(d, DIAL_SIZE - d);
}

/** 1 exactly at the target, falling linearly to 0 at the opposite side of the dial. */
export function proximity(position: number, target: number): number {
  return 1 - circularDistance(position, target) / (DIAL_SIZE / 2);
}

/** Position after turning one step in `dir`, wrapping. */
export function turnedPosition(position: number, dir: 1 | -1): number {
  return (position + dir + DIAL_SIZE) % DIAL_SIZE;
}

/** The button that turns the dial at this step. */
export function turnButton(stepIndex: number): Button {
  return (STEP_DIRECTIONS[stepIndex] ?? 1) > 0 ? "RIGHT" : "LEFT";
}

/** The button that locks in the current position at this step. */
export function lockButton(stepIndex: number): Button {
  return turnButton(stepIndex) === "RIGHT" ? "LEFT" : "RIGHT";
}

/** The number the player is currently listening for. */
export function currentTarget(state: GameState): number {
  const index = Math.min(state.step, CODE_LENGTH - 1);
  return state.code[index]!;
}

/** What the proximity meter shows: closeness of the dial to the current target. */
export function meterLevel(state: GameState): number {
  return proximity(state.position, currentTarget(state));
}

export function labelsFor(state: GameState): ControlLabels {
  switch (state.phase) {
    case "READY":
      return { left: "Start", right: "Start" };
    case "PLAYING":
      return turnButton(state.step) === "RIGHT"
        ? { left: "Lock in", right: "Turn ▶" }
        : { left: "Turn ◀", right: "Lock in" };
    case "DROPPED":
      return { left: "Retry", right: "Retry" };
    case "SUCCESS":
      return { left: "—", right: "—" };
  }
}

/** Short on-screen hint for the current step. */
export function stepHint(state: GameState): string {
  if (state.phase !== "PLAYING") return "";
  return turnButton(state.step) === "RIGHT"
    ? "Turn RIGHT, listen for the click, then LEFT locks in"
    : "Turn LEFT, listen for the click, then RIGHT locks in";
}

// ---- State ------------------------------------------------------------------

export function createState(seed: number, options: CreateStateOptions = {}): GameState {
  const code = options.code ? [...options.code] : generateCode(seed, START_POSITION);
  return {
    phase: "READY",
    seed,
    code,
    step: 0,
    position: START_POSITION,
    rotation: null,
    bufferedPress: null,
    found: new Array<boolean>(CODE_LENGTH).fill(false),
    hints: new Array<boolean>(CODE_LENGTH).fill(false),
    phaseMs: 0,
    timeMs: 0,
    accumulatorMs: 0,
    completionFired: false,
    drops: 0,
    lastClickMs: -Infinity,
    lastLockMs: -Infinity,
  };
}

/** Rotation progress in [0, 1]; `alpha` lets the renderer peek between ticks. */
export function rotationProgress(state: GameState, alpha = 0): number {
  const r = state.rotation;
  if (!r) return 1;
  return Math.min(1, Math.max(0, (r.elapsedMs + alpha * TICK_MS) / TURN_DURATION_MS));
}

/**
 * Fractional dial position to draw, eased (cubic ease-out) along the current turn.
 * May be outside [0, DIAL_SIZE) during a wrap; callers take it modulo DIAL_SIZE.
 */
export function dialVisualPosition(state: GameState, alpha = 0): number {
  const r = state.rotation;
  if (!r) return state.position;
  const p = rotationProgress(state, alpha);
  const eased = 1 - Math.pow(1 - p, 3);
  return r.from + r.dir * eased;
}

function setPhase(state: GameState, phase: Phase): void {
  state.phase = phase;
  state.phaseMs = 0;
}

function beginTurn(state: GameState, dir: 1 | -1): void {
  const from = state.position;
  state.position = turnedPosition(from, dir);
  state.rotation = { from, to: state.position, dir, elapsedMs: 0 };
}

function lockIn(state: GameState): void {
  if (state.position === currentTarget(state)) {
    state.found[state.step] = true;
    state.hints[state.step] = true;
    state.lastLockMs = state.timeMs;
    state.step += 1;
    if (state.step >= CODE_LENGTH) {
      state.step = CODE_LENGTH;
      setPhase(state, "SUCCESS");
    }
    return;
  }
  state.drops += 1;
  state.rotation = null;
  state.bufferedPress = null;
  setPhase(state, "DROPPED");
}

/** Apply a press while PLAYING and not rotating. */
function applyPlayingPress(state: GameState, button: Button): void {
  if (button === turnButton(state.step)) {
    beginTurn(state, STEP_DIRECTIONS[state.step] ?? 1);
  } else {
    lockIn(state);
  }
}

function retry(state: GameState): void {
  state.step = 0;
  state.found.fill(false);
  state.rotation = null;
  state.bufferedPress = null;
  setPhase(state, "PLAYING");
  // The dial does not move on retry; if it already sits on the first number, click.
  if (state.position === currentTarget(state)) state.lastClickMs = state.timeMs;
}

function advanceRotation(state: GameState): void {
  const r = state.rotation;
  if (!r) return;
  r.elapsedMs += TICK_MS;
  if (r.elapsedMs < TURN_DURATION_MS) return;
  state.rotation = null;
  if (state.position === currentTarget(state)) state.lastClickMs = state.timeMs;
  const queued = state.bufferedPress;
  state.bufferedPress = null;
  if (queued) applyPlayingPress(state, queued);
}

// ---- Simulation -------------------------------------------------------------

/** Advance exactly one fixed step. */
export function tick(state: GameState): void {
  state.timeMs += TICK_MS;
  state.phaseMs += TICK_MS;
  switch (state.phase) {
    case "PLAYING":
      advanceRotation(state);
      break;
    case "SUCCESS":
      if (state.phaseMs >= SUCCESS_HOLD_MS && !state.completionFired) {
        state.completionFired = true;
      }
      break;
    case "READY":
    case "DROPPED":
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
 * Apply a button press. READY: either button starts. PLAYING: the step's turn button
 * turns one position (a press during a rotation is buffered, one at most); the other
 * button locks in. DROPPED: after the lockout, either button retries from step 1 with
 * the same code. SUCCESS: ignored.
 */
export function press(state: GameState, button: Button): void {
  if (state.completionFired) return;
  switch (state.phase) {
    case "READY":
      setPhase(state, "PLAYING");
      break;
    case "PLAYING":
      if (state.rotation) {
        if (state.bufferedPress === null) state.bufferedPress = button;
      } else {
        applyPlayingPress(state, button);
      }
      break;
    case "DROPPED":
      if (state.phaseMs >= DROP_LOCKOUT_MS) retry(state);
      break;
    case "SUCCESS":
      break;
  }
}

// ---- Controller wrapper with callbacks ----------------------------------------

export interface GameOptions extends CreateStateOptions {
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
  const state = createState(opts.seed ?? 1, opts.code ? { code: opts.code } : {});
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

  opts.onLabels?.(lastLabels);
  return game;
}
