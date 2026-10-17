import { describe, expect, it } from "vitest";
import {
  FALLBACK_LAYOUT,
  HIT_LOCKOUT_MS,
  LANE_COUNT,
  MAX_GENERATION_ATTEMPTS,
  MAX_HYPERPERIOD_TICKS,
  PERIOD_OPTIONS_TICKS,
  PERIOD_UNIT_TICKS,
  PLAYER_COLUMN_X,
  PLAYER_HITBOX_SCALE,
  PLAYER_HITBOX_WIDTH,
  PLAYER_WIDTH,
  REACTION_MS,
  REACTION_TICKS,
  STEP_DURATION_MS,
  STEP_TICKS,
  SUCCESS_HOLD_MS,
  TICK_MS,
  TOP_ROW,
  blockedTicksFor,
  collisionRow,
  createGame,
  createSeededRng,
  createState,
  findWinningPlan,
  generateLayout,
  generateVerifiedLayout,
  glideRowAt,
  isBlocked,
  labelsFor,
  makeLayout,
  obstacleBodiesAt,
  playerVisualRow,
  press,
  step,
  tick,
  verifyLayout,
  type Button,
  type ControlLabels,
  type GameState,
  type LaneLayout,
  type Layout,
} from "../../src/minigames/g2-lane-crossing/logic";

// ---- helpers ------------------------------------------------------------------

function ticksFor(state: GameState, ms: number): void {
  const n = Math.ceil(ms / TICK_MS);
  for (let i = 0; i < n; i++) tick(state);
}

/** Press, then tick until the glide has finished. */
function pressAndSettle(state: GameState, button: Button): void {
  press(state, button);
  for (let i = 0; i < STEP_TICKS + 1; i++) tick(state);
}

const EMPTY_LANE: LaneLayout = {
  direction: 1,
  periodTicks: 90,
  phaseTicks: 0,
  blockedTicks: 0,
  speed: 90,
  obstacleWidth: 56,
  spacing: 135,
  style: 0,
};

/** Build a layout from partial lane descriptions; unspecified lanes are empty. */
function layoutOf(overrides: Array<Partial<LaneLayout> | undefined>): Layout {
  const lanes: LaneLayout[] = [];
  for (let i = 0; i < LANE_COUNT; i++) {
    const o = overrides[i] ?? {};
    lanes.push({ ...EMPTY_LANE, direction: i % 2 === 0 ? 1 : -1, ...o });
  }
  return makeLayout(lanes, 0);
}

/** A lane that is blocked at the player column at every tick. */
const ALWAYS_BLOCKED: Partial<LaneLayout> = { periodTicks: 90, blockedTicks: 90 };

function emptyState(): GameState {
  return createState(1, { layout: layoutOf([]) });
}

/** Replay a plan through the real game logic. Returns ticks spent. */
function replay(state: GameState, plan: Array<Button | null>): number {
  press(state, "RIGHT"); // READY -> PLAYING, no movement
  let ticks = 0;
  for (const move of plan) {
    if (move) press(state, move);
    tick(state);
    ticks++;
    if (state.phase !== "PLAYING") break;
  }
  return ticks;
}

// ---- state machine and labels -----------------------------------------------------

describe("state machine and labels", () => {
  it("starts in READY on the bottom row at tick 0", () => {
    const s = createState(1);
    expect(s.phase).toBe("READY");
    expect(s.playerRow).toBe(0);
    expect(s.tick).toBe(0);
    expect(s.layout.lanes).toHaveLength(LANE_COUNT);
    expect(s.glide).toBeNull();
    expect(s.bufferedPress).toBeNull();
  });

  it("maps every phase to the contract's labels", () => {
    expect(labelsFor("READY")).toEqual({ left: "Start", right: "Start" });
    expect(labelsFor("PLAYING")).toEqual({ left: "Back", right: "Forward" });
    expect(labelsFor("HIT")).toEqual({ left: "Retry", right: "Retry" });
    expect(labelsFor("SUCCESS")).toEqual({ left: "—", right: "—" });
  });

  it("either button starts the game without moving the player", () => {
    for (const b of ["LEFT", "RIGHT"] as const) {
      const s = createState(1);
      press(s, b);
      expect(s.phase).toBe("PLAYING");
      expect(s.playerRow).toBe(0);
    }
  });

  it("obstacles move while READY (the tick counter advances)", () => {
    const s = createState(2);
    const lane = s.layout.lanes[0]!;
    const before = obstacleBodiesAt(lane, s.tick);
    ticksFor(s, 500);
    expect(s.tick).toBe(30);
    expect(obstacleBodiesAt(lane, s.tick)).not.toEqual(before);
  });
});

// ---- movement --------------------------------------------------------------------

describe("movement", () => {
  it("RIGHT steps forward one row and LEFT steps back one row", () => {
    const s = emptyState();
    press(s, "RIGHT");
    pressAndSettle(s, "RIGHT");
    expect(s.playerRow).toBe(1);
    pressAndSettle(s, "RIGHT");
    expect(s.playerRow).toBe(2);
    pressAndSettle(s, "LEFT");
    expect(s.playerRow).toBe(1);
  });

  it("LEFT at the start row does not move below it and starts no glide", () => {
    const s = emptyState();
    press(s, "RIGHT");
    press(s, "LEFT");
    expect(s.playerRow).toBe(0);
    expect(s.glide).toBeNull();
    pressAndSettle(s, "LEFT");
    expect(s.playerRow).toBe(0);
    expect(s.phase).toBe("PLAYING");
  });
});

// ---- glide and buffering -------------------------------------------------------------

describe("glide and input buffering", () => {
  it("a step glides for STEP_TICKS ticks and then settles", () => {
    expect(STEP_TICKS).toBe(Math.ceil(STEP_DURATION_MS / TICK_MS));
    const s = emptyState();
    press(s, "RIGHT");
    press(s, "RIGHT");
    expect(s.glide).toEqual({ fromRow: 0, toRow: 1, elapsedTicks: 0 });
    for (let i = 0; i < STEP_TICKS - 1; i++) tick(s);
    expect(s.glide).not.toBeNull();
    tick(s);
    expect(s.glide).toBeNull();
    expect(s.playerRow).toBe(1);
  });

  it("the visual row eases out from the source to the target row", () => {
    const s = emptyState();
    press(s, "RIGHT");
    press(s, "RIGHT");
    expect(playerVisualRow(s)).toBe(0);
    let prev = 0;
    for (let i = 0; i < STEP_TICKS; i++) {
      tick(s);
      const v = playerVisualRow(s);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
    expect(playerVisualRow(s)).toBe(1);
    const t = emptyState();
    press(t, "RIGHT");
    press(t, "RIGHT");
    for (let i = 0; i < Math.floor(STEP_TICKS / 2); i++) tick(t);
    expect(playerVisualRow(t)).toBeGreaterThan(0.5);
  });

  it("a press during a glide is buffered and runs after it; further presses are ignored", () => {
    const s = emptyState();
    press(s, "RIGHT");
    press(s, "RIGHT"); // glide 0 -> 1
    press(s, "RIGHT"); // buffered
    press(s, "RIGHT"); // ignored
    press(s, "LEFT"); // ignored too
    expect(s.bufferedPress).toBe("RIGHT");
    expect(s.playerRow).toBe(1);
    for (let i = 0; i < STEP_TICKS; i++) tick(s);
    expect(s.bufferedPress).toBeNull();
    expect(s.glide).toEqual({ fromRow: 1, toRow: 2, elapsedTicks: 0 });
    for (let i = 0; i < STEP_TICKS; i++) tick(s);
    expect(s.glide).toBeNull();
    ticksFor(s, 1000);
    expect(s.playerRow).toBe(2);
  });

  it("LEFT during a forward glide is buffered as a quick reversal", () => {
    const s = emptyState();
    press(s, "RIGHT");
    press(s, "RIGHT");
    press(s, "LEFT");
    for (let i = 0; i < STEP_TICKS; i++) tick(s);
    expect(s.glide).toEqual({ fromRow: 1, toRow: 0, elapsedTicks: 0 });
    for (let i = 0; i < STEP_TICKS; i++) tick(s);
    expect(s.playerRow).toBe(0);
    expect(s.phase).toBe("PLAYING");
  });
});

// ---- collision: one shared function ------------------------------------------------------

describe("collision function and hitbox", () => {
  it("glideRowAt uses the source row before halfway and the target row after", () => {
    const halfway = Math.ceil(STEP_DURATION_MS / 2 / TICK_MS);
    for (let k = 0; k < halfway; k++) expect(glideRowAt(2, 3, k)).toBe(2);
    for (let k = halfway; k <= STEP_TICKS; k++) expect(glideRowAt(2, 3, k)).toBe(3);
  });

  it("gameplay uses the source lane before the halfway point", () => {
    const s = emptyState();
    press(s, "RIGHT");
    pressAndSettle(s, "RIGHT"); // standing in row 1
    press(s, "RIGHT"); // glide 1 -> 2
    Object.assign(s.layout.lanes[0]!, ALWAYS_BLOCKED); // lane being left becomes blocked
    expect(collisionRow(s)).toBe(1);
    tick(s);
    expect(s.phase).toBe("HIT");
  });

  it("gameplay uses the target lane only after the halfway point", () => {
    const s = createState(1, { layout: layoutOf([ALWAYS_BLOCKED]) });
    press(s, "RIGHT");
    press(s, "RIGHT"); // glide 0 -> 1 into a blocked lane
    let n = 0;
    while (s.phase === "PLAYING" && n <= STEP_TICKS) {
      tick(s);
      n++;
    }
    expect(s.phase).toBe("HIT");
    expect(n).toBe(Math.ceil(STEP_DURATION_MS / 2 / TICK_MS));
    expect(n).toBeGreaterThan(1);
  });

  it("the collision box is 75% of the drawn size and drives the blocked window", () => {
    expect(PLAYER_HITBOX_SCALE).toBe(0.75);
    expect(PLAYER_HITBOX_WIDTH).toBeCloseTo(PLAYER_WIDTH * 0.75, 9);
    // An obstacle of width W at speed v occupies the cell for (W + hitbox) / v seconds.
    expect(blockedTicksFor(56, 90)).toBe(Math.ceil(((56 + PLAYER_HITBOX_WIDTH) / 90) * 60));
  });

  it("isBlocked is periodic and respects phase", () => {
    const layout = layoutOf([{ periodTicks: 90, phaseTicks: 10, blockedTicks: 30 }]);
    for (let t = 0; t < 400; t++) {
      const s = (t + 10) % 90;
      expect(isBlocked(layout, 1, t)).toBe(s < 30);
    }
    expect(isBlocked(layout, 0, 5)).toBe(false);
    expect(isBlocked(layout, TOP_ROW, 5)).toBe(false);
    expect(isBlocked(layout, 2, 5)).toBe(false); // empty lane
  });

  it("drawn obstacle bodies agree with isBlocked at the player column", () => {
    const rng = createSeededRng(99);
    const cellLeft = PLAYER_COLUMN_X - PLAYER_HITBOX_WIDTH / 2;
    const cellRight = PLAYER_COLUMN_X + PLAYER_HITBOX_WIDTH / 2;
    for (let i = 0; i < 300; i++) {
      const layout = generateLayout(Math.floor(rng() * 1e9));
      const row = 1 + Math.floor(rng() * LANE_COUNT);
      const lane = layout.lanes[row - 1]!;
      const t = Math.floor(rng() * layout.hyperperiodTicks);
      const bodies = obstacleBodiesAt(lane, t);
      // Half a tick of travel is the only tolerance between the integer window and geometry.
      const tol = (lane.speed * TICK_MS) / 1000 / 2 + 1e-6;
      const overlapsLoose = bodies.some((b) => b.left < cellRight + tol && b.right > cellLeft - tol);
      const overlapsTight = bodies.some((b) => b.left < cellRight - tol && b.right > cellLeft + tol);
      if (isBlocked(layout, row, t)) expect(overlapsLoose, `seed/tick ${i}`).toBe(true);
      else expect(overlapsTight, `seed/tick ${i}`).toBe(false);
      // Bodies are exactly the obstacle width (never narrower than the collision box).
      for (const b of bodies) expect(b.right - b.left).toBeCloseTo(lane.obstacleWidth, 6);
    }
  });
});

// ---- layout generation --------------------------------------------------------------------

describe("layout generation", () => {
  it("lane periods are integer multiples of the unit and bound the hyperperiod", () => {
    for (const p of PERIOD_OPTIONS_TICKS) expect(p % PERIOD_UNIT_TICKS).toBe(0);
    for (let seed = 1; seed <= 50; seed++) {
      const layout = generateLayout(seed);
      for (const lane of layout.lanes) {
        expect(Number.isInteger(lane.periodTicks)).toBe(true);
        expect(PERIOD_OPTIONS_TICKS).toContain(lane.periodTicks);
        expect(Number.isInteger(lane.phaseTicks)).toBe(true);
        expect(Number.isInteger(lane.blockedTicks)).toBe(true);
        expect(lane.blockedTicks).toBeGreaterThan(0);
        expect(lane.blockedTicks).toBeLessThan(lane.periodTicks);
        expect(lane.spacing).toBeCloseTo((lane.speed * lane.periodTicks) / 60, 6);
      }
      expect(layout.hyperperiodTicks).toBeLessThanOrEqual(MAX_HYPERPERIOD_TICKS);
      for (const lane of layout.lanes) expect(layout.hyperperiodTicks % lane.periodTicks).toBe(0);
    }
  });

  it("is deterministic for a seed and lanes alternate direction", () => {
    expect(generateLayout(7)).toEqual(generateLayout(7));
    const l = generateLayout(7);
    for (let i = 1; i < l.lanes.length; i++) expect(l.lanes[i]!.direction).toBe(-l.lanes[i - 1]!.direction);
  });

  it("reaction margin is about 250 ms", () => {
    expect(REACTION_MS).toBe(250);
    expect(REACTION_TICKS).toBe(Math.round(REACTION_MS / TICK_MS));
  });
});

// ---- verifier --------------------------------------------------------------------------

describe("verifier", () => {
  it("fuzz: 1000 seeds produce layouts that are solvable and trap-free", () => {
    let fallbacks = 0;
    let totalAttempts = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const result = generateVerifiedLayout(seed);
      const v = verifyLayout(result.layout);
      expect(v.solvable, `seed ${seed}`).toBe(true);
      expect(v.noTraps, `seed ${seed}`).toBe(true);
      expect(v.ok, `seed ${seed}`).toBe(true);
      if (result.usedFallback) fallbacks++;
      totalAttempts += result.attempts;
      expect(result.attempts).toBeLessThanOrEqual(MAX_GENERATION_ATTEMPTS);
    }
    // The generator should almost never need the hand-made fallback.
    expect(fallbacks).toBeLessThanOrEqual(10);
    expect(totalAttempts / 1000).toBeLessThan(MAX_GENERATION_ATTEMPTS / 2);
  });

  it("replay proof: a plan from the verifier wins through the real game logic", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { layout } = generateVerifiedLayout(seed);
      const plan = findWinningPlan(layout, 0);
      expect(plan, `seed ${seed}`).not.toBeNull();
      const s = createState(seed, { layout });
      const ticks = replay(s, plan!);
      expect(s.phase, `seed ${seed}`).toBe("SUCCESS");
      expect(s.hits, `seed ${seed}`).toBe(0);
      expect(ticks).toBeLessThanOrEqual(plan!.length);
    }
  });

  it("replay proof also holds from arbitrary start ticks (retry keeps the layout)", () => {
    for (let seed = 101; seed <= 120; seed++) {
      const { layout } = generateVerifiedLayout(seed);
      const s = createState(seed, { layout });
      ticksFor(s, (seed * 977) % 7000); // wait in READY for a while
      const plan = findWinningPlan(layout, s.tick);
      expect(plan, `seed ${seed}`).not.toBeNull();
      replay(s, plan!);
      expect(s.phase, `seed ${seed}`).toBe("SUCCESS");
    }
  });

  it("trap detection: ahead and behind blocked when the current lane closes fails the no-trap check", () => {
    // All periods 180. Lane 1 clear [0,120); lane 2 clear [20,150); lane 3 clear [40,110).
    // Route: lane 1 -> lane 2 (t in [16,94]) -> lane 3 (t in [36,54]) -> empty lanes -> goal.
    // Trap: a player who reaches lane 2 after t=64 has no escape: lane 2 closes at 150
    // while lane 1 (blocked from 120) and lane 3 (blocked from 110) are both blocked.
    const layout = layoutOf([
      { periodTicks: 180, phaseTicks: 60, blockedTicks: 60 },
      { periodTicks: 180, phaseTicks: 30, blockedTicks: 50 },
      { periodTicks: 180, phaseTicks: 70, blockedTicks: 110 },
    ]);
    const v = verifyLayout(layout);
    expect(v.solvable).toBe(true);
    expect(v.noTraps).toBe(false);
    expect(v.ok).toBe(false);
  });

  it("frame-perfect detection: a layout solvable only with zero reaction margin fails", () => {
    // Lane 1 is clear for just 12 ticks per period: enough to glide in and straight out
    // with perfect timing, far short of the reaction window. Other lanes are empty.
    const layout = layoutOf([{ periodTicks: 90, phaseTicks: 0, blockedTicks: 78 }]);
    expect(verifyLayout(layout, { reactionTicks: 1 }).solvable).toBe(true);
    const v = verifyLayout(layout);
    expect(v.solvable).toBe(false);
    expect(v.ok).toBe(false);
  });

  it("an always-blocked lane is unsolvable", () => {
    const v = verifyLayout(layoutOf([undefined, ALWAYS_BLOCKED]));
    expect(v.solvable).toBe(false);
    expect(v.ok).toBe(false);
  });

  it("FALLBACK_LAYOUT passes verification and is not trivial", () => {
    const v = verifyLayout(FALLBACK_LAYOUT);
    expect(v.ok).toBe(true);
    for (const lane of FALLBACK_LAYOUT.lanes) expect(lane.blockedTicks).toBeGreaterThan(0);
    const plan = findWinningPlan(FALLBACK_LAYOUT, 0);
    const s = createState(0, { layout: FALLBACK_LAYOUT });
    replay(s, plan!);
    expect(s.phase).toBe("SUCCESS");
  });

  it("generateVerifiedLayout falls back when every attempt fails", () => {
    const result = generateVerifiedLayout(1, { maxAttempts: 0 });
    expect(result.usedFallback).toBe(true);
    expect(result.layout).toBe(FALLBACK_LAYOUT);
  });
});

// ---- hits and retry ------------------------------------------------------------------------

describe("hits and retry", () => {
  function hitInLane1(): GameState {
    const s = createState(1, { layout: layoutOf([ALWAYS_BLOCKED]) });
    press(s, "RIGHT");
    pressAndSettle(s, "RIGHT");
    expect(s.phase).toBe("HIT");
    return s;
  }

  it("stepping into an occupied cell triggers HIT and freezes the player in that lane", () => {
    const s = hitInLane1();
    expect(s.hits).toBe(1);
    expect(s.playerRow).toBe(1);
    expect(s.glide).toBeNull();
  });

  it("an obstacle arriving at a standing player triggers HIT", () => {
    const s = createState(1, { layout: layoutOf([{ periodTicks: 90, phaseTicks: 45, blockedTicks: 30 }]) });
    press(s, "RIGHT");
    // Lane 1 is clear for ticks 0..44 then blocked from 45.
    pressAndSettle(s, "RIGHT");
    expect(s.phase).toBe("PLAYING");
    ticksFor(s, 2000);
    expect(s.phase).toBe("HIT");
  });

  it("ignores input during the lockout, then either button resets to READY on the start row", () => {
    const s = hitInLane1();
    ticksFor(s, HIT_LOCKOUT_MS / 2);
    press(s, "LEFT");
    expect(s.phase).toBe("HIT");
    ticksFor(s, HIT_LOCKOUT_MS);
    press(s, "LEFT");
    expect(s.phase).toBe("READY");
    expect(s.playerRow).toBe(0);
    expect(s.glide).toBeNull();
    expect(s.bufferedPress).toBeNull();
  });

  it("retry keeps the same verified layout and the lane clock keeps running", () => {
    const s = createState(3);
    const layout = s.layout;
    press(s, "RIGHT");
    // Walk forward blindly until hit.
    for (let i = 0; i < 200 && s.phase === "PLAYING"; i++) pressAndSettle(s, "RIGHT");
    expect(s.phase).toBe("HIT");
    const tickAtHit = s.tick;
    ticksFor(s, HIT_LOCKOUT_MS + TICK_MS);
    press(s, "RIGHT");
    expect(s.phase).toBe("READY");
    expect(s.layout).toBe(layout);
    expect(s.tick).toBeGreaterThan(tickAtHit);
  });

  it("controls respond immediately after a retry and a retry never marks completion", () => {
    const s = hitInLane1();
    ticksFor(s, HIT_LOCKOUT_MS + TICK_MS);
    press(s, "RIGHT"); // -> READY
    press(s, "RIGHT"); // -> PLAYING straight away
    expect(s.phase).toBe("PLAYING");
    ticksFor(s, 5000);
    expect(s.completionFired).toBe(false);
  });
});

// ---- completion ------------------------------------------------------------------------------

describe("completion signal", () => {
  function win(): GameState {
    const s = emptyState();
    press(s, "RIGHT");
    for (let i = 0; i < LANE_COUNT + 1; i++) pressAndSettle(s, "RIGHT");
    expect(s.phase).toBe("SUCCESS");
    return s;
  }

  it("marks completion once after the success hold, and stays marked", () => {
    const s = win();
    ticksFor(s, SUCCESS_HOLD_MS - s.phaseMs - TICK_MS * 2);
    expect(s.completionFired).toBe(false);
    ticksFor(s, TICK_MS * 4);
    expect(s.completionFired).toBe(true);
    press(s, "LEFT");
    press(s, "RIGHT");
    ticksFor(s, 5_000);
    expect(s.completionFired).toBe(true);
    expect(s.phase).toBe("SUCCESS");
    expect(s.playerRow).toBe(TOP_ROW);
  });

  it("createGame fires onComplete exactly once even with extra inputs and ticks", () => {
    let completions = 0;
    const seen: ControlLabels[] = [];
    const game = createGame({
      seed: 1,
      layout: layoutOf([]),
      onComplete: () => completions++,
      onLabels: (l) => seen.push(l),
    });
    game.press("RIGHT");
    for (let i = 0; i < LANE_COUNT + 1; i++) {
      game.press("RIGHT");
      game.step(STEP_DURATION_MS + TICK_MS * 2);
    }
    expect(game.state.phase).toBe("SUCCESS");
    expect(completions).toBe(0);
    for (let i = 0; i < 10; i++) game.step(200);
    expect(completions).toBe(1);
    game.press("LEFT");
    game.press("RIGHT");
    game.step(2_000);
    expect(completions).toBe(1);
    expect(seen).toEqual([
      { left: "Start", right: "Start" },
      { left: "Back", right: "Forward" },
      { left: "—", right: "—" },
    ]);
  });
});

// ---- dispose ----------------------------------------------------------------------------------

describe("dispose", () => {
  it("inputs and ticks after dispose do nothing", () => {
    const game = createGame({ seed: 1, layout: layoutOf([]) });
    game.dispose();
    game.press("RIGHT");
    game.press("RIGHT");
    game.step(1000);
    game.tick();
    expect(game.state.phase).toBe("READY");
    expect(game.state.playerRow).toBe(0);
    expect(game.state.tick).toBe(0);
  });

  it("is safe to call twice and suppresses a pending completion", () => {
    let completions = 0;
    let labelCalls = 0;
    const game = createGame({
      seed: 1,
      layout: layoutOf([]),
      onComplete: () => completions++,
      onLabels: () => labelCalls++,
    });
    game.press("RIGHT");
    for (let i = 0; i < LANE_COUNT + 1; i++) {
      game.press("RIGHT");
      game.step(STEP_DURATION_MS + TICK_MS * 2);
    }
    expect(game.state.phase).toBe("SUCCESS");
    const before = labelCalls;
    game.dispose();
    game.dispose();
    expect(game.disposed).toBe(true);
    game.step(SUCCESS_HOLD_MS * 3);
    expect(completions).toBe(0);
    expect(labelCalls).toBe(before);
  });
});

// ---- fixed timestep -----------------------------------------------------------------------------

describe("fixed timestep", () => {
  it("one 200 ms step equals twenty 10 ms steps", () => {
    const a = createState(9);
    const b = createState(9);
    step(a, 200);
    for (let i = 0; i < 20; i++) step(b, 10);
    expect(a.tick).toBe(b.tick);
    expect(a.tick).toBe(12);
  });

  it("clamps a huge frame gap instead of simulating it all", () => {
    const s = createState(1);
    step(s, 60_000);
    expect(s.timeMs).toBeLessThan(1_000);
  });
});
