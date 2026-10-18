// Pure game state and rules for E2 (morse pad). No DOM access.
//
// The player enters a 4-digit PIN using Morse code. LEFT = dash, RIGHT = dot.
// Each digit requires 5 symbols. A reference guide shows all codes on screen.
// One attempt only - incorrect PIN = failure.

import type { Button, ControlLabels } from '../types';

export type { Button, ControlLabels } from '../types';

// ---- Morse Code Reference ----

/** Morse codes for digits 0-9 (each is exactly 5 symbols) */
export const MORSE_CODES: readonly string[] = [
  '-----', // 0
  '.----', // 1
  '..---', // 2
  '...--', // 3
  '....-', // 4
  '.....', // 5
  '-....', // 6
  '--...', // 7
  '---..', // 8
  '----.', // 9
];

/** Symbols per digit */
export const SYMBOLS_PER_DIGIT = 5;

/** Total digits in PIN */
export const PIN_LENGTH = 4;

// ---- Tuning ----

export const WORLD_WIDTH = 320;
export const WORLD_HEIGHT = 480;

/** Fixed simulation step (60 Hz). */
export const TICK_MS = 1000 / 60;

/** Success screen hold time before onComplete */
export const SUCCESS_HOLD_MS = 1500;

/** Failure screen hold time before allowing retry or ending */
export const FAILURE_HOLD_MS = 2000;

// ---- Types ----

export type Phase = 'READY' | 'PLAYING' | 'SUCCESS' | 'FAILED';

export interface GameState {
  phase: Phase;
  /** The 4-digit PIN to match */
  targetPin: string[];
  /** Digits entered so far (0-4) */
  enteredDigits: string[];
  /** Current morse symbols being entered (0-5 chars of '.' and '-') */
  currentSymbols: string;
  /** Status message to display */
  message: string;
  /** Total time elapsed */
  timeMs: number;
  /** Time in current phase */
  phaseMs: number;
  /** Accumulator for fixed timestep */
  accumulatorMs: number;
}

export interface GameCallbacks {
  onComplete?: () => void;
  onLabels?: (labels: ControlLabels) => void;
}

export interface Game {
  readonly state: GameState;
  readonly disposed: boolean;
  step(deltaMs: number): void;
  press(button: Button): void;
  dispose(): void;
}

// ---- Game Factory ----

export function createGame(targetPin: string[], callbacks: GameCallbacks = {}): Game {
  const { onComplete, onLabels } = callbacks;

  const state: GameState = {
    phase: 'READY',
    targetPin,
    enteredDigits: [],
    currentSymbols: '',
    message: 'ENTER THE FOUR RECOVERED DIGITS IN MORSE',
    timeMs: 0,
    phaseMs: 0,
    accumulatorMs: 0,
  };

  let disposed = false;
  let completeFired = false;

  function setPhase(p: Phase): void {
    state.phase = p;
    state.phaseMs = 0;
  }

  function updateLabels(): void {
    if (state.phase === 'PLAYING' || state.phase === 'READY') {
      onLabels?.({ left: '━ DASH', right: '▪ DOT' });
    } else {
      onLabels?.({ left: '—', right: '—' });
    }
  }

  function checkDigit(): void {
    if (state.currentSymbols.length < SYMBOLS_PER_DIGIT) return;

    const digitIndex = MORSE_CODES.indexOf(state.currentSymbols);

    if (digitIndex === -1) {
      // Invalid morse sequence
      setPhase('FAILED');
      state.message = 'INVALID MORSE SEQUENCE — OVERRIDE FAILED';
      updateLabels();
      return;
    }

    // Valid digit
    state.enteredDigits.push(String(digitIndex));
    state.currentSymbols = '';
    state.message = `DIGIT ${state.enteredDigits.length} RECEIVED`;

    // Check if all 4 digits entered
    if (state.enteredDigits.length === PIN_LENGTH) {
      const entered = state.enteredDigits.join('');
      const target = state.targetPin.join('');

      if (entered === target) {
        setPhase('SUCCESS');
        state.message = 'ACCESS GRANTED — THE TUNNEL IS OPEN';
        updateLabels();
      } else {
        setPhase('FAILED');
        state.message = 'INCORRECT PIN — OVERRIDE FAILED';
        updateLabels();
      }
    }
  }

  function tick(): void {
    if (state.phase === 'SUCCESS') {
      if (state.phaseMs >= SUCCESS_HOLD_MS && !completeFired) {
        completeFired = true;
        onComplete?.();
      }
    }
    // Show retry message after failure hold (controller will restart via onFail)
    if (state.phase === 'FAILED' && state.phaseMs >= FAILURE_HOLD_MS) {
      state.message = 'RESTARTING...';
    }
  }

  const game: Game = {
    get state() {
      return state;
    },
    get disposed() {
      return disposed;
    },

    step(deltaMs: number): void {
      if (disposed) return;

      state.accumulatorMs += deltaMs;
      while (state.accumulatorMs >= TICK_MS) {
        state.accumulatorMs -= TICK_MS;
        state.timeMs += TICK_MS;
        state.phaseMs += TICK_MS;
        tick();
      }
    },

    press(button: Button): void {
      if (disposed) return;

      // Start game on first press
      if (state.phase === 'READY') {
        setPhase('PLAYING');
        state.message = 'TRANSMIT DIGIT 1 / 4';
        updateLabels();
      }

      if (state.phase !== 'PLAYING') return;

      // Add symbol
      if (button === 'LEFT') {
        state.currentSymbols += '-';
      } else {
        state.currentSymbols += '.';
      }

      state.message = 'RECEIVING SIGNAL...';
      checkDigit();

      // Update message for next digit if still playing
      if (state.phase === 'PLAYING' && state.currentSymbols === '') {
        state.message = `TRANSMIT DIGIT ${state.enteredDigits.length + 1} / 4`;
      }
    },

    dispose(): void {
      disposed = true;
    },
  };

  // Initial labels
  updateLabels();

  return game;
}

// ---- Helpers for rendering ----

/** Convert morse string to visual marks (▪ for dot, ━ for dash) */
export function toMarks(morse: string): string {
  return morse.replace(/\./g, '▪').replace(/-/g, '━');
}
