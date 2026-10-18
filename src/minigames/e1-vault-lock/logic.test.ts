// Tests for the E1 PIN door logic. Run from the repo root with the Vitest installed in
// chicken-cross/ (the root project has no test runner yet):
//   ./chicken-cross/node_modules/.bin/vitest run src/minigames/e1-vault-lock
import { describe, expect, it } from 'vitest';
import {
  CODE_LENGTH,
  DENIED_MS,
  DIAL_SIZE,
  OPENING_MS,
  TICK_MS,
  TURN_DURATION_MS,
  TURN_TICKS,
  createGame,
  createState,
  entryString,
  labelsFor,
  press,
  tick,
  type Button,
  type GameState,
  type PinCheck,
} from './logic';

const accept =
  (pin: string): PinCheck =>
  (entry) =>
    entry === pin;

function ticks(state: GameState, n: number): void {
  for (let i = 0; i < n; i++) tick(state);
}

/** A checkPin that records its calls (the shim has no vi.fn). */
function recordingCheck(pin: string): PinCheck & { calls: string[] } {
  const calls: string[] = [];
  const fn = ((entry: string) => {
    calls.push(entry);
    return entry === pin;
  }) as PinCheck & { calls: string[] };
  fn.calls = calls;
  return fn;
}

/** Advance a Game by `ms` in chunks under the per-step clamp. */
function advance(game: { step(dt: number): void }, ms: number): void {
  for (let t = 0; t < ms; t += 100) game.step(Math.min(100, ms - t));
}

/** Press and let the rotation finish. */
function pressSettled(state: GameState, button: Button, check: PinCheck): void {
  press(state, button, check);
  ticks(state, TURN_TICKS + 1);
}

function enter(state: GameState, code: string, check: PinCheck): void {
  for (const ch of code) {
    for (let i = 0; i < Number(ch); i++) pressSettled(state, 'LEFT', check);
    pressSettled(state, 'RIGHT', check);
  }
}

describe('constants', () => {
  it('is a 10-position dial for a 4-digit code', () => {
    expect(DIAL_SIZE).toBe(10);
    expect(CODE_LENGTH).toBe(4);
    expect(TURN_TICKS).toBe(Math.ceil(TURN_DURATION_MS / TICK_MS));
  });
});

describe('dial', () => {
  it('starts at position 1 with every digit 0', () => {
    const s = createState();
    expect(s.phase).toBe('ENTERING');
    expect(s.position).toBe(0);
    expect(s.digits).toEqual([0, 0, 0, 0]);
    expect(JSON.stringify(s).includes('collected')).toBe(false);
  });

  it('LEFT turns the dial up by one and wraps 9 -> 0', () => {
    const s = createState();
    const check = accept('0000');
    for (let i = 1; i <= 9; i++) {
      pressSettled(s, 'LEFT', check);
      expect(s.digits[0]).toBe(i);
    }
    pressSettled(s, 'LEFT', check);
    expect(s.digits[0]).toBe(0);
    expect(s.position).toBe(0);
  });

  it('a turn rotates for TURN_DURATION_MS with the value updated immediately, and buffers one press', () => {
    const s = createState();
    const check = accept('0000');
    press(s, 'LEFT', check);
    expect(s.digits[0]).toBe(1);
    expect(s.rotation).not.toBeNull();
    press(s, 'LEFT', check); // buffered
    press(s, 'LEFT', check); // dropped
    expect(s.digits[0]).toBe(1);
    ticks(s, TURN_TICKS);
    expect(s.digits[0]).toBe(2); // the buffered press ran after the rotation
    ticks(s, TURN_TICKS + 1);
    expect(s.rotation).toBeNull();
    expect(s.digits[0]).toBe(2);
  });

  it('RIGHT sets the digit and moves to the next position, which starts at 0', () => {
    const s = createState();
    const check = accept('0000');
    pressSettled(s, 'LEFT', check);
    pressSettled(s, 'LEFT', check);
    pressSettled(s, 'RIGHT', check);
    expect(s.position).toBe(1);
    expect(s.digits).toEqual([2, 0, 0, 0]);
    expect(entryString(s)).toBe('2000');
  });
});

describe('labels', () => {
  it('match the control table for each state and position', () => {
    const s = createState();
    const check = accept('9999');
    expect(labelsFor(s)).toEqual({ left: 'Turn dial', right: 'Set digit' });
    pressSettled(s, 'RIGHT', check);
    pressSettled(s, 'RIGHT', check);
    expect(labelsFor(s)).toEqual({ left: 'Turn dial', right: 'Set digit' });
    pressSettled(s, 'RIGHT', check);
    expect(s.position).toBe(3);
    expect(labelsFor(s)).toEqual({ left: 'Turn dial', right: 'Open vault' });
    pressSettled(s, 'RIGHT', check); // submits 0000: denied, run over
    expect(s.phase).toBe('DENIED');
    expect(labelsFor(s)).toEqual({ left: '—', right: '—' });
    ticks(s, Math.ceil(DENIED_MS / TICK_MS) + 1);
    expect(labelsFor(s)).toEqual({ left: '—', right: '—' });
    const ok = createState();
    enter(ok, '9999', check);
    expect(ok.phase).toBe('OPENING');
    expect(labelsFor(ok)).toEqual({ left: '—', right: '—' });
  });
});

describe('submitting', () => {
  it('position 4 submits the full entry to checkPin exactly once', () => {
    const s = createState();
    const check = recordingCheck('7319');
    enter(s, '7319', check);
    expect(check.calls).toEqual(['7319']);
    expect(s.phase).toBe('OPENING');
  });

  it('a correct entry opens the vault and marks completion once after the animation; later input is ignored', () => {
    const s = createState();
    const check = accept('7319');
    enter(s, '7319', check);
    expect(s.completionFired).toBe(false);
    ticks(s, Math.ceil(OPENING_MS / TICK_MS) + 1);
    expect(s.completionFired).toBe(true);
    press(s, 'LEFT', check);
    press(s, 'RIGHT', check);
    ticks(s, 10);
    expect(s.phase).toBe('OPENING');
    expect(s.digits).toEqual([7, 3, 1, 9]);
  });

  it('a wrong entry is denied once and ends the run: failure fires once, no retry, no further input', () => {
    const s = createState();
    const check = recordingCheck('7319');
    enter(s, '7318', check);
    expect(s.phase).toBe('DENIED');
    expect(s.attempts).toBe(1);
    expect(s.digits).toEqual([7, 3, 1, 8]); // shown while denied
    expect(s.failureFired).toBe(false);
    // Nothing the player presses changes anything any more.
    press(s, 'LEFT', check);
    press(s, 'RIGHT', check);
    ticks(s, Math.ceil(DENIED_MS / TICK_MS) + 1);
    expect(s.failureFired).toBe(true);
    expect(s.completionFired).toBe(false);
    press(s, 'LEFT', check);
    press(s, 'RIGHT', check);
    ticks(s, 120);
    expect(s.phase).toBe('DENIED');
    expect(s.position).toBe(3);
    expect(s.digits).toEqual([7, 3, 1, 8]);
    expect(s.rotation).toBeNull();
    expect(check.calls).toEqual(['7318']); // checked exactly once, never again
    expect(s.completionFired).toBe(false);
  });

  it('holds no PIN of its own: the same key presses are accepted or denied purely by checkPin', () => {
    const a = createState();
    enter(a, '2468', accept('2468'));
    expect(a.phase).toBe('OPENING');
    const b = createState();
    enter(b, '2468', accept('1357'));
    expect(b.phase).toBe('DENIED');
    const src = JSON.stringify(createState());
    expect(src.includes('7319')).toBe(false);
  });
});

describe('createGame', () => {
  it('publishes labels on every change and fires onComplete exactly once, never onFail', () => {
    const labels: string[] = [];
    let completions = 0;
    let failures = 0;
    const game = createGame({
      checkPin: accept('0001'),
      onLabels: (l) => labels.push(`${l.left}/${l.right}`),
      onComplete: () => completions++,
      onFail: () => failures++,
    });
    expect(labels).toEqual(['Turn dial/Set digit']);
    const settle = () => game.step(TURN_DURATION_MS + TICK_MS * 2);
    game.press('RIGHT');
    settle();
    game.press('RIGHT');
    settle();
    game.press('RIGHT');
    settle();
    expect(labels.at(-1)).toBe('Turn dial/Open vault');
    game.press('LEFT');
    settle();
    game.press('RIGHT');
    settle(); // 0001 accepted
    expect(labels.at(-1)).toBe('—/—');
    expect(completions).toBe(0);
    advance(game, OPENING_MS + 50);
    expect(completions).toBe(1);
    game.press('RIGHT');
    advance(game, 1000);
    expect(completions).toBe(1);
    expect(failures).toBe(0);
  });

  it('a wrong entry fires onFail exactly once after the denied flash, never onComplete, and ignores input', () => {
    const labels: string[] = [];
    let completions = 0;
    let failures = 0;
    const game = createGame({
      checkPin: accept('1111'),
      onLabels: (l) => labels.push(`${l.left}/${l.right}`),
      onComplete: () => completions++,
      onFail: () => failures++,
    });
    const settle = () => game.step(TURN_DURATION_MS + TICK_MS * 2);
    for (let i = 0; i < 4; i++) {
      game.press('RIGHT');
      settle();
    }
    expect(labels.at(-1)).toBe('—/—');
    expect(failures).toBe(0);
    advance(game, DENIED_MS + 50);
    expect(failures).toBe(1);
    game.press('LEFT');
    game.press('RIGHT');
    advance(game, 5000);
    expect(failures).toBe(1);
    expect(completions).toBe(0);
    expect(game.state.phase).toBe('DENIED');
    expect(labels.at(-1)).toBe('—/—');
  });

  it('dispose stops everything and is safe to call twice', () => {
    let completions = 0;
    const game = createGame({ checkPin: accept('0000'), onComplete: () => completions++ });
    const settle = () => game.step(TURN_DURATION_MS + TICK_MS * 2);
    for (let i = 0; i < 4; i++) {
      game.press('RIGHT');
      settle();
    }
    expect(game.state.phase).toBe('OPENING');
    game.dispose();
    game.dispose();
    advance(game, OPENING_MS * 2);
    game.press('LEFT');
    expect(completions).toBe(0);
    expect(game.disposed).toBe(true);
  });
});
