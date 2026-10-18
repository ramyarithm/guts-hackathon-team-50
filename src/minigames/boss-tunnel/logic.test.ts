// Dead Line rules and fairness proofs: ./chicken-cross/node_modules/.bin/vitest run src/minigames/boss-tunnel
import { describe, expect, it } from 'vitest';
import {
  ATTENTION_CAUGHT,
  CAUGHT_HOLD_MS,
  DARK_HINT_MS,
  DARK_HINT_TEXT,
  DETECT_THRESHOLD,
  DOOR_SWING_MS,
  DOOR_WHEEL_MS,
  FALLBACK_LAYOUT,
  GRACE_MS,
  LANTERN_RATE_PER_S,
  PANIC_THRESHOLD,
  PROMPT_TEXT,
  REACT_DELAY_MS,
  STEP_MS,
  STEP_NOISE,
  SURFACE_HOLD_MS,
  TURN_MS,
  cameraPose,
  createState,
  darkHintVisible,
  doorSequence,
  generateLayout,
  labelsFor,
  press,
  step,
  takeEvents,
  tutorialPrompt,
  validateLayout,
  type TunnelState,
} from './logic';
import {
  DIRS,
  HEADING_ANGLE,
  buildGeometry,
  carvedTiles,
  headingAt,
  posAt,
  turnLeft,
  turnRight,
} from './world';

const TICK = 50;
const settle = (s: TunnelState, ms = STEP_MS + TICK): void => {
  for (let t = 0; t < ms; t += TICK) step(s, TICK);
};
/** Walk (lit) to `cell`, waiting out turns, with danger reset so nothing is caught on the way. */
function walkTo(s: TunnelState, cell: number): void {
  if (!s.lanternOn) press(s, 'LEFT');
  while (s.cell < cell && s.phase === 'TUNNEL') {
    press(s, 'RIGHT');
    settle(s, STEP_MS + TURN_MS + TICK);
    s.attention = 0;
  }
}
const allLabels = (s: TunnelState) => `${labelsFor(s).left}/${labelsFor(s).right}`;
const key = (t: { x: number; y: number }) => `${t.x},${t.y}`;

describe('layout', () => {
  it('is seeded and valid on every seed, and the fallback is valid', () => {
    for (let seed = 1; seed <= 400; seed++) {
      expect(generateLayout(seed)).toEqual(generateLayout(seed));
      expect(validateLayout(generateLayout(seed))).toBeNull();
    }
    expect(validateLayout(FALLBACK_LAYOUT)).toBeNull();
  });

  it('builds a grid where corridors never cross and every junction is a real T with a facing wall', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const l = generateLayout(seed);
      expect(l.path.length).toBe(l.length + 1);
      const carved = new Set(carvedTiles(l).map(key));
      expect(carved.size).toBe(carvedTiles(l).length); // no tile carved twice
      expect(carved.has(key(l.path[l.length]!))).toBe(false); // the door tile is solid
      for (const j of l.junctions) {
        const p = l.path[j.cell]!;
        const hin = l.headings[j.cell - 1]!;
        const hout = l.headings[j.cell]!;
        expect(hout).toBe(j.correct === 'LEFT' ? turnLeft(hin) : turnRight(hin));
        const facing = { x: p.x + DIRS[hin]![0], y: p.y + DIRS[hin]![1] };
        expect(carved.has(key(facing))).toBe(false); // the chalk wall straight ahead is solid
        const wrong = j.correct === 'LEFT' ? turnRight(hin) : turnLeft(hin);
        const stubFirst = { x: p.x + DIRS[wrong]![0], y: p.y + DIRS[wrong]![1] };
        expect(carved.has(key(stubFirst))).toBe(true); // the wrong branch is a visible passage
      }
    }
  });

  it('rejects geometry that would cross itself', () => {
    // Three lefts in a row with spacing 3 loop back onto the start tile.
    expect(
      buildGeometry(16, [
        { cell: 3, correct: 'LEFT' },
        { cell: 6, correct: 'LEFT' },
        { cell: 9, correct: 'LEFT' },
        { cell: 12, correct: 'LEFT' },
      ]),
    ).toBeNull();
  });
});

describe('labels', () => {
  it('match the table in both lantern states, and are blank when caught or at the door', () => {
    const s = createState(7);
    expect(allLabels(s)).toBe('Lantern on/Too dark');
    press(s, 'LEFT');
    expect(allLabels(s)).toBe('Lantern off/Step forward');
    press(s, 'LEFT');
    expect(allLabels(s)).toBe('Lantern on/Too dark');
    const c = createState(7);
    c.attention = ATTENTION_CAUGHT;
    step(c, TICK);
    expect(allLabels(c)).toBe('—/—');
    const d = createState(7);
    d.cell = d.layout.length - 1;
    walkTo(d, d.layout.length);
    expect(d.phase).toBe('SURFACE');
    expect(allLabels(d)).toBe('—/—');
  });
});

describe('moving in the dark', () => {
  it('RIGHT with the lantern off does not move and shows the hint, which fades', () => {
    const s = createState(4);
    press(s, 'RIGHT');
    expect(s.transition).toBeNull();
    expect(s.cell).toBe(0);
    expect(darkHintVisible(s)).toBe(true);
    expect(DARK_HINT_TEXT).toBe('Too dark to move. Turn your lantern on.');
    settle(s, DARK_HINT_MS + TICK);
    expect(s.cell).toBe(0);
    expect(darkHintVisible(s)).toBe(false);
  });

  it('RIGHT with the lantern on steps forward', () => {
    const s = createState(4);
    press(s, 'LEFT');
    press(s, 'RIGHT');
    expect(s.transition).not.toBeNull();
    settle(s);
    expect(s.cell).toBe(1);
    expect(darkHintVisible(s)).toBe(false);
  });

  it('danger falls while hiding in the dark and rises while lit', () => {
    const s = createState(3);
    press(s, 'LEFT');
    settle(s, 1000);
    expect(s.attention).toBeCloseTo(LANTERN_RATE_PER_S, 5);
    const a = s.attention;
    press(s, 'RIGHT');
    expect(s.attention).toBeCloseTo(a + STEP_NOISE, 5);
    settle(s);
    press(s, 'LEFT');
    s.attention = 50;
    settle(s, 1000);
    expect(s.attention).toBeLessThan(50);
  });
});

describe('junctions', () => {
  it('always takes the correct branch, with a 350 ms turn into it and the camera facing the new heading', () => {
    for (const seed of [11, 12, 13, 14, 15]) {
      const s = createState(seed);
      const j = s.layout.junctions[0]!;
      walkTo(s, j.cell - 1);
      const before = cameraPose(s);
      expect(before.angle).toBeCloseTo(HEADING_ANGLE[s.layout.headings[j.cell - 1]!]!, 5);
      press(s, 'RIGHT');
      settle(s, STEP_MS + TICK);
      expect(s.cell).toBe(j.cell);
      expect(s.phase).toBe('TUNNEL');
      expect(s.turn).not.toBeNull();
      expect(s.turn!.from).toBe(s.layout.headings[j.cell - 1]);
      expect(s.turn!.to).toBe(s.layout.headings[j.cell]);
      expect(TURN_MS).toBe(350);
      const mid = cameraPose(s);
      expect(Math.abs(mid.angle - HEADING_ANGLE[s.turn!.to]!) > 0.05).toBe(true); // still turning
      expect(Math.abs(mid.angle - HEADING_ANGLE[s.turn!.from]!) > 0.05).toBe(true);
      settle(s, TURN_MS + TICK);
      expect(s.turn).toBeNull();
      const after = cameraPose(s);
      expect(after.angle).toBeCloseTo(HEADING_ANGLE[s.layout.headings[j.cell]!]!, 5);
      expect(after.x).toBeCloseTo(s.layout.path[j.cell]!.x + 0.5, 5);
      expect(after.y).toBeCloseTo(s.layout.path[j.cell]!.y + 0.5, 5);
      // The next step lands on the correct branch's tile, never the stub.
      press(s, 'RIGHT');
      settle(s);
      expect(s.cell).toBe(j.cell + 1);
      const p = cameraPose(s);
      const next = s.layout.path[j.cell + 1]!;
      expect(p.x).toBeCloseTo(next.x + 0.5, 5);
      expect(p.y).toBeCloseTo(next.y + 0.5, 5);
      expect((s as unknown as Record<string, unknown>)['deadEnd']).toBe(undefined);
    }
  });

  it('buffers one press during the turn and applies it after', () => {
    const s = createState(11);
    const j = s.layout.junctions[0]!;
    walkTo(s, j.cell - 1);
    press(s, 'RIGHT');
    settle(s, STEP_MS + TICK);
    expect(s.turn).not.toBeNull();
    press(s, 'RIGHT');
    expect(s.transition).toBeNull();
    settle(s, TURN_MS + TICK);
    expect(s.transition).not.toBeNull();
  });
});

describe('camera', () => {
  it('starts at the first tile facing along it, and the final step stops in front of the door', () => {
    const s = createState(2);
    const p0 = cameraPose(s);
    expect(p0.x).toBeCloseTo(0.5, 5);
    expect(p0.y).toBeCloseTo(0.5, 5);
    expect(p0.angle).toBeCloseTo(HEADING_ANGLE[headingAt(s.layout, 0)]!, 5);
    const L = s.layout.length;
    const door = s.layout.path[L]!;
    const stand = posAt(s.layout, L);
    expect(Math.hypot(stand.x - (door.x + 0.5), stand.y - (door.y + 0.5))).toBeLessThan(1);
    expect(Math.hypot(stand.x - (door.x + 0.5), stand.y - (door.y + 0.5))).toBeGreaterThan(0.5);
  });
});

describe('tutorial prompts', () => {
  it('lantern on, step, then the hide prompt once the eyes react; none block input', () => {
    const s = createState(5);
    expect(tutorialPrompt(s)).toBe('lantern');
    expect(PROMPT_TEXT.lantern).toBe('Turn your lantern ON (LEFT) to see.');
    press(s, 'LEFT');
    expect(tutorialPrompt(s)).toBe('step');
    expect(PROMPT_TEXT.step).toBe('Press RIGHT to step forward.');
    press(s, 'RIGHT');
    settle(s);
    expect(tutorialPrompt(s)).toBeNull();
    s.attention = 40;
    settle(s, REACT_DELAY_MS + TICK);
    expect(s.eyesTurned).toBe(true);
    expect(tutorialPrompt(s)).toBe('light_off');
    expect(PROMPT_TEXT.light_off).toBe('It hunts light. Turn it OFF to hide, then move again.');
    press(s, 'RIGHT'); // input still works while a prompt shows
    expect(s.transition).not.toBeNull();
    press(s, 'LEFT'); // buffered during the step
    settle(s);
    expect(s.lanternOn).toBe(false);
    expect(tutorialPrompt(s)).toBeNull();
  });
});

describe('events', () => {
  it('fire once each at the right moments: enter, detected by cell 2, reacts after a beat, then the grace', () => {
    const s = createState(5);
    step(s, TICK);
    expect(takeEvents(s)).toEqual(['tunnel_enter']);
    press(s, 'LEFT');
    press(s, 'RIGHT');
    settle(s);
    press(s, 'RIGHT');
    settle(s);
    expect(s.attention).toBeGreaterThanOrEqual(DETECT_THRESHOLD);
    expect(takeEvents(s)).toEqual(['monster_first_detected']);
    settle(s, REACT_DELAY_MS + TICK);
    expect(takeEvents(s)).toEqual(['monster_reacts_to_flashlight', 'light_mechanic_revealed']);
    const a = s.attention;
    settle(s, GRACE_MS - 3 * TICK);
    expect(s.attention).toBeCloseTo(a, 5);
    settle(s, 1000);
    expect(s.attention).toBeGreaterThan(a);
    expect(takeEvents(s)).toEqual([]);
    walkTo(s, s.layout.length);
    expect(s.firedEvents).toHaveLength(4);
  });
});

describe('caught', () => {
  it('names the cause, then ends the run: failure fires once, no completion, no input', () => {
    const light = createState(9);
    light.eyesTurned = true;
    light.lanternOn = true;
    light.attention = ATTENTION_CAUGHT - 1;
    settle(light, 500);
    expect(light.phase).toBe('CAUGHT');
    expect(light.caughtReason).toBe('light');
    const found = createState(9);
    found.attention = ATTENTION_CAUGHT;
    step(found, TICK);
    expect(found.phase).toBe('CAUGHT');
    expect(found.caughtReason).toBe('found');
    expect(found.failureFired).toBe(false);
    settle(found, CAUGHT_HOLD_MS + TICK);
    expect(found.failureFired).toBe(true);
    expect(found.completionFired).toBe(false);
    press(found, 'LEFT');
    press(found, 'RIGHT');
    settle(found, 3000);
    expect(found.phase).toBe('CAUGHT');
    expect(found.lanternOn).toBe(false);
  });
});

describe('the door', () => {
  it('reaching it plays wheel, swing and daylight, then completion fires once and input is ignored', () => {
    const s = createState(2);
    s.cell = s.layout.length - 1;
    press(s, 'LEFT');
    press(s, 'RIGHT');
    settle(s);
    expect(s.phase).toBe('SURFACE');
    expect(doorSequence(s).swing).toBe(0);
    expect(doorSequence(s).flood).toBe(0);
    settle(s, DOOR_WHEEL_MS);
    expect(doorSequence(s).wheel).toBe(1);
    expect(doorSequence(s).swing).toBeGreaterThan(0);
    expect(doorSequence(s).flood).toBe(0);
    settle(s, DOOR_SWING_MS);
    expect(doorSequence(s).swing).toBe(1);
    expect(s.completionFired).toBe(false);
    settle(s, SURFACE_HOLD_MS);
    expect(doorSequence(s).flood).toBe(1);
    expect(s.completionFired).toBe(true);
    press(s, 'RIGHT');
    press(s, 'LEFT');
    settle(s, 1000);
    expect(s.phase).toBe('SURFACE');
    expect(s.failureFired).toBe(false);
  });
});

/** Human-ish bot: acts at most every `reactMs`; lit to move, hides above `hide`, moves again below `resume`. */
function careful(
  seed: number,
  hide = PANIC_THRESHOLD,
  resume = 20,
  reactMs = 300,
): { won: boolean; seconds: number } {
  const s = createState(seed);
  let sinceAct = reactMs;
  let ms = 0;
  for (; ms < 300_000 && s.phase === 'TUNNEL'; ms += TICK) {
    step(s, TICK);
    sinceAct += TICK;
    if (sinceAct < reactMs || s.transition || s.turn) continue;
    if (s.lanternOn && s.attention > hide) {
      press(s, 'LEFT');
      sinceAct = 0;
      continue;
    }
    if (!s.lanternOn) {
      if (s.attention < resume) {
        press(s, 'LEFT');
        sinceAct = 0;
      }
      continue;
    }
    press(s, 'RIGHT');
    sinceAct = 0;
  }
  return { won: s.phase === 'SURFACE', seconds: ms / 1000 };
}
function alwaysLit(seed: number): boolean {
  const s = createState(seed);
  for (let ms = 0; ms < 300_000 && s.phase === 'TUNNEL'; ms += TICK) {
    step(s, TICK);
    if (s.transition || s.turn) continue;
    if (!s.lanternOn) {
      press(s, 'LEFT');
      continue;
    }
    press(s, 'RIGHT');
  }
  return s.phase === 'CAUGHT';
}

describe('fairness', () => {
  it('a careful player reaches the door on every seed without being caught, in roughly a minute with several hides', () => {
    let total = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const r = careful(seed);
      expect(r.won).toBe(true);
      expect(r.seconds).toBeGreaterThan(40);
      expect(r.seconds).toBeLessThan(130);
      total += r.seconds;
    }
    const mean = total / 400;
    console.log(`[fairness] careful bot mean ${mean.toFixed(1)} s over 400 seeds`);
    expect(mean).toBeGreaterThan(55);
    expect(mean).toBeLessThan(95);
  });
  it('an always-lit player is caught on every seed', () => {
    for (let seed = 1; seed <= 400; seed++) expect(alwaysLit(seed)).toBe(true);
  });
  it('a careful player who hides a little later still makes it', () => {
    for (let seed = 1; seed <= 100; seed++) expect(careful(seed, 85, 30).won).toBe(true);
  });
});
