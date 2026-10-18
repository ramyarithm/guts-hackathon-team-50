// E1 is the ending door, never a stage minigame: it is registered outside the random pool.
import { describe, expect, it } from "vitest";
import { clearRegistry, getReadyGames, register } from "../registry";
import { e1Entry } from "./index";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const stub = (id: string, inputCount: 1 | 2) => ({ id, name: id, ready: true, inputCount, adapter: () => ({ startMinigame() {}, handleInput() {}, dispose() {} }) });

function setup(): void {
  clearRegistry();
  register(e1Entry);
  register(stub("G1", 1));
  register(stub("G2", 2));
  register(stub("G3", 2));
  register(stub("G4", 1));
  register(stub("G5", 2));
}

describe("E1 and the minigame pool", () => {
  it("is registered outside the pool, leaving at least four ready games", () => {
    setup();
    expect(e1Entry.pool).toBe(false);
    expect(e1Entry.ready).toBe(true);
    const ready = getReadyGames().map((g) => g.id);
    expect(ready.includes("E1")).toBe(false);
    expect(ready.length).toBeGreaterThanOrEqual(4);
    clearRegistry();
  });

  it("is never drawn for C1-C4 whatever the seed", () => {
    setup();
    for (let seed = 1; seed <= 2000; seed++) {
      const rng = mulberry32(seed);
      const pool = getReadyGames();
      const shuffled = [...pool];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
      }
      const picks = shuffled.slice(0, 4).map((g) => g.id);
      expect(picks.includes("E1")).toBe(false);
    }
    clearRegistry();
  });
});
