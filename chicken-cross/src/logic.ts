// Pure game state and rules for G2. No DOM access; everything here is unit-testable.
// Coordinates are logical "world units"; render.ts scales them to the canvas.

import type { Button, ControlLabels } from "./types";

export type { Button, ControlLabels } from "./types";

// ---- Tuning -----------------------------------------------------------------

/** Number of hazard lanes between the two safe rows. */
export const LANE_COUNT = 6;
/** Row 0 is the bottom safe row, rows 1..LANE_COUNT are lanes, TOP_ROW is the goal. */
export const TOP_ROW = LANE_COUNT + 1;
export const ROW_COUNT = LANE_COUNT + 2;

export const WORLD_WIDTH = 320;
export const WORLD_HEIGHT = 480;
export const ROW_HEIGHT = WORLD_HEIGHT / ROW_COUNT;

/** The player's horizontal position is fixed at the centre column. */
export const PLAYER_COLUMN_X = WORLD_WIDTH / 2;
export const PLAYER_WIDTH = 28;
/** Collision box as a fraction of the drawn player size (forgiving). */
export const PLAYER_HITBOX_SCALE = 0.75;
export const PLAYER_HITBOX_WIDTH = PLAYER_WIDTH * PLAYER_HITBOX_SCALE;
/** A step glides between rows for this long with an ease-out curve. */
export const STEP_DURATION_MS = 120;

export const OBSTACLE_WIDTH = 56;
/** Smallest / largest clear distance between two obstacles in a lane. */
export const MIN_GAP = 120;
export const MAX_GAP = 180;
/** Lane speeds in units per second; each lane draws one from this range. */
export const LANE_MIN_SPEED = 70;
export const LANE_MAX_SPEED = 120;
/**
 * Obstacles live on a cyclic track that is wider than the screen by one obstacle on
 * each side, so they wrap while off screen. screenX = trackX - TRACK_PAD.
 */
export const TRACK_PAD = OBSTACLE_WIDTH;
export const MIN_TRACK_LENGTH = WORLD_WIDTH + TRACK_PAD * 2;

/** Fixed simulation step (60 Hz). */
export const TICK_MS = 1000 / 60;
const DT = TICK_MS / 1000;
/** Largest wall-clock gap simulated per step() call; longer stalls are clamped. */
export const MAX_STEP_MS = 250;

export const HIT_LOCKOUT_MS = 400;
export const SUCCESS_HOLD_MS = 1000;

/**
 * Fairness: the smallest gap at the player's column is MIN_GAP - PLAYER_HITBOX_WIDTH wide
 * and passes at most at LANE_MAX_SPEED, which is about 825 ms of clear time. A step
 * glides for STEP_DURATION_MS, so a window of MIN_CLEAR_WINDOW_MS is comfortably crossable. The slowest
 * lane repeats its widest gap every (OBSTACLE_WIDTH + MAX_GAP) / LANE_MIN_SPEED ≈ 3.4 s,
 * so a safe window always shows up within MAX_GAP_WAIT_MS.
 */
export const MIN_CLEAR_WINDOW_MS = 500;
export const MAX_GAP_WAIT_MS = 6000;

// ---- Types ------------------------------------------------------------------

export type Phase = "READY" | "PLAYING" | "HIT" | "SUCCESS";

export interface Obstacle {
  /** Position of the obstacle's left edge on the lane's cyclic track. */
  x: number;
}

export interface Lane {
  /** +1 moves right, -1 moves left. */
  direction: 1 | -1;
  /** Units per second. */
  speed: number;
  trackLength: number;
  obstacles: Obstacle[];
}

/** An in-progress step between two rows. */
export interface Glide {
  fromRow: number;
  toRow: number;
  elapsedMs: number;
}

export interface GameState {
  phase: Phase;
  seed: number;
  /** The row the player is in, or is gliding into. */
  playerRow: number;
  /** Current glide, or null when standing still. */
  glide: Glide | null;
  /** At most one press queued during a glide; it runs when the glide ends. */
  bufferedPress: Button | null;
  lanes: Lane[];
  /** Milliseconds spent in the current phase. */
  phaseMs: number;
  /** Total simulated milliseconds. */
  timeMs: number;
  /** Fixed-step accumulator used by step(). */
  accumulatorMs: number;
  /** Set exactly once, when the success hold has elapsed. */
  completionFired: boolean;
  /** Number of hits this session (for display only). */
  hits: number;
}

export interface CreateStateOptions {
  /** Test hook: build lanes with no obstacles at all. */
  obstacleFree?: boolean;
}

// ---- Pure helpers -----------------------------------------------------------

export function labelsFor(phase: Phase): ControlLabels {
  switch (phase) {
    case "READY":
      return { left: "Start", right: "Start" };
    case "PLAYING":
      return { left: "Back", right: "Forward" };
    case "HIT":
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

/** FNV-1a hash of a string to a 32-bit seed, so a runId can seed the lanes. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function createLane(index: number, rng: () => number, obstacleFree: boolean): Lane {
  const direction: 1 | -1 = index % 2 === 0 ? 1 : -1;
  const speed = Math.round(LANE_MIN_SPEED + rng() * (LANE_MAX_SPEED - LANE_MIN_SPEED));

  if (obstacleFree) {
    return { direction, speed, trackLength: MIN_TRACK_LENGTH, obstacles: [] };
  }

  // Lay obstacles along the track with random gaps until it is at least a screen plus
  // padding long. The final gap closes the cycle, so the wrap gap is also >= MIN_GAP.
  const obstacles: Obstacle[] = [];
  let x = 0;
  let trackLength = 0;
  while (trackLength < MIN_TRACK_LENGTH) {
    obstacles.push({ x });
    const gap = MIN_GAP + rng() * (MAX_GAP - MIN_GAP);
    trackLength = x + OBSTACLE_WIDTH + gap;
    x = trackLength;
  }
  // Random starting phase so lanes are not aligned.
  const offset = rng() * trackLength;
  for (const o of obstacles) o.x = (o.x + offset) % trackLength;

  return { direction, speed, trackLength, obstacles };
}

export function createState(seed: number, options: CreateStateOptions = {}): GameState {
  const rng = createSeededRng(seed);
  const lanes: Lane[] = [];
  for (let i = 0; i < LANE_COUNT; i++) lanes.push(createLane(i, rng, options.obstacleFree === true));
  return {
    phase: "READY",
    seed,
    playerRow: 0,
    glide: null,
    bufferedPress: null,
    lanes,
    phaseMs: 0,
    timeMs: 0,
    accumulatorMs: 0,
    completionFired: false,
    hits: 0,
  };
}

export function obstacleScreenX(o: Obstacle): number {
  return o.x - TRACK_PAD;
}

/** Vertical bounds of a row in world units (row 0 at the bottom). */
export function rowTop(row: number): number {
  return WORLD_HEIGHT - (row + 1) * ROW_HEIGHT;
}

function laneForRow(state: GameState, row: number): Lane | undefined {
  if (row < 1 || row > LANE_COUNT) return undefined;
  return state.lanes[row - 1];
}

function cellOccupied(lane: Lane): boolean {
  const cellLeft = PLAYER_COLUMN_X - PLAYER_HITBOX_WIDTH / 2;
  const cellRight = PLAYER_COLUMN_X + PLAYER_HITBOX_WIDTH / 2;
  for (const o of lane.obstacles) {
    const sx = obstacleScreenX(o);
    if (sx < cellRight && sx + OBSTACLE_WIDTH > cellLeft) return true;
  }
  return false;
}

/**
 * How long (ms) the player's cell in `row` stays clear from now. 0 if it is occupied,
 * Infinity for safe rows or lanes without obstacles.
 */
export function rowClearForMs(state: GameState, row: number): number {
  const lane = laneForRow(state, row);
  if (!lane || lane.obstacles.length === 0) return Infinity;
  if (cellOccupied(lane)) return 0;

  const L = lane.trackLength;
  const cellLeftT = PLAYER_COLUMN_X - PLAYER_HITBOX_WIDTH / 2 + TRACK_PAD;
  const cellRightT = PLAYER_COLUMN_X + PLAYER_HITBOX_WIDTH / 2 + TRACK_PAD;
  let soonest = Infinity;
  for (const o of lane.obstacles) {
    // Distance the obstacle must travel along the cyclic track before touching the cell.
    const d =
      lane.direction > 0
        ? (((cellLeftT - (o.x + OBSTACLE_WIDTH)) % L) + L) % L
        : (((o.x - cellRightT) % L) + L) % L;
    soonest = Math.min(soonest, (d / lane.speed) * 1000);
  }
  return soonest;
}

/**
 * Predict whether the player's cell in `row` will be occupied `dtMs` from now, without
 * mutating state. `margin` widens the cell on both sides for conservative planning.
 */
export function rowOccupiedAt(state: GameState, row: number, dtMs: number, margin = 0): boolean {
  const lane = laneForRow(state, row);
  if (!lane) return false;
  const L = lane.trackLength;
  const shift = lane.direction * lane.speed * (dtMs / 1000);
  const cellLeft = PLAYER_COLUMN_X - PLAYER_HITBOX_WIDTH / 2 - margin;
  const cellRight = PLAYER_COLUMN_X + PLAYER_HITBOX_WIDTH / 2 + margin;
  for (const o of lane.obstacles) {
    const x = (((o.x + shift) % L) + L) % L;
    const sx = x - TRACK_PAD;
    if (sx < cellRight && sx + OBSTACLE_WIDTH > cellLeft) return true;
  }
  return false;
}

function setPhase(state: GameState, phase: Phase): void {
  state.phase = phase;
  state.phaseMs = 0;
}

/** Glide progress in [0, 1]; `extraMs` lets the renderer peek between ticks. */
function glideProgress(glide: Glide, extraMs = 0): number {
  return Math.min(1, Math.max(0, (glide.elapsedMs + extraMs) / STEP_DURATION_MS));
}

/**
 * The row used for collision: the lane being left until the glide is past halfway,
 * then the lane being entered.
 */
export function collisionRow(state: GameState): number {
  const g = state.glide;
  if (!g) return state.playerRow;
  return glideProgress(g) < 0.5 ? g.fromRow : g.toRow;
}

/**
 * The row to draw the player in, eased (cubic ease-out) along the current glide.
 * `alpha` in [0, 1) is the fraction of a tick elapsed since the last one, for rendering
 * between fixed steps.
 */
export function playerVisualRow(state: GameState, alpha = 0): number {
  const g = state.glide;
  if (!g) return state.playerRow;
  const p = glideProgress(g, alpha * TICK_MS);
  const eased = 1 - Math.pow(1 - p, 3);
  return g.fromRow + (g.toRow - g.fromRow) * eased;
}

/** Obstacle screen x advanced by a fraction `alpha` of a tick, for smooth rendering. */
export function obstacleVisualX(lane: Lane, o: Obstacle, alpha = 0): number {
  const shift = lane.direction * lane.speed * ((alpha * TICK_MS) / 1000);
  const L = lane.trackLength;
  const x = (((o.x + shift) % L) + L) % L;
  return x - TRACK_PAD;
}

function checkCollision(state: GameState): void {
  const row = collisionRow(state);
  const lane = laneForRow(state, row);
  if (lane && cellOccupied(lane)) {
    state.hits += 1;
    state.playerRow = row;
    state.glide = null;
    state.bufferedPress = null;
    setPhase(state, "HIT");
  }
}

/** Start a glide one row in the pressed direction; a LEFT at the start row does nothing. */
function beginStep(state: GameState, button: Button): void {
  const target =
    button === "RIGHT" ? Math.min(TOP_ROW, state.playerRow + 1) : Math.max(0, state.playerRow - 1);
  if (target === state.playerRow) return;
  state.glide = { fromRow: state.playerRow, toRow: target, elapsedMs: 0 };
  state.playerRow = target;
}

/** Advance the current glide; when it ends, finish the crossing or run the buffered press. */
function advanceGlide(state: GameState): void {
  const g = state.glide;
  if (!g) return;
  g.elapsedMs += TICK_MS;
  if (g.elapsedMs < STEP_DURATION_MS) return;
  state.glide = null;
  if (state.playerRow === TOP_ROW) {
    state.bufferedPress = null;
    setPhase(state, "SUCCESS");
    return;
  }
  const queued = state.bufferedPress;
  state.bufferedPress = null;
  if (queued) beginStep(state, queued);
}

// ---- Simulation -------------------------------------------------------------

/** Advance exactly one fixed step. */
export function tick(state: GameState): void {
  state.timeMs += TICK_MS;
  state.phaseMs += TICK_MS;

  // Lanes keep moving in every phase so the player can read the timing while READY.
  for (const lane of state.lanes) {
    const dx = lane.direction * lane.speed * DT;
    for (const o of lane.obstacles) {
      o.x = (((o.x + dx) % lane.trackLength) + lane.trackLength) % lane.trackLength;
    }
  }

  switch (state.phase) {
    case "PLAYING":
      advanceGlide(state);
      if (state.phase === "PLAYING") checkCollision(state);
      break;
    case "SUCCESS":
      if (state.phaseMs >= SUCCESS_HOLD_MS && !state.completionFired) {
        state.completionFired = true;
      }
      break;
    case "READY":
    case "HIT":
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
 * Apply a button press. In PLAYING, RIGHT glides forward one row and LEFT glides back
 * one row. A press during a glide is buffered (one at most) and runs when the glide
 * ends; further presses during that glide are ignored.
 */
export function press(state: GameState, button: Button): void {
  if (state.completionFired) return;
  switch (state.phase) {
    case "READY":
      setPhase(state, "PLAYING");
      break;
    case "PLAYING":
      if (state.glide) {
        if (state.bufferedPress === null) state.bufferedPress = button;
      } else {
        beginStep(state, button);
      }
      break;
    case "HIT":
      if (state.phaseMs >= HIT_LOCKOUT_MS) {
        state.playerRow = 0;
        state.glide = null;
        state.bufferedPress = null;
        setPhase(state, "READY");
      }
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
  const state = createState(opts.seed ?? 1, { obstacleFree: opts.obstacleFree === true });
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
