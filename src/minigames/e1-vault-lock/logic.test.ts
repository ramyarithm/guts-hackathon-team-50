// Tests for the E1 vault-lock logic. Run from the repo root with the Vitest installed in
// chicken-cross/ (the root project has no test runner yet):
//   ./chicken-cross/node_modules/.bin/vitest run src/minigames/e1-vault-lock
import { describe, expect, it } from "vitest";
import {
  CODE_LENGTH,
  DIAL_SIZE,
  DROP_LOCKOUT_MS,
  START_POSITION,
  STEP_DIRECTIONS,
  SUCCESS_HOLD_MS,
  TICK_MS,
  TURN_DURATION_MS,
  TURN_TICKS,
  circularDistance,
  createGame,
  createState,
  currentTarget,
  generateCode,
  labelsFor,
  meterLevel,
  press,
  proximity,
  step,
  tick,
  turnButton,
  lockButton,
  type Button,
  type ControlLabels,
  type GameState,
} from "./logic";

function ticksFor(state: GameState, ms: number): void {
  const n = Math.ceil(ms / TICK_MS);
  for (let i = 0; i < n; i++) tick(state);
}

/** Press, then tick until any rotation has finished. */
function pressAndSettle(state: GameState, button: Button): void {
  press(state, button);
  for (let i = 0; i < TURN_TICKS + 1; i++) tick(state);
}

function started(seed = 1, code?: number[]): GameState {
  const s = createState(seed, code ? { code } : {});
  press(s, "RIGHT");
  expect(s.phase).toBe("PLAYING");
  return s;
}

/** Solve one step by observation only: turn until the meter peaks, then lock in. */
function solveStepByListening(state: GameState): number {
  let turns = 0;
  const stepIndex = state.step;
  while (meterLevel(state) < 1 && turns < DIAL_SIZE + 1) {
    pressAndSettle(state, turnButton(stepIndex));
    turns++;
  }
  pressAndSettle(state, lockButton(stepIndex));
  return turns;
}

describe("code generation", () => {
  it("respects length, range, no consecutive repeats and not the start position", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const s = createState(seed);
      expect(s.code).toHaveLength(CODE_LENGTH);
      expect(s.code[0]).not.toBe(START_POSITION);
      for (let i = 0; i < s.code.length; i++) {
        const n = s.code[i]!;
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(DIAL_SIZE);
        if (i > 0) expect(n).not.toBe(s.code[i - 1]);
      }
    }
  });

  it("is deterministic for a seed and varies across seeds", () => {
    expect(createState(7).code).toEqual(createState(7).code);
    const distinct = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) distinct.add(createState(seed).code.join(","));
    expect(distinct.size).toBeGreaterThan(30);
  });

  it("generateCode never returns the start position first", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const code = generateCode(seed, 5);
      expect(code[0]).not.toBe(5);
    }
  });
});

describe("labels and steps", () => {
  it("READY, DROPPED and SUCCESS labels", () => {
    expect(labelsFor(createState(1))).toEqual({ left: "Start", right: "Start" });
    const s = started(1);
    pressAndSettle(s, lockButton(0)); // position 0 is never the first number -> drop
    expect(s.phase).toBe("DROPPED");
    expect(labelsFor(s)).toEqual({ left: "Retry", right: "Retry" });
    const w = started(1, [3, 7, 2]);
    for (let i = 0; i < CODE_LENGTH; i++) solveStepByListening(w);
    expect(w.phase).toBe("SUCCESS");
    expect(labelsFor(w)).toEqual({ left: "—", right: "—" });
  });

  it("PLAYING labels follow the right / left / right step table", () => {
    expect(STEP_DIRECTIONS).toEqual([1, -1, 1]);
    const s = started(1, [3, 7, 2]);
    expect(labelsFor(s)).toEqual({ left: "Lock in", right: "Turn ▶" });
    expect(turnButton(0)).toBe("RIGHT");
    expect(lockButton(0)).toBe("LEFT");
    solveStepByListening(s);
    expect(s.step).toBe(1);
    expect(labelsFor(s)).toEqual({ left: "Turn ◀", right: "Lock in" });
    expect(turnButton(1)).toBe("LEFT");
    expect(lockButton(1)).toBe("RIGHT");
    solveStepByListening(s);
    expect(s.step).toBe(2);
    expect(labelsFor(s)).toEqual({ left: "Lock in", right: "Turn ▶" });
  });

  it("either button starts the game without turning the dial", () => {
    for (const b of ["LEFT", "RIGHT"] as const) {
      const s = createState(1);
      press(s, b);
      expect(s.phase).toBe("PLAYING");
      expect(s.position).toBe(START_POSITION);
      expect(s.step).toBe(0);
    }
  });
});

describe("turning", () => {
  it("turning right wraps 11 -> 0", () => {
    const s = started(1, [11, 4, 8]);
    for (let i = 0; i < 11; i++) pressAndSettle(s, "RIGHT");
    expect(s.position).toBe(11);
    pressAndSettle(s, "RIGHT");
    expect(s.position).toBe(0);
    expect(s.phase).toBe("PLAYING");
  });

  it("turning left wraps 0 -> 11", () => {
    const s = started(1, [5, 11, 2]);
    solveStepByListening(s); // now at 5, step 1 turns left
    expect(s.step).toBe(1);
    for (let i = 0; i < 5; i++) pressAndSettle(s, "LEFT");
    expect(s.position).toBe(0);
    pressAndSettle(s, "LEFT");
    expect(s.position).toBe(11);
  });

  it("a turn rotates for TURN_DURATION_MS with the position updated immediately", () => {
    expect(TURN_TICKS).toBe(Math.ceil(TURN_DURATION_MS / TICK_MS));
    const s = started(1, [3, 7, 2]);
    press(s, "RIGHT");
    expect(s.position).toBe(1);
    expect(s.rotation).not.toBeNull();
    for (let i = 0; i < TURN_TICKS - 1; i++) tick(s);
    expect(s.rotation).not.toBeNull();
    tick(s);
    expect(s.rotation).toBeNull();
  });

  it("buffers one press during a rotation and ignores the rest", () => {
    const s = started(1, [3, 7, 2]);
    press(s, "RIGHT"); // rotating 0 -> 1
    press(s, "RIGHT"); // buffered
    press(s, "RIGHT"); // ignored
    press(s, "RIGHT"); // ignored
    expect(s.bufferedPress).toBe("RIGHT");
    expect(s.position).toBe(1);
    for (let i = 0; i < TURN_TICKS; i++) tick(s);
    expect(s.position).toBe(2);
    expect(s.rotation).not.toBeNull();
    for (let i = 0; i < TURN_TICKS; i++) tick(s);
    ticksFor(s, 500);
    expect(s.position).toBe(2);
  });

  it("a buffered lock-in uses the position reached by the rotation", () => {
    const s = started(1, [1, 7, 2]);
    press(s, "RIGHT"); // 0 -> 1, the first number
    press(s, "LEFT"); // buffered lock-in
    for (let i = 0; i < TURN_TICKS + 1; i++) tick(s);
    expect(s.step).toBe(1);
    expect(s.found[0]).toBe(true);
  });
});

describe("listening feedback", () => {
  it("proximity is maximal exactly at the target and decreases with circular distance", () => {
    for (let target = 0; target < DIAL_SIZE; target++) {
      expect(proximity(target, target)).toBe(1);
      let prev = 1;
      for (let d = 1; d <= DIAL_SIZE / 2; d++) {
        const p = proximity((target + d) % DIAL_SIZE, target);
        expect(p).toBeLessThan(prev);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(proximity((target - d + DIAL_SIZE) % DIAL_SIZE, target)).toBeCloseTo(p, 9);
        prev = p;
      }
    }
    expect(circularDistance(0, 11)).toBe(1);
    expect(circularDistance(0, 6)).toBe(6);
    expect(circularDistance(3, 3)).toBe(0);
  });

  it("the meter follows the current target and clicks when a turn lands on it", () => {
    const s = started(1, [2, 7, 9]);
    expect(currentTarget(s)).toBe(2);
    expect(meterLevel(s)).toBeCloseTo(proximity(0, 2), 9);
    pressAndSettle(s, "RIGHT");
    expect(s.lastClickMs).toBeLessThan(0); // no click yet
    pressAndSettle(s, "RIGHT");
    expect(meterLevel(s)).toBe(1);
    expect(s.lastClickMs).toBeGreaterThanOrEqual(0);
  });

  it("identifies the target within one full rotation for every seed", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const s = started(seed);
      const turns = solveStepByListening(s);
      expect(turns).toBeLessThanOrEqual(DIAL_SIZE - 1);
      expect(s.step).toBe(1);
    }
  });
});

describe("lock-in, drop and retry", () => {
  it("a correct lock-in advances the step and lights the notch", () => {
    const s = started(1, [4, 9, 1]);
    for (let i = 0; i < 4; i++) pressAndSettle(s, "RIGHT");
    pressAndSettle(s, "LEFT");
    expect(s.phase).toBe("PLAYING");
    expect(s.step).toBe(1);
    expect(s.found).toEqual([true, false, false]);
    expect(s.drops).toBe(0);
  });

  it("a wrong lock-in drops the tumblers, then retry returns to step 1 with the same code and hints", () => {
    const s = started(1, [4, 9, 1]);
    const code = [...s.code];
    for (let i = 0; i < 4; i++) pressAndSettle(s, "RIGHT");
    pressAndSettle(s, "LEFT"); // found 4
    pressAndSettle(s, "LEFT"); // turn left to 3
    pressAndSettle(s, "RIGHT"); // wrong lock-in at 3
    expect(s.phase).toBe("DROPPED");
    expect(s.drops).toBe(1);
    expect(labelsFor(s)).toEqual({ left: "Retry", right: "Retry" });

    ticksFor(s, DROP_LOCKOUT_MS / 2);
    press(s, "LEFT");
    expect(s.phase).toBe("DROPPED"); // lockout
    ticksFor(s, DROP_LOCKOUT_MS);
    press(s, "RIGHT");
    expect(s.phase).toBe("PLAYING");
    expect(s.step).toBe(0);
    expect(s.code).toEqual(code);
    expect(s.position).toBe(3); // the dial does not jump
    expect(s.found).toEqual([false, false, false]);
    expect(s.hints).toEqual([true, false, false]);
    expect(labelsFor(s)).toEqual({ left: "Lock in", right: "Turn ▶" });
  });

  it("presses during a drop lockout are not buffered into the retry", () => {
    const s = started(1, [4, 9, 1]);
    pressAndSettle(s, "LEFT"); // wrong at 0
    expect(s.phase).toBe("DROPPED");
    press(s, "RIGHT");
    press(s, "RIGHT");
    ticksFor(s, DROP_LOCKOUT_MS + TICK_MS);
    press(s, "LEFT");
    expect(s.phase).toBe("PLAYING");
    expect(s.bufferedPress).toBeNull();
    expect(s.rotation).toBeNull();
    expect(s.position).toBe(0);
  });

  it("a drop and retry never marks completion", () => {
    const s = started(1, [4, 9, 1]);
    pressAndSettle(s, "LEFT");
    ticksFor(s, DROP_LOCKOUT_MS + TICK_MS);
    press(s, "LEFT");
    ticksFor(s, 5000);
    expect(s.completionFired).toBe(false);
  });
});

describe("solvability", () => {
  it("an automated listener always opens the vault within CODE_LENGTH x DIAL_SIZE turns", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const s = started(seed);
      let turns = 0;
      for (let i = 0; i < CODE_LENGTH; i++) turns += solveStepByListening(s);
      expect(s.phase, `seed ${seed}`).toBe("SUCCESS");
      expect(s.drops, `seed ${seed}`).toBe(0);
      expect(turns, `seed ${seed}`).toBeLessThanOrEqual(CODE_LENGTH * DIAL_SIZE);
      expect(s.found).toEqual([true, true, true]);
    }
  });
});

describe("completion signal", () => {
  function win(): GameState {
    const s = started(1, [3, 7, 2]);
    for (let i = 0; i < CODE_LENGTH; i++) solveStepByListening(s);
    expect(s.phase).toBe("SUCCESS");
    return s;
  }

  it("marks completion once after the success hold and ignores later input", () => {
    const s = win();
    ticksFor(s, SUCCESS_HOLD_MS - s.phaseMs - TICK_MS * 2);
    expect(s.completionFired).toBe(false);
    ticksFor(s, TICK_MS * 4);
    expect(s.completionFired).toBe(true);
    press(s, "LEFT");
    press(s, "RIGHT");
    ticksFor(s, 3000);
    expect(s.completionFired).toBe(true);
    expect(s.phase).toBe("SUCCESS");
  });

  it("createGame fires onComplete exactly once and publishes labels on every change", () => {
    let completions = 0;
    const seen: ControlLabels[] = [];
    const game = createGame({
      seed: 1,
      code: [3, 7, 2],
      onComplete: () => completions++,
      onLabels: (l) => seen.push(l),
    });
    game.press("RIGHT"); // start
    for (let stepIndex = 0; stepIndex < CODE_LENGTH; stepIndex++) {
      while (meterLevel(game.state) < 1) {
        game.press(turnButton(stepIndex));
        game.step(TURN_DURATION_MS + TICK_MS * 2);
      }
      game.press(lockButton(stepIndex));
      game.step(TICK_MS * 2);
    }
    expect(game.state.phase).toBe("SUCCESS");
    expect(completions).toBe(0);
    for (let i = 0; i < 10; i++) game.step(200);
    expect(completions).toBe(1);
    game.press("LEFT");
    game.step(2000);
    expect(completions).toBe(1);
    expect(seen).toEqual([
      { left: "Start", right: "Start" },
      { left: "Lock in", right: "Turn ▶" },
      { left: "Turn ◀", right: "Lock in" },
      { left: "Lock in", right: "Turn ▶" },
      { left: "—", right: "—" },
    ]);
  });
});

describe("dispose", () => {
  it("inputs and ticks after dispose do nothing", () => {
    const game = createGame({ seed: 1 });
    game.dispose();
    game.press("RIGHT");
    game.press("LEFT");
    game.step(1000);
    game.tick();
    expect(game.state.phase).toBe("READY");
    expect(game.state.timeMs).toBe(0);
  });

  it("is safe to call twice and suppresses a pending completion", () => {
    let completions = 0;
    let labelCalls = 0;
    const game = createGame({
      seed: 1,
      code: [3, 7, 2],
      onComplete: () => completions++,
      onLabels: () => labelCalls++,
    });
    game.press("RIGHT");
    for (let stepIndex = 0; stepIndex < CODE_LENGTH; stepIndex++) {
      while (meterLevel(game.state) < 1) {
        game.press(turnButton(stepIndex));
        game.step(TURN_DURATION_MS + TICK_MS * 2);
      }
      game.press(lockButton(stepIndex));
      game.step(TICK_MS * 2);
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

describe("fixed timestep", () => {
  it("one 200 ms step equals twenty 10 ms steps", () => {
    const a = createState(9);
    const b = createState(9);
    step(a, 200);
    for (let i = 0; i < 20; i++) step(b, 10);
    expect(a.timeMs).toBeCloseTo(b.timeMs, 6);
    expect(a.timeMs).toBeCloseTo(12 * TICK_MS, 6);
  });

  it("clamps a huge frame gap", () => {
    const s = createState(1);
    step(s, 60_000);
    expect(s.timeMs).toBeLessThan(1_000);
  });
});
