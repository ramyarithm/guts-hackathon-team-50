// Pure game state, layout generation, verification and rules for G2. No DOM access.
// Coordinates are logical "world units"; render.ts scales them to the canvas.
//
// Obstacles are periodic: each lane is a fixed pattern that repeats every `periodTicks`
// simulation ticks at the player column. Nothing random happens during play. Every
// layout is verified before use (see verifyLayout) so a crossing is always possible and
// the player can never be trapped.

import type { Button, ControlLabels } from "../types";

export { hashSeed } from "../../util/random";

export type { Button, ControlLabels } from "../types";

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

/** Fixed simulation step (60 Hz). */
export const TICK_MS = 1000 / 60;
const DT = TICK_MS / 1000;
/** Largest wall-clock gap simulated per step() call; longer stalls are clamped. */
export const MAX_STEP_MS = 250;

/** A step glides between rows for this long with an ease-out curve. */
export const STEP_DURATION_MS = 120;
/** Ticks a glide occupies; the player is free to act again after this many ticks. */
export const STEP_TICKS = Math.ceil(STEP_DURATION_MS / TICK_MS);

export const HIT_LOCKOUT_MS = 400;
export const SUCCESS_HOLD_MS = 1000;

/**
 * Human reaction margin. A move only counts as available to the verifier if it is safe
 * when started at any tick within this window, so no layout needs frame-perfect timing.
 */
export const REACTION_MS = 250;
export const REACTION_TICKS = Math.round(REACTION_MS / TICK_MS);
/** Ticks of a glide during which the source lane still counts for collision. */
export const GLIDE_SOURCE_TICKS = (() => {
  let n = 0;
  for (let k = 1; k <= STEP_TICKS; k++) if ((k * TICK_MS) / STEP_DURATION_MS < 0.5) n++;
  return n;
})();
/**
 * An attentive player only enters a lane that stays safe for this long after the latest
 * possible landing: one reaction to look around plus a full robust escape (another
 * reaction window and the source part of a glide). Jumping in front of a visibly
 * arriving obstacle is a visible risk, not a trap.
 */
export function landingMarginTicks(reactionTicks: number): number {
  return 2 * reactionTicks + GLIDE_SOURCE_TICKS;
}
export const LANDING_MARGIN_TICKS = landingMarginTicks(REACTION_TICKS);

/** Lane periods at the player column, in ticks. All are multiples of PERIOD_UNIT_TICKS. */
export const PERIOD_UNIT_TICKS = 30;
export const PERIOD_OPTIONS_TICKS: readonly number[] = [120, 180];
/** lcm of every period option: the combined pattern of all lanes repeats within this. */
export const MAX_HYPERPERIOD_TICKS = 360;

export const OBSTACLE_WIDTH_OPTIONS: readonly number[] = [48, 56, 64];
/** Smallest clear distance between two obstacles in a lane, in units. */
export const MIN_GAP = 110;
/** Lane speeds in units per second. */
export const LANE_MIN_SPEED = 60;
export const LANE_MAX_SPEED = 120;

/** How many seeds to try before falling back to the hand-made layout. */
export const MAX_GENERATION_ATTEMPTS = 50;

// ---- Types ------------------------------------------------------------------

export type Phase = "READY" | "PLAYING" | "HIT" | "SUCCESS";

/** One lane's fixed, repeating obstacle pattern. */
export interface LaneLayout {
  /** +1 obstacles move right, -1 they move left. */
  direction: 1 | -1;
  /** Ticks between two obstacles reaching the player column. */
  periodTicks: number;
  /** Shifts the pattern in time; in [0, periodTicks). */
  phaseTicks: number;
  /** Ticks per period during which the player cell is occupied. 0 means an empty lane. */
  blockedTicks: number;
  /** Units per second. */
  speed: number;
  /** Drawn width of an obstacle, which is also its collision width. */
  obstacleWidth: number;
  /** Distance between consecutive obstacles' leading edges = speed * period. */
  spacing: number;
  /** Visual variant index, used by the renderer only. */
  style: number;
}

export interface Layout {
  lanes: LaneLayout[];
  /** lcm of all lane periods; the whole corridor repeats exactly every this many ticks. */
  hyperperiodTicks: number;
  /** Seed the layout was generated from (0 for hand-made layouts). */
  seed: number;
}

/** An in-progress step between two rows. */
export interface Glide {
  fromRow: number;
  toRow: number;
  /** Whole ticks since the glide started. */
  elapsedTicks: number;
}

export interface LayoutInfo {
  attempts: number;
  usedFallback: boolean;
}

export interface GameState {
  phase: Phase;
  seed: number;
  layout: Layout;
  layoutInfo: LayoutInfo;
  /** Simulation ticks since the state was created; drives every obstacle position. */
  tick: number;
  /** The row the player is in, or is gliding into. */
  playerRow: number;
  /** Current glide, or null when standing still. */
  glide: Glide | null;
  /** At most one press queued during a glide; it runs when the glide ends. */
  bufferedPress: Button | null;
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
  /** Use this layout instead of generating one (tests and hand-made layouts). */
  layout?: Layout;
}

// ---- Pure helpers -----------------------------------------------------------

export function labelsFor(phase: Phase): ControlLabels {
  switch (phase) {
    case "READY":
      return { left: "Start", right: "Start" };
    case "PLAYING":
      return { left: "Back", right: "Forward" };
    case "HIT":
      return { left: "—", right: "—" };
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

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

/** Wrap a tick into [0, period). */
function mod(n: number, period: number): number {
  return ((n % period) + period) % period;
}

/** Vertical top of a row in world units (row 0 at the bottom). Works for fractional rows. */
export function rowTop(row: number): number {
  return WORLD_HEIGHT - (row + 1) * ROW_HEIGHT;
}

/** Build a Layout from lanes, computing the hyperperiod. */
export function makeLayout(lanes: LaneLayout[], seed: number): Layout {
  let hyper = 1;
  for (const lane of lanes) hyper = lcm(hyper, lane.periodTicks);
  return { lanes, hyperperiodTicks: hyper, seed };
}

/**
 * Ticks for which an obstacle of `obstacleWidth` moving at `speed` overlaps the player's
 * collision box. This is the only place the collision geometry is turned into ticks.
 */
export function blockedTicksFor(obstacleWidth: number, speed: number): number {
  return Math.ceil((obstacleWidth + PLAYER_HITBOX_WIDTH) / (speed * DT) - 1e-9);
}

// ---- The one collision function ------------------------------------------------

/**
 * Whether the player cell in `row` collides with an obstacle at `tick`. Gameplay and the
 * verifier both call this; there is no other copy of the collision rule. Safe rows and
 * empty lanes are never blocked.
 */
export function isBlocked(layout: Layout, row: number, tick: number): boolean {
  if (row < 1 || row > LANE_COUNT) return false;
  const lane = layout.lanes[row - 1];
  if (!lane || lane.blockedTicks <= 0) return false;
  return mod(tick + lane.phaseTicks, lane.periodTicks) < lane.blockedTicks;
}

/**
 * The row that counts for collision `k` ticks into a glide: the lane being left until the
 * glide is past halfway, then the lane being entered.
 */
export function glideRowAt(fromRow: number, toRow: number, k: number): number {
  const progress = (k * TICK_MS) / STEP_DURATION_MS;
  return progress < 0.5 ? fromRow : toRow;
}

/** Whether a glide from `fromRow` to `toRow` pressed at `startTick` survives every tick. */
export function glideSafe(layout: Layout, fromRow: number, toRow: number, startTick: number): boolean {
  for (let k = 1; k <= STEP_TICKS; k++) {
    if (isBlocked(layout, glideRowAt(fromRow, toRow, k), startTick + k)) return false;
  }
  return true;
}

// ---- Obstacle geometry for rendering -----------------------------------------------

export interface ObstacleBody {
  left: number;
  right: number;
}

/**
 * Screen-space bodies of a lane's visible obstacles at `tick` (+ `alpha` of a tick).
 * Consistent with isBlocked: the leading edge touches the collision box at the start of
 * each blocked window and is half a tick inside it at integer ticks.
 */
export function obstacleBodiesAt(lane: LaneLayout, tick: number, alpha = 0): ObstacleBody[] {
  if (lane.blockedTicks <= 0) return [];
  const s = mod(tick + lane.phaseTicks, lane.periodTicks) + alpha + 0.5;
  const travel = s * lane.speed * DT;
  const cellLeft = PLAYER_COLUMN_X - PLAYER_HITBOX_WIDTH / 2;
  const cellRight = PLAYER_COLUMN_X + PLAYER_HITBOX_WIDTH / 2;
  const W = lane.obstacleWidth;
  const bodies: ObstacleBody[] = [];
  for (let k = -4; k <= 4; k++) {
    let left: number;
    if (lane.direction > 0) {
      const lead = cellLeft + travel + k * lane.spacing;
      left = lead - W;
    } else {
      left = cellRight - travel + k * lane.spacing;
    }
    const right = left + W;
    if (right < -W || left > WORLD_WIDTH + W) continue;
    bodies.push({ left, right });
  }
  bodies.sort((a, b) => a.left - b.left);
  return bodies;
}

// ---- Layout generation ------------------------------------------------------------

function pick<T>(options: readonly T[], rng: () => number): T {
  return options[Math.min(options.length - 1, Math.floor(rng() * options.length))]!;
}

/**
 * Local check used while generating: does lane `next` offer a robust forward escape for a
 * player in lane `prev` at every moment `prev` closes, even for the latest reasonable
 * landing? This mirrors the verifier's rules for one lane pair; the full verifier is
 * still the final gate.
 */
export function coversClosings(prev: LaneLayout, next: LaneLayout, reactionTicks = REACTION_TICKS): boolean {
  if (prev.blockedTicks <= 0) return true;
  const landingMargin = landingMarginTicks(reactionTicks);
  const L = lcm(prev.periodTicks, next.periodTicks);
  const nextLayout = makeLayout([next], 0);
  const nextClearRun = (t: number): number => {
    let run = 0;
    while (run < L && !isBlocked(nextLayout, 1, t + run)) run++;
    return run;
  };
  // Required clearance in `next`: the glide's target part for every start in the
  // reaction window, then the landing margin.
  const needed = reactionTicks + STEP_TICKS - GLIDE_SOURCE_TICKS + landingMargin;
  for (let d = 0; d < L; d++) {
    const closing = mod(d + prev.phaseTicks, prev.periodTicks) === 0; // first blocked tick
    if (!closing) continue;
    let covered = false;
    // Latest reasonable landing is landingMargin before the deadline; the last robust
    // start keeps the source lane safe through the reaction window and the glide's
    // source part.
    for (let start = d - landingMargin; start <= d - reactionTicks - GLIDE_SOURCE_TICKS; start++) {
      if (nextClearRun(start + GLIDE_SOURCE_TICKS + 1) >= needed) {
        covered = true;
        break;
      }
    }
    if (!covered) return false;
  }
  return true;
}

/**
 * Deterministically generate a (not yet verified) layout from a seed. Period, width,
 * speed and direction are random per lane; each lane's phase is chosen so that it covers
 * the previous lane's closings (see coversClosings). The goal row covers the last lane.
 */
export function generateLayout(seed: number): Layout {
  const rng = createSeededRng(seed);
  const lanes: LaneLayout[] = [];
  for (let i = 0; i < LANE_COUNT; i++) {
    const direction: 1 | -1 = i % 2 === 0 ? 1 : -1;
    let periodTicks = pick(PERIOD_OPTIONS_TICKS, rng);
    const obstacleWidth = pick(OBSTACLE_WIDTH_OPTIONS, rng);
    // Keep the gap between obstacles at least MIN_GAP: spacing = speed * period.
    const minSpeedFor = (p: number) => Math.max(LANE_MIN_SPEED, ((obstacleWidth + MIN_GAP) * 60) / p);
    if (minSpeedFor(periodTicks) > LANE_MAX_SPEED) {
      periodTicks = PERIOD_OPTIONS_TICKS[PERIOD_OPTIONS_TICKS.length - 1]!;
    }
    const minSpeed = minSpeedFor(periodTicks);
    const speed = Math.round((minSpeed + rng() * (LANE_MAX_SPEED - minSpeed)) * 10) / 10;
    const lane: LaneLayout = {
      direction,
      periodTicks,
      phaseTicks: 0,
      blockedTicks: blockedTicksFor(obstacleWidth, speed),
      speed,
      obstacleWidth,
      spacing: (speed * periodTicks) / 60,
      style: i % 3,
    };
    const prev = lanes[i - 1];
    const firstPhase = Math.floor(rng() * periodTicks);
    lane.phaseTicks = firstPhase;
    if (prev) {
      // Try phases starting from a random offset; keep the first that covers `prev`. If
      // no phase works (periods differ), take the previous lane's period and retry.
      const tryPhases = (): boolean => {
        for (let k = 0; k < lane.periodTicks; k++) {
          lane.phaseTicks = (firstPhase + k) % lane.periodTicks;
          if (coversClosings(prev, lane)) return true;
        }
        return false;
      };
      if (!tryPhases() && lane.periodTicks !== prev.periodTicks) {
        lane.periodTicks = prev.periodTicks;
        const ms = minSpeedFor(lane.periodTicks);
        lane.speed = Math.round((ms + rng() * (LANE_MAX_SPEED - ms)) * 10) / 10;
        lane.blockedTicks = blockedTicksFor(obstacleWidth, lane.speed);
        lane.spacing = (lane.speed * lane.periodTicks) / 60;
        tryPhases();
      }
    }
    lanes.push(lane);
  }
  return makeLayout(lanes, seed);
}

/** Hand-designed layout used only if every generated candidate fails verification. */
export const FALLBACK_LAYOUT: Layout = makeLayout(
  [0, 140, 100, 60, 20, 160].map((phaseTicks, i) => {
    const speed = 90;
    const obstacleWidth = 56;
    return {
      direction: (i % 2 === 0 ? 1 : -1) as 1 | -1,
      periodTicks: 180,
      phaseTicks,
      blockedTicks: blockedTicksFor(obstacleWidth, speed),
      speed,
      obstacleWidth,
      spacing: (speed * 180) / 60,
      style: i % 3,
    };
  }),
  0,
);

// ---- Verifier ---------------------------------------------------------------------
//
// The game is modelled as a reachability game over states (row, tick mod L) where L is
// the layout's hyperperiod. From a state the player can:
//   - glide Forward/Back, if the glide is safe when started at any tick within the
//     reaction window, the lane stays safe while reacting, and the target lane stays safe
//     for the landing margin after the latest landing ("robust" move). The arrival tick
//     depends on how fast the human reacts, so a move leads to a *set* of outcome states,
//     and the move is only winning if every outcome is winning;
//   - wait one tick, as long as the lane stays safe and a robust escape still exists
//     before the lane next closes. An attentive player never waits past that point of no
//     return, and a lane state with no robust escape before its deadline is a trap.
// Safe rows are never blocked.
//
//   solvable: the goal row is reachable from (start row, startTick).
//   noTraps:  every state reachable that way is winning, i.e. the goal is still reachable.

export interface VerifyOptions {
  reactionTicks?: number;
  startTick?: number;
}

export interface Verification {
  ok: boolean;
  solvable: boolean;
  noTraps: boolean;
  hyperperiodTicks: number;
  reachableStates: number;
  losingReachableStates: number;
  /** Number of (state, move) pairs the verifier considers available with the margin. */
  availableMoves: number;
  /** Same count broken down by row (debugging aid). */
  availableByRow: number[];
  /** Reachable states broken down by row (debugging aid). */
  reachableByRow: number[];
}

type Move = Button | null;

interface Graph {
  L: number;
  N: number;
  start: number;
  reachable: Uint8Array;
  winning: Uint8Array;
  /** 0 none, 1 wait, 2 forward, 3 back: the action that makes the state winning. */
  via: Uint8Array;
  goalReached: boolean;
  availableMoves: number;
  availableByRow: number[];
}

const ACTION_WAIT = 1;
const ACTION_FORWARD = 2;
const ACTION_BACK = 3;

function buildGraph(layout: Layout, reactionTicks: number, startTick: number): Graph {
  const L = layout.hyperperiodTicks;
  const N = ROW_COUNT * L;
  const idx = (row: number, t: number): number => row * L + mod(t, L);

  // blocked[row][t]
  const blocked = new Uint8Array(N);
  for (let row = 1; row <= LANE_COUNT; row++) {
    for (let t = 0; t < L; t++) if (isBlocked(layout, row, t)) blocked[row * L + t] = 1;
  }

  // safeRun[s] = consecutive safe ticks starting at s (cyclic, capped at L).
  const safeRun = new Int32Array(N);
  for (let row = 0; row < ROW_COUNT; row++) {
    let run = 0;
    // Two passes around the cycle so the wrap is handled.
    for (let pass = 0; pass < 2; pass++) {
      for (let t = L - 1; t >= 0; t--) {
        const s = row * L + t;
        run = blocked[s] ? 0 : Math.min(L, run + 1);
        safeRun[s] = run;
      }
    }
  }

  // glideOk[dir][s]: glide from row at tick t is safe when pressed at t. dir 0 forward, 1 back.
  const glideOk = [new Uint8Array(N), new Uint8Array(N)];
  for (let row = 0; row <= TOP_ROW; row++) {
    for (let t = 0; t < L; t++) {
      const s = row * L + t;
      if (row < TOP_ROW && glideSafe(layout, row, row + 1, t)) glideOk[0]![s] = 1;
      if (row > 0 && glideSafe(layout, row, row - 1, t)) glideOk[1]![s] = 1;
    }
  }
  // glideRun[dir][s] = consecutive glide-safe start ticks from s.
  const glideRun = [new Int32Array(N), new Int32Array(N)];
  for (let dir = 0; dir < 2; dir++) {
    for (let row = 0; row < ROW_COUNT; row++) {
      let run = 0;
      for (let pass = 0; pass < 2; pass++) {
        for (let t = L - 1; t >= 0; t--) {
          const s = row * L + t;
          run = glideOk[dir]![s] ? Math.min(L, run + 1) : 0;
          glideRun[dir]![s] = run;
        }
      }
    }
  }

  const landingMargin = landingMarginTicks(reactionTicks);

  /** Move available with the reaction margin: safe for every start in [t, t+R). */
  const available = (row: number, t: number, dir: number): boolean => {
    const s = idx(row, t);
    if (glideRun[dir]![s]! < reactionTicks) return false;
    // While reacting (up to R-1 ticks) the player stands in the current row.
    if (reactionTicks > 1 && row !== 0 && row !== TOP_ROW && safeRun[idx(row, t + 1)]! < reactionTicks - 1) {
      return false;
    }
    // The target lane must stay safe for the landing margin after the latest landing.
    const to = dir === 0 ? row + 1 : row - 1;
    if (to !== 0 && to !== TOP_ROW) {
      const latestLanding = t + reactionTicks - 1 + STEP_TICKS;
      if (safeRun[idx(to, latestLanding)]! < landingMargin) return false;
    }
    return true;
  };

  // escapeAhead[s]: from this lane state, a robust move exists at some tick before the
  // lane next closes. Safe rows always qualify.
  const escapeAhead = new Uint8Array(N);
  for (let row = 0; row < ROW_COUNT; row++) {
    if (row === 0 || row === TOP_ROW) {
      escapeAhead.fill(1, row * L, row * L + L);
      continue;
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let t = L - 1; t >= 0; t--) {
        const s = row * L + t;
        if (blocked[s]) {
          escapeAhead[s] = 0;
          continue;
        }
        const here = available(row, t, 0) || available(row, t, 1);
        const next = idx(row, t + 1);
        escapeAhead[s] = here || (!blocked[next] && escapeAhead[next] === 1) ? 1 : 0;
      }
    }
  }

  /** Waiting one tick is allowed while the lane stays safe and an escape remains ahead. */
  const canWait = (row: number, t: number): boolean => {
    const next = idx(row, t + 1);
    return !blocked[next] && escapeAhead[next] === 1;
  };

  // Reverse edges for the attractor.
  const predWait: number[][] = Array.from({ length: N }, () => []);
  const revMove: number[][] = Array.from({ length: N }, () => []); // entries: s*2+dir
  const pending = new Int32Array(N * 2);
  const avail = new Uint8Array(N * 2);

  for (let row = 0; row < TOP_ROW; row++) {
    for (let t = 0; t < L; t++) {
      const s = row * L + t;
      if (canWait(row, t)) predWait[idx(row, t + 1)]!.push(s);
      for (let dir = 0; dir < 2; dir++) {
        const to = dir === 0 ? row + 1 : row - 1;
        if (to < 0) continue;
        if (!available(row, t, dir)) continue;
        avail[s * 2 + dir] = 1;
        for (let d = 0; d < reactionTicks; d++) {
          const o = idx(to, t + d + STEP_TICKS);
          revMove[o]!.push(s * 2 + dir);
          pending[s * 2 + dir]!++;
        }
      }
    }
  }

  // Forward reachability from the start state.
  const start = idx(0, startTick);
  const reachable = new Uint8Array(N);
  const queue: number[] = [start];
  reachable[start] = 1;
  let goalReached = false;
  for (let qi = 0; qi < queue.length; qi++) {
    const s = queue[qi]!;
    const row = Math.floor(s / L);
    const t = s - row * L;
    if (row === TOP_ROW) {
      goalReached = true;
      continue;
    }
    const pushState = (o: number): void => {
      if (!reachable[o]) {
        reachable[o] = 1;
        queue.push(o);
      }
    };
    if (canWait(row, t)) pushState(idx(row, t + 1));
    for (let dir = 0; dir < 2; dir++) {
      if (!avail[s * 2 + dir]) continue;
      const to = dir === 0 ? row + 1 : row - 1;
      for (let d = 0; d < reactionTicks; d++) pushState(idx(to, t + d + STEP_TICKS));
    }
  }

  // Attractor: a state is winning if waiting leads to a winning state, or some available
  // move has every outcome winning. Goal states are winning.
  const winning = new Uint8Array(N);
  const via = new Uint8Array(N);
  const work: number[] = [];
  for (let t = 0; t < L; t++) {
    const g = TOP_ROW * L + t;
    winning[g] = 1;
    work.push(g);
  }
  for (let wi = 0; wi < work.length; wi++) {
    const w = work[wi]!;
    for (const s of predWait[w]!) {
      if (!winning[s]) {
        winning[s] = 1;
        via[s] = ACTION_WAIT;
        work.push(s);
      }
    }
    for (const e of revMove[w]!) {
      pending[e]!--;
      if (pending[e] === 0) {
        const s = e >> 1;
        if (!winning[s]) {
          winning[s] = 1;
          via[s] = (e & 1) === 0 ? ACTION_FORWARD : ACTION_BACK;
          work.push(s);
        }
      }
    }
  }

  let availableMoves = 0;
  const availableByRow: number[] = new Array<number>(ROW_COUNT).fill(0);
  for (let i = 0; i < avail.length; i++) {
    if (avail[i]) {
      availableMoves++;
      availableByRow[Math.floor(i / 2 / L)]!++;
    }
  }
  return { L, N, start, reachable, winning, via, goalReached, availableMoves, availableByRow };
}

/** Check a layout: solvable from the start, and no reachable state is a dead end. */
export function verifyLayout(layout: Layout, options: VerifyOptions = {}): Verification {
  const reactionTicks = Math.max(1, options.reactionTicks ?? REACTION_TICKS);
  const g = buildGraph(layout, reactionTicks, options.startTick ?? 0);
  let reachableStates = 0;
  let losing = 0;
  const reachableByRow: number[] = new Array<number>(ROW_COUNT).fill(0);
  for (let s = 0; s < g.N; s++) {
    if (!g.reachable[s]) continue;
    reachableStates++;
    reachableByRow[Math.floor(s / g.L)]!++;
    if (!g.winning[s]) losing++;
  }
  const solvable = g.goalReached;
  const noTraps = losing === 0;
  return {
    ok: solvable && noTraps,
    solvable,
    noTraps,
    hyperperiodTicks: g.L,
    reachableStates,
    losingReachableStates: losing,
    availableMoves: g.availableMoves,
    availableByRow: g.availableByRow,
    reachableByRow,
  };
}

/**
 * Extract a winning action sequence from the verifier's strategy, one entry per tick
 * ("LEFT", "RIGHT" or null for wait), assuming the fastest reaction. Null if the start
 * state is not winning.
 */
export function findWinningPlan(layout: Layout, startTick = 0, options: VerifyOptions = {}): Move[] | null {
  const reactionTicks = Math.max(1, options.reactionTicks ?? REACTION_TICKS);
  const g = buildGraph(layout, reactionTicks, startTick);
  if (!g.winning[g.start]) return null;
  const plan: Move[] = [];
  let row = 0;
  let t = startTick;
  const limit = g.L * ROW_COUNT * 4;
  while (row !== TOP_ROW && plan.length < limit) {
    const s = row * g.L + mod(t, g.L);
    switch (g.via[s]) {
      case ACTION_WAIT:
        plan.push(null);
        t += 1;
        break;
      case ACTION_FORWARD:
        plan.push("RIGHT");
        for (let k = 1; k < STEP_TICKS; k++) plan.push(null);
        row += 1;
        t += STEP_TICKS;
        break;
      case ACTION_BACK:
        plan.push("LEFT");
        for (let k = 1; k < STEP_TICKS; k++) plan.push(null);
        row -= 1;
        t += STEP_TICKS;
        break;
      default:
        return null;
    }
  }
  return row === TOP_ROW ? plan : null;
}

export interface GenerationResult {
  layout: Layout;
  attempts: number;
  usedFallback: boolean;
}

export interface GenerationOptions {
  maxAttempts?: number;
}

/** Generate -> verify -> accept, advancing the seed on failure; falls back if all fail. */
export function generateVerifiedLayout(seed: number, options: GenerationOptions = {}): GenerationResult {
  const maxAttempts = options.maxAttempts ?? MAX_GENERATION_ATTEMPTS;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidateSeed = (seed + Math.imul(attempt, 0x9e3779b9)) >>> 0;
    const layout = generateLayout(candidateSeed);
    if (verifyLayout(layout).ok) return { layout, attempts: attempt + 1, usedFallback: false };
  }
  return { layout: FALLBACK_LAYOUT, attempts: maxAttempts, usedFallback: true };
}

// ---- State ------------------------------------------------------------------------

export function createState(seed: number, options: CreateStateOptions = {}): GameState {
  let layout: Layout;
  let layoutInfo: LayoutInfo;
  if (options.layout) {
    layout = options.layout;
    layoutInfo = { attempts: 0, usedFallback: false };
  } else {
    const result = generateVerifiedLayout(seed);
    layout = result.layout;
    layoutInfo = { attempts: result.attempts, usedFallback: result.usedFallback };
  }
  return {
    phase: "READY",
    seed,
    layout,
    layoutInfo,
    tick: 0,
    playerRow: 0,
    glide: null,
    bufferedPress: null,
    phaseMs: 0,
    timeMs: 0,
    accumulatorMs: 0,
    completionFired: false,
    hits: 0,
  };
}

/** The row used for collision right now (see glideRowAt). */
export function collisionRow(state: GameState): number {
  const g = state.glide;
  if (!g) return state.playerRow;
  return glideRowAt(g.fromRow, g.toRow, g.elapsedTicks);
}

/**
 * The row to draw the player in, eased (cubic ease-out) along the current glide.
 * `alpha` in [0, 1) is the fraction of a tick elapsed since the last one.
 */
export function playerVisualRow(state: GameState, alpha = 0): number {
  const g = state.glide;
  if (!g) return state.playerRow;
  const p = Math.min(1, Math.max(0, ((g.elapsedTicks + alpha) * TICK_MS) / STEP_DURATION_MS));
  const eased = 1 - Math.pow(1 - p, 3);
  return g.fromRow + (g.toRow - g.fromRow) * eased;
}

/** Glide progress in [0, 1] for visual effects. */
export function glideProgress(state: GameState, alpha = 0): number {
  const g = state.glide;
  if (!g) return 0;
  return Math.min(1, Math.max(0, ((g.elapsedTicks + alpha) * TICK_MS) / STEP_DURATION_MS));
}

/** Compatibility helper: whether `row` is blocked `dtMs` from now. */
export function rowOccupiedAt(state: GameState, row: number, dtMs: number): boolean {
  return isBlocked(state.layout, row, state.tick + Math.round(dtMs / TICK_MS));
}

/** Compatibility helper: ms until `row` is next blocked (0 if now, Infinity if never). */
export function rowClearForMs(state: GameState, row: number): number {
  if (row < 1 || row > LANE_COUNT) return Infinity;
  for (let k = 0; k <= state.layout.hyperperiodTicks; k++) {
    if (isBlocked(state.layout, row, state.tick + k)) return k * TICK_MS;
  }
  return Infinity;
}

function setPhase(state: GameState, phase: Phase): void {
  state.phase = phase;
  state.phaseMs = 0;
}

function checkCollision(state: GameState): void {
  const row = collisionRow(state);
  if (isBlocked(state.layout, row, state.tick)) {
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
  state.glide = { fromRow: state.playerRow, toRow: target, elapsedTicks: 0 };
  state.playerRow = target;
}

/** Advance the current glide; when it ends, finish the crossing or run the buffered press. */
function advanceGlide(state: GameState): void {
  const g = state.glide;
  if (!g) return;
  g.elapsedTicks += 1;
  if (g.elapsedTicks < STEP_TICKS) return;
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
  state.tick += 1;
  state.timeMs += TICK_MS;
  state.phaseMs += TICK_MS;

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
      // No internal retry - controller will restart via onFail
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
  const state = createState(opts.seed ?? 1, opts.layout ? { layout: opts.layout } : {});
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
