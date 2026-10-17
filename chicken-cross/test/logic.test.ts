import { describe, expect, it } from "vitest";
import {
  HIT_LOCKOUT_MS,
  LANE_COUNT,
  MAX_GAP_WAIT_MS,
  MIN_CLEAR_WINDOW_MS,
  MIN_GAP,
  OBSTACLE_WIDTH,
  PLAYER_COLUMN_X,
  PLAYER_HITBOX_SCALE,
  PLAYER_HITBOX_WIDTH,
  PLAYER_WIDTH,
  STEP_DURATION_MS,
  SUCCESS_HOLD_MS,
  TICK_MS,
  TOP_ROW,
  TRACK_PAD,
  collisionRow,
  createGame,
  createState,
  labelsFor,
  playerVisualRow,
  press,
  rowClearForMs,
  rowOccupiedAt,
  step,
  tick,
  type Button,
  type ControlLabels,
  type GameState,
} from "../src/logic";

/** Ticks needed for a glide to finish. */
const STEP_TICKS = Math.ceil(STEP_DURATION_MS / TICK_MS);

function ticksFor(state: GameState, ms: number): void {
  const n = Math.ceil(ms / TICK_MS);
  for (let i = 0; i < n; i++) tick(state);
}

/** Press, then tick until the glide has finished. */
function pressAndSettle(state: GameState, button: Button): void {
  press(state, button);
  for (let i = 0; i < STEP_TICKS + 1; i++) tick(state);
}

/** Put a stationary obstacle centred on the player's column in the lane for `row`. */
function blockRow(state: GameState, row: number): void {
  const lane = state.lanes[row - 1]!;
  lane.speed = 0;
  lane.obstacles = [{ x: PLAYER_COLUMN_X - OBSTACLE_WIDTH / 2 + TRACK_PAD }];
}

type Move = Button | null;

/**
 * Plan a crossing the way a careful player would: at each tick either wait or start a
 * glide forward/back. A glide takes STEP_TICKS ticks, during which the source lane is
 * checked until halfway and the target lane after it, exactly like the logic. Breadth-
 * first over (tick, row), so the plan found is the fastest. Returns null if no crossing
 * exists within the horizon.
 */
function planCrossing(state: GameState, horizonMs: number, margin = 4): Move[] | null {
  const ticks = Math.ceil(horizonMs / TICK_MS);
  const occupied = (row: number, t: number): boolean => rowOccupiedAt(state, row, t * TICK_MS, margin);
  type Parent = [prevT: number, prevRow: number, move: Move];
  const parent: Array<Array<Parent | undefined>> = [];
  const at = (t: number): Array<Parent | undefined> => (parent[t] ??= []);
  at(0)[state.playerRow] = [0, state.playerRow, null];

  const glideSafe = (from: number, to: number, t: number): boolean => {
    for (let k = 1; k <= STEP_TICKS; k++) {
      const p = Math.min(1, (k * TICK_MS) / STEP_DURATION_MS);
      const row = p < 0.5 ? from : to;
      if (occupied(row, t + k)) return false;
    }
    return true;
  };

  const reconstruct = (t: number, row: number): Move[] => {
    const moves: Move[] = new Array<Move>(t).fill(null);
    let curT = t;
    let curRow = row;
    while (curT > 0) {
      const p = at(curT)[curRow]!;
      moves[p[0]] = p[2];
      curT = p[0];
      curRow = p[1];
    }
    return moves;
  };

  for (let t = 0; t < ticks; t++) {
    const here = at(t);
    for (let row = 0; row <= TOP_ROW; row++) {
      if (!here[row]) continue;
      // Wait one tick.
      if (!occupied(row, t + 1) && !at(t + 1)[row]) at(t + 1)[row] = [t, row, null];
      // Glide forward or back.
      for (const [to, move] of [
        [Math.min(TOP_ROW, row + 1), "RIGHT"],
        [Math.max(0, row - 1), "LEFT"],
      ] as const) {
        if (to === row) continue;
        const arrive = t + STEP_TICKS;
        if (at(arrive)[to]) continue;
        if (!glideSafe(row, to, t)) continue;
        at(arrive)[to] = [t, row, move];
        if (to === TOP_ROW) return reconstruct(arrive, to);
      }
    }
  }
  return null;
}

/** Execute a plan against the real state. Returns the simulated milliseconds spent. */
function executePlan(state: GameState, plan: Move[]): number {
  press(state, "RIGHT"); // READY -> PLAYING, no movement
  let elapsed = 0;
  for (const move of plan) {
    if (move) press(state, move);
    tick(state);
    elapsed += TICK_MS;
    if (state.phase !== "PLAYING") break;
  }
  return elapsed;
}

describe("state machine and labels", () => {
  it("starts in READY on the bottom row", () => {
    const s = createState(1);
    expect(s.phase).toBe("READY");
    expect(s.playerRow).toBe(0);
    expect(s.lanes).toHaveLength(LANE_COUNT);
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
    const a = createState(1);
    press(a, "LEFT");
    expect(a.phase).toBe("PLAYING");
    expect(a.playerRow).toBe(0);
    const b = createState(1);
    press(b, "RIGHT");
    expect(b.phase).toBe("PLAYING");
    expect(b.playerRow).toBe(0);
  });

  it("obstacles move while READY", () => {
    const s = createState(2);
    const before = s.lanes.map((l) => l.obstacles.map((o) => o.x));
    ticksFor(s, 500);
    const after = s.lanes.map((l) => l.obstacles.map((o) => o.x));
    expect(after).not.toEqual(before);
  });
});

describe("movement", () => {
  it("RIGHT steps forward one row and LEFT steps back one row", () => {
    const s = createState(1, { obstacleFree: true });
    press(s, "RIGHT");
    pressAndSettle(s, "RIGHT");
    expect(s.playerRow).toBe(1);
    pressAndSettle(s, "RIGHT");
    expect(s.playerRow).toBe(2);
    pressAndSettle(s, "LEFT");
    expect(s.playerRow).toBe(1);
  });

  it("LEFT from lane N goes to lane N-1", () => {
    const s = createState(1, { obstacleFree: true });
    press(s, "RIGHT");
    pressAndSettle(s, "RIGHT");
    pressAndSettle(s, "RIGHT");
    pressAndSettle(s, "RIGHT");
    expect(s.playerRow).toBe(3);
    pressAndSettle(s, "LEFT");
    expect(s.playerRow).toBe(2);
    expect(s.phase).toBe("PLAYING");
  });

  it("LEFT at the start row does not move below it and starts no glide", () => {
    const s = createState(1, { obstacleFree: true });
    press(s, "RIGHT");
    press(s, "LEFT");
    expect(s.playerRow).toBe(0);
    expect(s.glide).toBeNull();
    pressAndSettle(s, "LEFT");
    expect(s.playerRow).toBe(0);
    expect(s.phase).toBe("PLAYING");
  });
});

describe("glide and input buffering", () => {
  it("a step glides for STEP_DURATION_MS and then settles", () => {
    const s = createState(1, { obstacleFree: true });
    press(s, "RIGHT");
    press(s, "RIGHT");
    expect(s.glide).not.toBeNull();
    expect(s.glide!.fromRow).toBe(0);
    expect(s.glide!.toRow).toBe(1);
    for (let i = 0; i < STEP_TICKS - 1; i++) tick(s);
    expect(s.glide).not.toBeNull();
    tick(s);
    expect(s.glide).toBeNull();
    expect(s.playerRow).toBe(1);
  });

  it("the visual row eases from the source to the target row", () => {
    const s = createState(1, { obstacleFree: true });
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
    // Ease-out: more than half the distance is covered in the first half of the glide.
    const t = createState(1, { obstacleFree: true });
    press(t, "RIGHT");
    press(t, "RIGHT");
    for (let i = 0; i < Math.floor(STEP_TICKS / 2); i++) tick(t);
    expect(playerVisualRow(t)).toBeGreaterThan(0.5);
  });

  it("a press during a glide is buffered and runs after it; a second press is ignored", () => {
    const s = createState(1, { obstacleFree: true });
    press(s, "RIGHT");
    press(s, "RIGHT"); // glide 0 -> 1
    press(s, "RIGHT"); // buffered
    expect(s.bufferedPress).toBe("RIGHT");
    press(s, "RIGHT"); // ignored
    press(s, "LEFT"); // ignored too: only one press is ever buffered
    expect(s.bufferedPress).toBe("RIGHT");
    expect(s.playerRow).toBe(1);

    for (let i = 0; i < STEP_TICKS; i++) tick(s);
    // First glide done; the buffered press has started the second glide.
    expect(s.bufferedPress).toBeNull();
    expect(s.glide).not.toBeNull();
    expect(s.glide!.fromRow).toBe(1);
    expect(s.glide!.toRow).toBe(2);
    expect(s.playerRow).toBe(2);

    for (let i = 0; i < STEP_TICKS; i++) tick(s);
    expect(s.glide).toBeNull();
    expect(s.playerRow).toBe(2);
    ticksFor(s, 1000);
    expect(s.playerRow).toBe(2); // the ignored presses never ran
  });

  it("LEFT during a forward glide is buffered as a quick reversal", () => {
    const s = createState(1, { obstacleFree: true });
    press(s, "RIGHT");
    press(s, "RIGHT"); // glide 0 -> 1
    press(s, "LEFT"); // buffered
    for (let i = 0; i < STEP_TICKS; i++) tick(s);
    expect(s.glide).not.toBeNull();
    expect(s.glide!.fromRow).toBe(1);
    expect(s.glide!.toRow).toBe(0);
    for (let i = 0; i < STEP_TICKS; i++) tick(s);
    expect(s.playerRow).toBe(0);
    expect(s.phase).toBe("PLAYING");
  });

  it("a buffered press into the top row completes the crossing", () => {
    const s = createState(1, { obstacleFree: true });
    press(s, "RIGHT");
    for (let i = 0; i < LANE_COUNT; i++) pressAndSettle(s, "RIGHT");
    expect(s.playerRow).toBe(LANE_COUNT);
    press(s, "LEFT"); // glide back
    press(s, "RIGHT"); // buffered: glide forward again
    for (let i = 0; i < STEP_TICKS * 2 + 1; i++) tick(s);
    expect(s.playerRow).toBe(LANE_COUNT);
    expect(s.phase).toBe("PLAYING");
    pressAndSettle(s, "RIGHT");
    expect(s.phase).toBe("SUCCESS");
  });
});

describe("collision timing and hitbox", () => {
  it("uses the source lane before the halfway point", () => {
    const s = createState(1, { obstacleFree: true });
    press(s, "RIGHT");
    pressAndSettle(s, "RIGHT"); // standing in row 1, lane clear
    press(s, "RIGHT"); // glide 1 -> 2
    blockRow(s, 1); // the lane being left becomes occupied
    expect(collisionRow(s)).toBe(1);
    tick(s);
    expect(s.phase).toBe("HIT");
  });

  it("uses the target lane only after the halfway point", () => {
    const s = createState(1, { obstacleFree: true });
    press(s, "RIGHT");
    blockRow(s, 1);
    press(s, "RIGHT"); // glide 0 -> 1 into a blocked lane
    let ticksUntilHit = 0;
    while (s.phase === "PLAYING" && ticksUntilHit < STEP_TICKS + 1) {
      tick(s);
      ticksUntilHit++;
    }
    expect(s.phase).toBe("HIT");
    const halfwayTick = Math.ceil(STEP_DURATION_MS / 2 / TICK_MS);
    expect(ticksUntilHit).toBe(halfwayTick);
    expect(ticksUntilHit).toBeGreaterThan(1);
  });

  it("the collision box is 75% of the drawn size", () => {
    expect(PLAYER_HITBOX_SCALE).toBe(0.75);
    expect(PLAYER_HITBOX_WIDTH).toBeCloseTo(PLAYER_WIDTH * 0.75, 9);
  });

  it("an obstacle touching the drawn circle but not the hitbox is not a hit", () => {
    const s = createState(1, { obstacleFree: true });
    press(s, "RIGHT");
    pressAndSettle(s, "RIGHT");
    expect(s.playerRow).toBe(1);
    // Right edge of the obstacle just outside the hitbox, but inside the drawn width.
    const lane = s.lanes[0]!;
    lane.speed = 0;
    const rightEdge = PLAYER_COLUMN_X - PLAYER_HITBOX_WIDTH / 2 - 1;
    lane.obstacles = [{ x: rightEdge - OBSTACLE_WIDTH + TRACK_PAD }];
    expect(rightEdge).toBeGreaterThan(PLAYER_COLUMN_X - PLAYER_WIDTH / 2);
    ticksFor(s, 500);
    expect(s.phase).toBe("PLAYING");
    // Nudge it into the hitbox and it is a hit.
    lane.obstacles[0]!.x += 3;
    tick(s);
    expect(s.phase).toBe("HIT");
  });
});

describe("winning", () => {
  it("forward steps through all lanes with no obstacles reach SUCCESS", () => {
    const s = createState(1, { obstacleFree: true });
    press(s, "RIGHT");
    for (let i = 0; i < LANE_COUNT + 1; i++) pressAndSettle(s, "RIGHT");
    expect(s.playerRow).toBe(TOP_ROW);
    expect(s.phase).toBe("SUCCESS");
  });

  it("extra presses in SUCCESS do nothing", () => {
    const s = createState(1, { obstacleFree: true });
    press(s, "RIGHT");
    for (let i = 0; i < LANE_COUNT + 1; i++) pressAndSettle(s, "RIGHT");
    press(s, "LEFT");
    press(s, "RIGHT");
    ticksFor(s, 500);
    expect(s.playerRow).toBe(TOP_ROW);
    expect(s.phase).toBe("SUCCESS");
  });

  it("a planned crossing succeeds on many seeds within a sensible time", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = createState(seed);
      const plan = planCrossing(s, 40_000);
      expect(plan, `seed ${seed}: no crossing found`).not.toBeNull();
      const elapsed = executePlan(s, plan!);
      expect(s.phase, `seed ${seed}`).toBe("SUCCESS");
      expect(elapsed, `seed ${seed}`).toBeLessThan(40_000);
    }
  });

  it("a crossing is still plannable after waiting a random while in READY", () => {
    for (let seed = 41; seed <= 60; seed++) {
      const s = createState(seed);
      ticksFor(s, (seed * 731) % 9000);
      const plan = planCrossing(s, 40_000);
      expect(plan, `seed ${seed}`).not.toBeNull();
      executePlan(s, plan!);
      expect(s.phase, `seed ${seed}`).toBe("SUCCESS");
    }
  });
});

describe("hits and retry", () => {
  function stepIntoObstacle(seed: number): GameState {
    const s = createState(seed);
    press(s, "RIGHT");
    // Wait until row 1 is occupied now and still occupied when the glide passes halfway.
    for (
      let i = 0;
      i < 60 * 30 && !(rowOccupiedAt(s, 1, 0) && rowOccupiedAt(s, 1, STEP_DURATION_MS));
      i++
    ) {
      tick(s);
    }
    expect(rowClearForMs(s, 1)).toBe(0);
    pressAndSettle(s, "RIGHT");
    return s;
  }

  it("stepping into an occupied cell triggers HIT", () => {
    const s = stepIntoObstacle(3);
    expect(s.phase).toBe("HIT");
    expect(s.hits).toBe(1);
  });

  it("an obstacle sliding into the player's cell triggers HIT", () => {
    const s = createState(4);
    press(s, "RIGHT");
    // Step as soon as the row is clear for the whole glide, then stand still.
    for (let i = 0; i < 60 * 30 && rowClearForMs(s, 1) < STEP_DURATION_MS * 2; i++) tick(s);
    pressAndSettle(s, "RIGHT");
    expect(s.phase).toBe("PLAYING");
    ticksFor(s, 30_000);
    expect(s.phase).toBe("HIT");
  });

  it("ignores input during the lockout, then either button resets to READY on the start row", () => {
    const s = stepIntoObstacle(3);
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

  it("controls respond immediately after a retry", () => {
    const s = stepIntoObstacle(3);
    ticksFor(s, HIT_LOCKOUT_MS + TICK_MS);
    press(s, "RIGHT"); // -> READY
    press(s, "RIGHT"); // -> PLAYING straight away
    expect(s.phase).toBe("PLAYING");
  });

  it("a hit and retry never marks completion", () => {
    const s = stepIntoObstacle(5);
    ticksFor(s, HIT_LOCKOUT_MS + TICK_MS);
    press(s, "RIGHT");
    ticksFor(s, 10_000);
    expect(s.completionFired).toBe(false);
  });
});

describe("completion signal", () => {
  function win(seed = 1): GameState {
    const s = createState(seed, { obstacleFree: true });
    press(s, "RIGHT");
    for (let i = 0; i < LANE_COUNT + 1; i++) pressAndSettle(s, "RIGHT");
    expect(s.phase).toBe("SUCCESS");
    return s;
  }

  it("marks completion once after the success hold, and stays marked", () => {
    const s = win();
    const already = s.phaseMs;
    ticksFor(s, SUCCESS_HOLD_MS - already - TICK_MS * 2);
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
      obstacleFree: true,
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
    for (let i = 0; i < 10; i++) game.step(200); // 2 s, within the per-step clamp
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

describe("dispose", () => {
  it("inputs and ticks after dispose do nothing", () => {
    const game = createGame({ seed: 1, obstacleFree: true });
    game.dispose();
    game.press("RIGHT");
    game.press("RIGHT");
    game.step(1000);
    game.tick();
    expect(game.state.phase).toBe("READY");
    expect(game.state.playerRow).toBe(0);
    expect(game.state.timeMs).toBe(0);
  });

  it("is safe to call twice and suppresses a pending completion", () => {
    let completions = 0;
    let labelCalls = 0;
    const game = createGame({
      seed: 1,
      obstacleFree: true,
      onComplete: () => completions++,
      onLabels: () => labelCalls++,
    });
    game.press("RIGHT");
    for (let i = 0; i < LANE_COUNT + 1; i++) {
      game.press("RIGHT");
      game.step(STEP_DURATION_MS + TICK_MS * 2);
    }
    expect(game.state.phase).toBe("SUCCESS");
    const labelsBefore = labelCalls;
    game.dispose();
    game.dispose();
    expect(game.disposed).toBe(true);
    game.step(SUCCESS_HOLD_MS * 3);
    expect(completions).toBe(0);
    expect(labelCalls).toBe(labelsBefore);
  });
});

describe("fixed timestep", () => {
  it("one 200 ms step equals twenty 10 ms steps", () => {
    const a = createState(9);
    const b = createState(9);
    step(a, 200);
    for (let i = 0; i < 20; i++) step(b, 10);
    expect(a.lanes.map((l) => l.obstacles.map((o) => o.x))).toEqual(
      b.lanes.map((l) => l.obstacles.map((o) => o.x)),
    );
    expect(a.timeMs).toBeCloseTo(b.timeMs, 6);
  });

  it("clamps a huge frame gap instead of simulating it all", () => {
    const s = createState(1);
    step(s, 60_000);
    expect(s.timeMs).toBeLessThan(1_000);
  });
});

describe("fairness", () => {
  it("every lane has a crossable gap at the player column within a bounded wait, for many seeds", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = createState(seed);
      for (let row = 1; row <= LANE_COUNT; row++) {
        let waited = 0;
        while (rowClearForMs(s, row) < MIN_CLEAR_WINDOW_MS && waited < MAX_GAP_WAIT_MS) {
          tick(s);
          waited += TICK_MS;
        }
        expect(rowClearForMs(s, row), `seed ${seed} row ${row}`).toBeGreaterThanOrEqual(MIN_CLEAR_WINDOW_MS);
      }
    }
  });

  it("obstacles in a lane are never closer than MIN_GAP, including across the wrap", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = createState(seed);
      for (const lane of s.lanes) {
        const xs = lane.obstacles.map((o) => o.x).sort((p, q) => p - q);
        for (let i = 0; i < xs.length; i++) {
          const a = xs[i]!;
          const b = i + 1 < xs.length ? xs[i + 1]! : xs[0]! + lane.trackLength;
          expect(b - a - OBSTACLE_WIDTH).toBeGreaterThanOrEqual(MIN_GAP);
        }
      }
    }
  });

  it("lanes alternate direction", () => {
    const s = createState(1);
    for (let i = 1; i < s.lanes.length; i++) {
      expect(s.lanes[i]!.direction).toBe(-s.lanes[i - 1]!.direction);
    }
  });

  it("safe rows are always clear", () => {
    const s = createState(1);
    expect(rowClearForMs(s, 0)).toBe(Infinity);
    expect(rowClearForMs(s, TOP_ROW)).toBe(Infinity);
  });
});
