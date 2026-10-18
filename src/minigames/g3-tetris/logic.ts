// Pure game state and rules for G3. No DOM access; everything here is unit-testable.
// Board coordinates are (column, row) with row 0 at the top; render.ts maps them to
// world units and scales those to the canvas.
//
// Two-button Tetris: every block passes through two short phases.
//   ORIENT  - the block hovers at the top. LEFT rotates it, RIGHT releases it.
//   FALLING - the block descends at a fixed pace. LEFT and RIGHT steer it.
// Clear TARGET_LINES full rows to win. Topping out fails the attempt; retry rebuilds the
// board with the same seeded block sequence.

import type { Button, ControlLabels } from '../types';

export type { Button, ControlLabels } from '../types';
export { hashSeed } from '../../util/random';

// ---- Tuning -----------------------------------------------------------------

/** Full rows the player must flush to clear the buffer. */
export const TARGET_LINES = 3;

export const COLS = 8;
export const ROWS = 14;

export const WORLD_WIDTH = 320;
export const WORLD_HEIGHT = 480;
/** Side length of one board cell in world units. */
export const CELL = 24;
export const BOARD_WIDTH = COLS * CELL;
export const BOARD_HEIGHT = ROWS * CELL;
export const BOARD_X = (WORLD_WIDTH - BOARD_WIDTH) / 2;
export const BOARD_Y = 60;

/** Fixed simulation step (60 Hz). */
export const TICK_MS = 1000 / 60;
/** Largest wall-clock gap simulated per step() call; longer stalls are clamped. */
export const MAX_STEP_MS = 250;

/** Time between one-row drops while a block is falling. */
export const FALL_INTERVAL_MS = 380;
/** Grace period after a block lands during which it can still be slid sideways. */
export const LOCK_DELAY_MS = 320;
/** A hovering block is released automatically after this long. */
export const HOVER_TIMEOUT_MS = 5000;
/** Duration of the full-row flash before the rows collapse. */
export const CLEAR_FLASH_MS = 320;
export const OVERFLOW_LOCKOUT_MS = 400;
export const SUCCESS_HOLD_MS = 1000;

/** Horizontal nudges tried, in order, when a rotation would not fit in place. */
export const ROTATION_KICKS: readonly number[] = [0, -1, 1, -2, 2];

// ---- Types ------------------------------------------------------------------

export type Phase = 'READY' | 'ORIENT' | 'FALLING' | 'CLEARING' | 'OVERFLOW' | 'SUCCESS';

export type PieceKind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export const PIECE_KINDS: readonly PieceKind[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export interface Cell {
  x: number;
  y: number;
}

export interface ActivePiece {
  kind: PieceKind;
  /** 0..3, quarter turns clockwise from the base shape. */
  rotation: number;
  /** Board column of the shape matrix left edge. */
  x: number;
  /** Board row of the shape matrix top edge; may be negative while hovering. */
  y: number;
}

/** One board cell: the kind of block locked there, or null when empty. */
export type BoardCell = PieceKind | null;

export interface GameState {
  phase: Phase;
  seed: number;
  /** mulberry32 state; advanced by nextRandom() so the block sequence is reproducible. */
  rngState: number;
  /** Locked blocks, indexed [row][column], row 0 at the top. */
  board: BoardCell[][];
  active: ActivePiece | null;
  /** Upcoming block kinds; queue[0] is shown as NEXT. */
  queue: PieceKind[];
  /** Full rows flushed so far this attempt (0..TARGET_LINES). */
  lines: number;
  /** Blocks locked this attempt. */
  placed: number;
  /** Rows currently flashing before they collapse. */
  clearingRows: number[];
  /** Milliseconds the active block has hovered in ORIENT. */
  hoverMs: number;
  /** Milliseconds since the active block last dropped a row. */
  fallMs: number;
  /** Milliseconds the active block has rested on something. */
  lockMs: number;
  /** Milliseconds spent in the current phase. */
  phaseMs: number;
  /** Total simulated milliseconds (for ambient animation). */
  timeMs: number;
  /** Fixed-step accumulator used by step(). */
  accumulatorMs: number;
  /** Set exactly once, when the success hold has elapsed. */
  completionFired: boolean;
  /** Number of top-outs this session (for display only). */
  overflows: number;
}

// ---- Shapes -----------------------------------------------------------------

const BASE_SHAPES: Record<PieceKind, readonly string[]> = {
  I: ['....', '####', '....', '....'],
  O: ['##', '##'],
  T: ['.#.', '###', '...'],
  S: ['.##', '##.', '...'],
  Z: ['##.', '.##', '...'],
  J: ['#..', '###', '...'],
  L: ['..#', '###', '...'],
};

function parseShape(rows: readonly string[]): Cell[] {
  const cells: Cell[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') cells.push({ x, y });
    }
  });
  return cells;
}

/** Rotate cells a quarter turn clockwise inside a size x size matrix. */
function rotateCw(cells: readonly Cell[], size: number): Cell[] {
  return cells.map((c) => ({ x: size - 1 - c.y, y: c.x }));
}

function buildRotations(): Record<PieceKind, readonly (readonly Cell[])[]> {
  const out = {} as Record<PieceKind, readonly (readonly Cell[])[]>;
  for (const kind of PIECE_KINDS) {
    const size = BASE_SHAPES[kind].length;
    const rotations: Cell[][] = [parseShape(BASE_SHAPES[kind])];
    for (let i = 1; i < 4; i++) rotations.push(rotateCw(rotations[i - 1], size));
    out[kind] = rotations;
  }
  return out;
}

/** All four rotations of every block, as cells relative to the shape matrix. */
export const PIECE_ROTATIONS = buildRotations();

export function pieceSize(kind: PieceKind): number {
  return BASE_SHAPES[kind].length;
}

/** Absolute board cells occupied by a block. */
export function pieceCells(piece: ActivePiece): Cell[] {
  return PIECE_ROTATIONS[piece.kind][piece.rotation].map((c) => ({
    x: c.x + piece.x,
    y: c.y + piece.y,
  }));
}

// ---- Pure helpers -----------------------------------------------------------

export function labelsFor(phase: Phase): ControlLabels {
  switch (phase) {
    case 'READY':
      return { left: 'Start', right: 'Start' };
    case 'ORIENT':
      return { left: 'Rotate', right: 'Drop' };
    case 'FALLING':
    case 'CLEARING':
      return { left: 'Left', right: 'Right' };
    case 'OVERFLOW':
      return { left: 'Retry', right: 'Retry' };
    case 'SUCCESS':
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

function emptyRow(): BoardCell[] {
  return new Array<BoardCell>(COLS).fill(null);
}

export function createState(seed: number): GameState {
  const board: BoardCell[][] = [];
  for (let r = 0; r < ROWS; r++) board.push(emptyRow());
  return {
    phase: 'READY',
    seed,
    rngState: seed >>> 0,
    board,
    active: null,
    queue: [],
    lines: 0,
    placed: 0,
    clearingRows: [],
    hoverMs: 0,
    fallMs: 0,
    lockMs: 0,
    phaseMs: 0,
    timeMs: 0,
    accumulatorMs: 0,
    completionFired: false,
    overflows: 0,
  };
}

/** True if any cell is outside the walls, below the floor, or on a locked block. */
export function collides(
  board: readonly (readonly BoardCell[])[],
  cells: readonly Cell[],
): boolean {
  for (const c of cells) {
    if (c.x < 0 || c.x >= COLS || c.y >= ROWS) return true;
    if (c.y >= 0 && board[c.y][c.x] !== null) return true;
  }
  return false;
}

function fits(state: GameState, piece: ActivePiece): boolean {
  return !collides(state.board, pieceCells(piece));
}

/** Row the block would land in if released from where it is now. */
export function ghostY(state: GameState, piece: ActivePiece): number {
  let y = piece.y;
  while (fits(state, { ...piece, y: y + 1 })) y++;
  return y;
}

/** A block hovering at the top, centred, with its top filled row on row 0. */
export function spawnPiece(kind: PieceKind, rotation = 0): ActivePiece {
  const cells = PIECE_ROTATIONS[kind][rotation];
  const minY = Math.min(...cells.map((c) => c.y));
  return { kind, rotation, x: Math.floor((COLS - pieceSize(kind)) / 2), y: -minY };
}

/** Keep at least two blocks queued, refilling with a shuffled 7-bag. */
function refillQueue(state: GameState): void {
  while (state.queue.length < 2) {
    const bag = [...PIECE_KINDS];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(nextRandom(state) * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    state.queue.push(...bag);
  }
}

function setPhase(state: GameState, phase: Phase): void {
  state.phase = phase;
  state.phaseMs = 0;
}

function spawnNext(state: GameState): void {
  refillQueue(state);
  const kind = state.queue.shift() as PieceKind;
  refillQueue(state);
  const piece = spawnPiece(kind);
  state.active = piece;
  state.hoverMs = 0;
  state.fallMs = 0;
  state.lockMs = 0;
  if (!fits(state, piece)) {
    state.overflows += 1;
    setPhase(state, 'OVERFLOW');
    return;
  }
  setPhase(state, 'ORIENT');
}

/** Rotate the hovering block clockwise, nudging sideways if the turn needs room. */
function rotateActive(state: GameState): boolean {
  const a = state.active;
  if (!a) return false;
  const rotation = (a.rotation + 1) % 4;
  const cells = PIECE_ROTATIONS[a.kind][rotation];
  const minY = Math.min(...cells.map((c) => c.y));
  for (const kick of ROTATION_KICKS) {
    const candidate: ActivePiece = { kind: a.kind, rotation, x: a.x + kick, y: -minY };
    if (fits(state, candidate)) {
      state.active = candidate;
      return true;
    }
  }
  return false;
}

function beginFall(state: GameState): void {
  state.fallMs = 0;
  state.lockMs = 0;
  setPhase(state, 'FALLING');
}

function moveActive(state: GameState, dx: number): boolean {
  const a = state.active;
  if (!a) return false;
  const candidate: ActivePiece = { ...a, x: a.x + dx };
  if (!fits(state, candidate)) return false;
  state.active = candidate;
  // A successful slide restarts the lock grace period.
  state.lockMs = 0;
  return true;
}

function lockActive(state: GameState): void {
  const a = state.active;
  if (!a) return;
  const cells = pieceCells(a);
  if (cells.some((c) => c.y < 0)) {
    // Locked above the top edge: the buffer has overflowed.
    state.overflows += 1;
    setPhase(state, 'OVERFLOW');
    return;
  }
  for (const c of cells) state.board[c.y][c.x] = a.kind;
  state.placed += 1;
  state.active = null;

  const full: number[] = [];
  for (let r = 0; r < ROWS; r++) {
    if (state.board[r].every((cell) => cell !== null)) full.push(r);
  }
  if (full.length > 0) {
    state.clearingRows = full;
    setPhase(state, 'CLEARING');
    return;
  }
  spawnNext(state);
}

function collapseRows(state: GameState): void {
  const remaining = state.board.filter((_row, r) => !state.clearingRows.includes(r));
  while (remaining.length < ROWS) remaining.unshift(emptyRow());
  state.board = remaining;
  state.lines += state.clearingRows.length;
  state.clearingRows = [];
}

/** Rebuild the board for a retry; the seeded block sequence restarts from the top. */
function resetAttempt(state: GameState): void {
  const fresh = createState(state.seed);
  fresh.timeMs = state.timeMs;
  fresh.accumulatorMs = state.accumulatorMs;
  fresh.overflows = state.overflows;
  Object.assign(state, fresh);
}

// ---- Simulation -------------------------------------------------------------

function tickOrient(state: GameState): void {
  state.hoverMs += TICK_MS;
  if (state.hoverMs >= HOVER_TIMEOUT_MS) beginFall(state);
}

function tickFalling(state: GameState): void {
  const a = state.active;
  if (!a) return;
  const grounded = !fits(state, { ...a, y: a.y + 1 });
  if (grounded) {
    state.fallMs = 0;
    state.lockMs += TICK_MS;
    if (state.lockMs >= LOCK_DELAY_MS) lockActive(state);
    return;
  }
  state.lockMs = 0;
  state.fallMs += TICK_MS;
  if (state.fallMs >= FALL_INTERVAL_MS) {
    state.fallMs -= FALL_INTERVAL_MS;
    a.y += 1;
  }
}

function tickClearing(state: GameState): void {
  if (state.phaseMs < CLEAR_FLASH_MS) return;
  collapseRows(state);
  if (state.lines >= TARGET_LINES) {
    setPhase(state, 'SUCCESS');
    return;
  }
  spawnNext(state);
}

/** Advance exactly one fixed step. */
export function tick(state: GameState): void {
  state.timeMs += TICK_MS;
  state.phaseMs += TICK_MS;
  switch (state.phase) {
    case 'ORIENT':
      tickOrient(state);
      break;
    case 'FALLING':
      tickFalling(state);
      break;
    case 'CLEARING':
      tickClearing(state);
      break;
    case 'SUCCESS':
      if (state.phaseMs >= SUCCESS_HOLD_MS && !state.completionFired) {
        state.completionFired = true;
      }
      break;
    case 'READY':
    case 'OVERFLOW':
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
 * Apply a button press. In ORIENT, LEFT rotates the hovering block and RIGHT releases
 * it. In FALLING, LEFT and RIGHT slide it one column. Presses during the row flash are
 * ignored. In OVERFLOW, any press after the lockout rebuilds the board.
 */
export function press(state: GameState, button: Button): void {
  if (state.completionFired) return;
  switch (state.phase) {
    case 'READY':
      spawnNext(state);
      break;
    case 'ORIENT':
      if (button === 'LEFT') rotateActive(state);
      else beginFall(state);
      break;
    case 'FALLING':
      moveActive(state, button === 'LEFT' ? -1 : 1);
      break;
    case 'OVERFLOW':
      if (state.phaseMs >= OVERFLOW_LOCKOUT_MS) resetAttempt(state);
      break;
    case 'CLEARING':
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
