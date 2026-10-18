import type { Button, ControlLabels } from '../types';
import { createSeededRng, hashSeed, shuffleArray } from '../../util/random';

export { hashSeed } from '../../util/random';

export const WORLD_WIDTH = 280;
export const WORLD_HEIGHT = 320;
export const ROUND_MS = 20_000;
export const CAPACITY = 4;
export const TARGET_MATCHES = 8;
export const OBJECT_TYPES = ['BATTERY', 'DRIVE', 'BOX', 'WRENCH'] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];
export type Phase = 'READY' | 'PLAYING' | 'FAILED' | 'SUCCESS';
export type Failure = 'OVERFLOW' | 'TIMEOUT' | 'UNCLEARED';
export interface Effect {
  kind: 'PLACE' | 'MATCH';
  shelf: 0 | 1;
  type: ObjectType;
  slot: number;
  ageMs: number;
  durationMs: number;
  id: number;
}
/** The renderer receives no sequence or future object information. */
export interface GameState {
  phase: Phase;
  shelves: [ObjectType[], ObjectType[]];
  current: ObjectType | null;
  placed: number;
  matches: number;
  remainingMs: number;
  failure: Failure | null;
  failedShelf: 0 | 1 | null;
  effects: Effect[];
  lockMs: number;
  successMs: number;
}

/** Four independent, shuffled 3+3 rounds. Each empties both shelves when sorted.
 * Each type occurs in the first two rounds, so every run includes all four types.
 * Within a round each type needs at most three slots, below the capacity of four.
 */
export function generateSequence(runId: string): ObjectType[] {
  const rng = createSeededRng(hashSeed(runId));
  const types = shuffleArray(OBJECT_TYPES, rng);
  const sequence: ObjectType[] = [];
  for (let round = 0; round < 4; round++) {
    const pair =
      round < 2 ? types.slice(round * 2, round * 2 + 2) : shuffleArray(types, rng).slice(0, 2);
    sequence.push(...shuffleArray([pair[0], pair[0], pair[0], pair[1], pair[1], pair[1]], rng));
  }
  return sequence;
}
export function labelsFor(phase: Phase): ControlLabels {
  if (phase === 'FAILED') return { left: 'Retry', right: 'Retry' };
  if (phase === 'SUCCESS') return { left: '—', right: '—' };
  return { left: 'Left shelf', right: 'Right shelf' };
}
export function createState(first: ObjectType): GameState {
  return {
    phase: 'READY',
    shelves: [[], []],
    current: first,
    placed: 0,
    matches: 0,
    remainingMs: ROUND_MS,
    failure: null,
    failedShelf: null,
    effects: [],
    lockMs: 0,
    successMs: 0,
  };
}
/** Mutates only the supplied state; overflow is rejected before a fifth item is stored. */
export function place(state: GameState, button: Button, next: ObjectType | null): void {
  if (
    (button !== 'LEFT' && button !== 'RIGHT') ||
    state.lockMs > 0 ||
    (state.phase !== 'READY' && state.phase !== 'PLAYING') ||
    !state.current
  )
    return;
  state.phase = 'PLAYING';
  const side = button === 'LEFT' ? 0 : 1;
  const shelf = state.shelves[side];
  if (shelf.length === CAPACITY) {
    state.phase = 'FAILED';
    state.failure = 'OVERFLOW';
    state.failedShelf = side;
    return;
  }
  const type = state.current;
  const slot = shelf.length;
  shelf.push(type);
  state.placed++;
  const matched = shelf.length >= 3 && shelf.slice(-3).every((item) => item === type);
  state.lockMs = matched ? 330 : 150;
  state.effects.push({
    kind: matched ? 'MATCH' : 'PLACE',
    shelf: side,
    type,
    slot: matched ? slot - 2 : slot,
    ageMs: 0,
    durationMs: matched ? 430 : 210,
    id: state.placed,
  });
  if (matched) {
    shelf.splice(-3);
    state.matches++;
  }
  state.current = next;
  if (state.placed === 24) {
    if (state.matches === TARGET_MATCHES && state.shelves.every((items) => items.length === 0)) {
      state.phase = 'SUCCESS';
    } else {
      state.phase = 'FAILED';
      state.failure = 'UNCLEARED';
    }
  }
}
export function tick(state: GameState, elapsedMs: number): void {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
  state.lockMs = Math.max(0, state.lockMs - elapsedMs);
  for (const fx of state.effects) fx.ageMs += elapsedMs;
  state.effects = state.effects.filter((fx) => fx.ageMs < fx.durationMs);
  if (state.phase === 'PLAYING') {
    state.remainingMs = Math.max(0, state.remainingMs - elapsedMs);
    if (state.remainingMs === 0) {
      state.phase = 'FAILED';
      state.failure = 'TIMEOUT';
    }
  } else if (state.phase === 'SUCCESS') state.successMs += elapsedMs;
}
export interface Game {
  readonly state: GameState;
  press(button: Button): void;
  step(elapsedMs: number): void;
  dispose(): void;
}
export function createGame(options: {
  runId: string;
  onLabels?: (labels: ControlLabels) => void;
  onComplete?: () => void;
}): Game {
  const sequence = generateSequence(options.runId);
  let state = createState(sequence[0]);
  let disposed = false;
  let completed = false;
  const publish = () => options.onLabels?.(labelsFor(state.phase));
  publish();
  return {
    get state() {
      return state;
    },
    press(button) {
      if (disposed || completed || (button !== 'LEFT' && button !== 'RIGHT')) return;
      if (state.phase === 'FAILED') {
        state = createState(sequence[0]); // Same puzzle on retry; new runId means a new puzzle.
        publish();
        return;
      }
      const phase = state.phase;
      place(state, button, sequence[state.placed + 1] ?? null);
      if (state.phase !== phase) publish();
    },
    step(elapsedMs) {
      if (disposed || completed) return;
      const phase = state.phase;
      tick(state, elapsedMs);
      if (state.phase !== phase) publish();
      if (state.phase === 'SUCCESS' && state.successMs >= 900 && !completed) {
        completed = true; // Guard before callback: controller may dispose synchronously.
        options.onComplete?.();
      }
    },
    dispose() {
      disposed = true;
    },
  };
}
