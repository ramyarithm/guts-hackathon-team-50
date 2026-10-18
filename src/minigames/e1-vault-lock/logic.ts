// Pure game state and rules for E1, the PIN door. No DOM access.
//
// The player enters the four-digit code recovered from the four stages on a vault dial:
// LEFT turns the dial one step (the current digit goes up by one, 9 wraps to 0), RIGHT
// sets the digit and moves to the next position; on the fourth position RIGHT submits.
// This module never knows the PIN: the controller passes a `checkPin` callback and the
// entry is handed to it on submit. A wrong entry is denied once and ends the run: after
// a brief "ACCESS DENIED" the failure is signalled and no further input is accepted.

import type { Button, ControlLabels } from '../types';

export type { Button, ControlLabels } from '../types';

// ---- Tuning -----------------------------------------------------------------

/** Positions on the dial: digits 0..9. */
export const DIAL_SIZE = 10;
/** Digits in the code. */
export const CODE_LENGTH = 4;

export const WORLD_WIDTH = 320;
export const WORLD_HEIGHT = 480;

/** Fixed simulation step (60 Hz). */
export const TICK_MS = 1000 / 60;
/** Largest wall-clock gap simulated per step() call; longer stalls are clamped. */
export const MAX_STEP_MS = 250;

/** One press turns the dial one position with an eased rotation this long. */
export const TURN_DURATION_MS = 80;
export const TURN_TICKS = Math.ceil(TURN_DURATION_MS / TICK_MS);

/** "Access denied" is shown for this long, then the failure is signalled. */
export const DENIED_MS = 500;
/** The handle spins and the door swings open for this long before onComplete. */
export const OPENING_MS = 1600;
/** Visual durations. */
export const CLICK_FLASH_MS = 200;
export const SET_FLASH_MS = 500;
export const DENIED_SHAKE_MS = 450;

// ---- Types ------------------------------------------------------------------

export type Phase = 'ENTERING' | 'DENIED' | 'OPENING';

/** Validates a complete entry. Owned by the controller; E1 never stores the PIN. */
export type PinCheck = (entry: string) => boolean;

/** An in-progress one-position turn. */
export interface Rotation {
  from: number;
  to: number;
  elapsedMs: number;
}

export interface GameState {
  phase: Phase;
  /** Position being entered, 0..CODE_LENGTH-1. */
  position: number;
  /** Entered digits; `digits[position]` is the live dial value while ENTERING. */
  digits: number[];
  rotation: Rotation | null;
  /** At most one press queued during a rotation; it runs when the rotation ends. */
  bufferedPress: Button | null;
  /** Milliseconds spent in the current phase. */
  phaseMs: number;
  /** Total simulated milliseconds. */
  timeMs: number;
  /** Fixed-step accumulator used by step(). */
  accumulatorMs: number;
  /** Set exactly once, when the opening animation has finished. */
  completionFired: boolean;
  /** Set exactly once, when the denied flash has finished after a wrong entry. */
  failureFired: boolean;
  /** Wrong entries so far (display only). */
  attempts: number;
  /** Simulated time of the last dial click; -Infinity if none. */
  lastClickMs: number;
  /** Simulated time of the last digit set; -Infinity if none. */
  lastSetMs: number;
}

// ---- Pure helpers -----------------------------------------------------------

/** Value after turning the dial one step up, wrapping 9 -> 0. */
export function turnedValue(value: number): number {
  return (value + 1) % DIAL_SIZE;
}

/** The entry as a string of CODE_LENGTH digits, as handed to checkPin. */
export function entryString(state: GameState): string {
  return state.digits.join('');
}

export function labelsFor(state: GameState): ControlLabels {
  switch (state.phase) {
    case 'ENTERING':
      return {
        left: 'Turn dial',
        right: state.position >= CODE_LENGTH - 1 ? 'Open vault' : 'Set digit',
      };
    case 'DENIED':
    case 'OPENING':
      return { left: '—', right: '—' };
  }
}

/** Rotation progress in [0, 1]; `alpha` lets the renderer peek between ticks. */
export function rotationProgress(state: GameState, alpha = 0): number {
  const r = state.rotation;
  if (!r) return 1;
  return Math.min(1, Math.max(0, (r.elapsedMs + alpha * TICK_MS) / TURN_DURATION_MS));
}

/**
 * Fractional dial position to draw, eased (cubic ease-out) along the current turn.
 * May reach DIAL_SIZE during a wrap; callers take it modulo DIAL_SIZE.
 */
export function dialVisualPosition(state: GameState, alpha = 0): number {
  const r = state.rotation;
  if (!r) return state.digits[state.position] ?? 0;
  const p = rotationProgress(state, alpha);
  const eased = 1 - Math.pow(1 - p, 3);
  return r.from + eased;
}

/** Door opening progress in [0, 1] (0 unless OPENING). */
export function openProgress(state: GameState): number {
  return state.phase === 'OPENING' ? Math.min(1, state.phaseMs / OPENING_MS) : 0;
}

// ---- State ------------------------------------------------------------------

export function createState(): GameState {
  return {
    phase: 'ENTERING',
    position: 0,
    digits: new Array<number>(CODE_LENGTH).fill(0),
    rotation: null,
    bufferedPress: null,
    phaseMs: 0,
    timeMs: 0,
    accumulatorMs: 0,
    completionFired: false,
    failureFired: false,
    attempts: 0,
    lastClickMs: -Infinity,
    lastSetMs: -Infinity,
  };
}

function setPhase(state: GameState, phase: Phase): void {
  state.phase = phase;
  state.phaseMs = 0;
}

function beginTurn(state: GameState): void {
  const from = state.digits[state.position] ?? 0;
  const to = turnedValue(from);
  state.digits[state.position] = to;
  state.rotation = { from, to, elapsedMs: 0 };
}

function setDigit(state: GameState, checkPin: PinCheck): void {
  state.lastSetMs = state.timeMs;
  if (state.position < CODE_LENGTH - 1) {
    state.position += 1;
    state.digits[state.position] = 0;
    return;
  }
  // Fourth position: submit. The controller decides; E1 only shows the result.
  if (checkPin(entryString(state))) {
    setPhase(state, 'OPENING');
  } else {
    state.attempts += 1;
    setPhase(state, 'DENIED');
  }
  state.rotation = null;
  state.bufferedPress = null;
}

/** Apply a press while ENTERING and not rotating. */
function applyEnteringPress(state: GameState, button: Button, checkPin: PinCheck): void {
  if (button === 'LEFT') beginTurn(state);
  else setDigit(state, checkPin);
}

function advanceRotation(state: GameState, checkPin: PinCheck): void {
  const r = state.rotation;
  if (!r) return;
  r.elapsedMs += TICK_MS;
  if (r.elapsedMs < TURN_DURATION_MS) return;
  state.rotation = null;
  state.lastClickMs = state.timeMs; // cosmetic click on every step
  const queued = state.bufferedPress;
  state.bufferedPress = null;
  if (queued) applyEnteringPress(state, queued, checkPin);
}

// ---- Simulation -------------------------------------------------------------

/** Advance exactly one fixed step. */
export function tick(state: GameState, checkPin: PinCheck = () => false): void {
  state.timeMs += TICK_MS;
  state.phaseMs += TICK_MS;
  switch (state.phase) {
    case 'ENTERING':
      advanceRotation(state, checkPin);
      break;
    case 'OPENING':
      if (state.phaseMs >= OPENING_MS && !state.completionFired) state.completionFired = true;
      break;
    case 'DENIED':
      if (state.phaseMs >= DENIED_MS && !state.failureFired) state.failureFired = true;
      break;
  }
}

/** Advance by wall-clock time using a fixed-step accumulator. */
export function step(state: GameState, dtMs: number, checkPin: PinCheck = () => false): void {
  state.accumulatorMs += Math.min(Math.max(dtMs, 0), MAX_STEP_MS);
  // Small epsilon so float drift never swallows a step at an exact boundary.
  while (state.accumulatorMs >= TICK_MS - 1e-6) {
    state.accumulatorMs -= TICK_MS;
    tick(state, checkPin);
  }
}

/**
 * Apply a button press. ENTERING: LEFT turns one step (a press during a rotation is
 * buffered, one at most), RIGHT sets the digit or, on the last position, submits via
 * `checkPin`. DENIED and OPENING: ignored; the run is over either way.
 */
export function press(state: GameState, button: Button, checkPin: PinCheck): void {
  if (state.phase !== 'ENTERING') return;
  if (state.rotation) {
    if (state.bufferedPress === null) state.bufferedPress = button;
  } else {
    applyEnteringPress(state, button, checkPin);
  }
}

// ---- Controller wrapper with callbacks ----------------------------------------

export interface GameOptions {
  /** Validates a submitted entry. Required for the door to open. */
  checkPin?: PinCheck;
  /** A correct entry, after the opening animation. Fires once. */
  onComplete?: () => void;
  /** A wrong entry, after the denied flash. Fires once; the run is over. */
  onFail?: () => void;
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

/** Wraps the pure functions, publishing label changes and firing onComplete / onFail once. */
export function createGame(opts: GameOptions = {}): Game {
  const state = createState();
  const checkPin: PinCheck = opts.checkPin ?? (() => false);
  let disposed = false;
  let completionNotified = false;
  let failureNotified = false;
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
    if (state.failureFired && !failureNotified) {
      failureNotified = true;
      opts.onFail?.();
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
      step(state, dtMs, checkPin);
      afterChange();
    },
    tick(): void {
      if (disposed) return;
      tick(state, checkPin);
      afterChange();
    },
    press(button: Button): void {
      if (disposed || completionNotified || failureNotified) return;
      press(state, button, checkPin);
      afterChange();
    },
    dispose(): void {
      disposed = true;
    },
  };

  opts.onLabels?.(lastLabels);
  return game;
}
