import { describe, expect, it } from "vitest";
import {
  CRASH_LOCKOUT_MS,
  FLOOR_Y,
  GAP_HEIGHT,
  GAP_MARGIN,
  MAX_GAP_SHIFT,
  MAX_GAP_TOP,
  MIN_GAP_TOP,
  PULSE_RADIUS,
  SUCCESS_HOLD_MS,
  TARGET_GAPS,
  TICK_MS,
  WORLD_HEIGHT,
  createGame,
  createSeededRng,
  generateGapTop,
  labelsFor,
  type Button,
  type ControlLabels,
  type Game,
} from "../src/logic";

/** Simple autopilot: pulse whenever the signal is below the next gap's centre and falling. */
function autopilot(game: Game, maxSteps = 60 * 90): void {
  game.input("LEFT"); // first press starts the run
  for (let i = 0; i < maxSteps && game.state.phase === "PLAYING"; i++) {
    const next = game.state.obstacles.find((o) => !o.passed);
    const target = next ? next.gapTop + GAP_HEIGHT / 2 : WORLD_HEIGHT / 2;
    if (game.state.pulseY > target && game.state.pulseVy > 0) {
      const button: Button = i % 2 === 0 ? "LEFT" : "RIGHT";
      game.input(button);
    }
    game.step();
  }
}

function stepFor(game: Game, ms: number): void {
  const steps = Math.ceil(ms / TICK_MS);
  for (let i = 0; i < steps; i++) game.step();
}

function stepUntilCrashed(game: Game, maxSteps = 60 * 30): void {
  for (let i = 0; i < maxSteps && game.state.phase !== "CRASHED"; i++) game.step();
}

describe("state machine and labels", () => {
  it("starts in READY and publishes Pulse/Pulse labels immediately", () => {
    const seen: ControlLabels[] = [];
    const game = createGame({ onLabels: (l) => seen.push(l) });
    expect(game.state.phase).toBe("READY");
    expect(seen).toEqual([{ left: "Pulse", right: "Pulse" }]);
  });

  it("maps every phase to the contract's labels", () => {
    expect(labelsFor("READY")).toEqual({ left: "Pulse", right: "Pulse" });
    expect(labelsFor("PLAYING")).toEqual({ left: "Pulse", right: "Pulse" });
    expect(labelsFor("CRASHED")).toEqual({ left: "Retry", right: "Retry" });
    expect(labelsFor("SUCCESS")).toEqual({ left: "—", right: "—" });
  });

  it("the first press starts the run and gives an upward impulse", () => {
    const game = createGame();
    game.input("RIGHT");
    expect(game.state.phase).toBe("PLAYING");
    expect(game.state.pulseVy).toBeLessThan(0);
  });

  it("publishes labels on every phase change", () => {
    const seen: ControlLabels[] = [];
    const game = createGame({ onLabels: (l) => seen.push(l) });
    game.input("LEFT"); // READY -> PLAYING
    stepFor(game, 10_000); // falls to the floor -> CRASHED
    stepFor(game, CRASH_LOCKOUT_MS + TICK_MS);
    game.input("LEFT"); // CRASHED -> READY
    expect(seen).toEqual([
      { left: "Pulse", right: "Pulse" },
      { left: "Pulse", right: "Pulse" },
      { left: "Retry", right: "Retry" },
      { left: "Pulse", right: "Pulse" },
    ]);
  });
});

describe("winning", () => {
  it("passing TARGET_GAPS obstacles reaches SUCCESS", () => {
    const game = createGame({ rng: createSeededRng(1) });
    autopilot(game);
    expect(game.state.phase).toBe("SUCCESS");
    expect(game.state.passed).toBe(TARGET_GAPS);
  });

  it("is winnable by the autopilot across many seeds", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const game = createGame({ rng: createSeededRng(seed) });
      autopilot(game);
      expect(game.state.phase, `seed ${seed}`).toBe("SUCCESS");
    }
  });

  it("takes roughly 20-30 seconds of play to win", () => {
    const game = createGame({ rng: createSeededRng(7) });
    autopilot(game);
    const seconds = game.state.elapsedPlayMs / 1000;
    expect(seconds).toBeGreaterThanOrEqual(18);
    expect(seconds).toBeLessThanOrEqual(32);
  });
});

describe("crashing and retrying", () => {
  it("falling to the floor reaches CRASHED", () => {
    const game = createGame();
    game.input("LEFT");
    stepFor(game, 10_000);
    expect(game.state.phase).toBe("CRASHED");
    expect(game.state.pulseY).toBeGreaterThan(FLOOR_Y - PULSE_RADIUS - 1);
  });

  it("spamming pulse into the ceiling reaches CRASHED", () => {
    const game = createGame();
    for (let i = 0; i < 600 && game.state.phase !== "CRASHED"; i++) {
      game.input("LEFT");
      game.step();
    }
    expect(game.state.phase).toBe("CRASHED");
    expect(game.state.pulseY).toBeLessThan(PULSE_RADIUS + 1);
  });

  it("flying into a pylon reaches CRASHED away from floor and ceiling", () => {
    const game = createGame({ rng: createSeededRng(3) });
    game.input("LEFT");
    // Aim at the middle of the first obstacle's thicker pylon so the pulse hits it.
    for (let i = 0; i < 60 * 30 && game.state.phase === "PLAYING"; i++) {
      const first = game.state.obstacles[0];
      const gapTop = first ? first.gapTop : MIN_GAP_TOP;
      const lowerThickness = FLOOR_Y - gapTop - GAP_HEIGHT;
      const target = gapTop > lowerThickness ? gapTop / 2 : gapTop + GAP_HEIGHT + lowerThickness / 2;
      if (game.state.pulseY > target && game.state.pulseVy > 0) game.input("RIGHT");
      game.step();
    }
    expect(game.state.phase).toBe("CRASHED");
    expect(game.state.pulseY).toBeGreaterThan(PULSE_RADIUS + 1);
    expect(game.state.pulseY).toBeLessThan(FLOOR_Y - PULSE_RADIUS - 1);
    expect(game.state.passed).toBe(0);
  });

  it("ignores input during the crash lockout, then either button resets to READY", () => {
    const game = createGame();
    game.input("LEFT");
    stepUntilCrashed(game);
    expect(game.state.phase).toBe("CRASHED");

    stepFor(game, CRASH_LOCKOUT_MS / 2);
    game.input("LEFT");
    expect(game.state.phase).toBe("CRASHED");

    stepFor(game, CRASH_LOCKOUT_MS);
    game.input("RIGHT");
    expect(game.state.phase).toBe("READY");
  });

  it("retry resets score, obstacles and position", () => {
    const game = createGame({ rng: createSeededRng(5) });
    const fresh = createGame({ rng: createSeededRng(5) });
    game.input("LEFT");
    // Pass a couple of gaps, then stop pulsing so it crashes.
    for (let i = 0; i < 60 * 60 && game.state.passed < 2; i++) {
      const next = game.state.obstacles.find((o) => !o.passed);
      const target = next ? next.gapTop + GAP_HEIGHT / 2 : WORLD_HEIGHT / 2;
      if (game.state.pulseY > target && game.state.pulseVy > 0) game.input("LEFT");
      game.step();
    }
    expect(game.state.passed).toBe(2);
    stepFor(game, 10_000);
    expect(game.state.phase).toBe("CRASHED");

    stepFor(game, CRASH_LOCKOUT_MS + TICK_MS);
    game.input("LEFT");
    expect(game.state.phase).toBe("READY");
    expect(game.state.passed).toBe(0);
    expect(game.state.pulseY).toBe(fresh.state.pulseY);
    expect(game.state.pulseVy).toBe(0);
    expect(game.state.obstacles.every((o) => !o.passed)).toBe(true);
  });

  it("a crash and retry never fires completion", () => {
    let completions = 0;
    const game = createGame({ onComplete: () => completions++ });
    game.input("LEFT");
    stepFor(game, 10_000);
    stepFor(game, CRASH_LOCKOUT_MS + TICK_MS);
    game.input("LEFT");
    stepFor(game, 10_000);
    expect(completions).toBe(0);
  });
});

describe("completion signal", () => {
  it("fires onComplete exactly once after the success hold, even with extra inputs and ticks", () => {
    let completions = 0;
    const game = createGame({ rng: createSeededRng(2), onComplete: () => completions++ });
    autopilot(game);
    expect(game.state.phase).toBe("SUCCESS");
    expect(completions).toBe(0);

    stepFor(game, SUCCESS_HOLD_MS - TICK_MS * 2);
    expect(completions).toBe(0);

    stepFor(game, TICK_MS * 4);
    expect(completions).toBe(1);

    game.input("LEFT");
    game.input("RIGHT");
    stepFor(game, 5_000);
    game.tick(5_000);
    expect(completions).toBe(1);
    expect(game.state.phase).toBe("SUCCESS");
  });

  it("inputs are ignored once completion has fired", () => {
    const game = createGame({ rng: createSeededRng(2) });
    autopilot(game);
    stepFor(game, SUCCESS_HOLD_MS + TICK_MS * 2);
    expect(game.state.completionFired).toBe(true);
    const before = { ...game.state, obstacles: undefined };
    game.input("LEFT");
    game.input("RIGHT");
    expect({ ...game.state, obstacles: undefined }).toEqual(before);
  });
});

describe("dispose", () => {
  it("inputs and ticks after dispose do nothing", () => {
    const game = createGame();
    game.dispose();
    game.input("LEFT");
    game.input("RIGHT");
    game.tick(1000);
    game.step();
    expect(game.state.phase).toBe("READY");
    expect(game.state.pulseVy).toBe(0);
  });

  it("is safe to call twice and mid-game, and suppresses a pending completion", () => {
    let completions = 0;
    let labelCalls = 0;
    const game = createGame({
      rng: createSeededRng(2),
      onComplete: () => completions++,
      onLabels: () => labelCalls++,
    });
    autopilot(game);
    expect(game.state.phase).toBe("SUCCESS");
    const labelsBefore = labelCalls;
    game.dispose();
    game.dispose();
    expect(game.disposed).toBe(true);
    game.tick(SUCCESS_HOLD_MS * 2);
    stepFor(game, SUCCESS_HOLD_MS * 2);
    expect(completions).toBe(0);
    expect(labelCalls).toBe(labelsBefore);
  });
});

describe("fixed timestep", () => {
  it("one big tick and many small ticks produce the same simulation", () => {
    const a = createGame({ rng: createSeededRng(9) });
    const b = createGame({ rng: createSeededRng(9) });
    a.input("LEFT");
    b.input("LEFT");
    a.tick(200);
    for (let i = 0; i < 20; i++) b.tick(10);
    expect(a.state.pulseY).toBeCloseTo(b.state.pulseY, 9);
    expect(a.state.pulseVy).toBeCloseTo(b.state.pulseVy, 9);
    expect(a.state.obstacles.map((o) => o.x)).toEqual(b.state.obstacles.map((o) => o.x));
  });

  it("clamps a huge frame gap instead of simulating it all at once", () => {
    const game = createGame();
    game.input("LEFT");
    game.tick(60_000);
    // A 60 s stall must not advance 60 s of simulation in one call.
    expect(game.state.elapsedPlayMs).toBeLessThan(1_000);
  });
});

describe("gap generation", () => {
  it("always produces gaps within reachable bounds", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rng = createSeededRng(seed);
      let prev: number | undefined;
      for (let i = 0; i < 200; i++) {
        const gapTop = generateGapTop(prev, rng);
        expect(gapTop).toBeGreaterThanOrEqual(MIN_GAP_TOP);
        expect(gapTop).toBeLessThanOrEqual(MAX_GAP_TOP);
        expect(gapTop).toBeGreaterThanOrEqual(GAP_MARGIN);
        expect(gapTop + GAP_HEIGHT).toBeLessThanOrEqual(FLOOR_Y - GAP_MARGIN);
        if (prev !== undefined) expect(Math.abs(gapTop - prev)).toBeLessThanOrEqual(MAX_GAP_SHIFT);
        prev = gapTop;
      }
    }
  });

  it("spawns exactly TARGET_GAPS obstacles during a run, all within bounds", () => {
    const game = createGame({ rng: createSeededRng(11) });
    autopilot(game);
    expect(game.state.phase).toBe("SUCCESS");
    expect(game.state.spawned).toBe(TARGET_GAPS);
    for (const o of game.state.obstacles) {
      expect(o.gapTop).toBeGreaterThanOrEqual(MIN_GAP_TOP);
      expect(o.gapTop).toBeLessThanOrEqual(MAX_GAP_TOP);
    }
  });
});
