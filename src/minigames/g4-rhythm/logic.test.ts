// Tests for the G4 rhythm logic: 130 BPM timing, the music beat clock and the fallback
// clock. Run from the repo root with the Vitest installed in chicken-cross/:
//   ./chicken-cross/node_modules/.bin/vitest run src/minigames/g4-rhythm
import { describe, expect, it } from 'vitest';
import {
  ACCURACY,
  BEATS_PER_BAR,
  BPM,
  GAME_BEATS,
  INTRO_BEATS,
  MS_PER_BEAT,
  SCORE_DELTA,
  TRACKER_START,
  createGame,
  labelsFor,
  type Game,
} from './logic';

const FRAME_MS = 1000 / 60;

/** Advance a game without a music clock by roughly `ms` of simulation time. */
function runFallback(game: Game, ms: number): void {
  for (let t = 0; t < ms; t += FRAME_MS) game.tick(FRAME_MS);
}

/** Absolute clock beat of a chart beat: where it lands on the clock the attempt started on. */
function absoluteBeat(game: Game, chartTimeMs: number): number {
  return game.state.startBeat! + chartTimeMs / MS_PER_BEAT;
}

function expectOnGrid(game: Game): void {
  const { state } = game;
  expect(state.beats).toHaveLength(GAME_BEATS);
  const playStart = absoluteBeat(game, state.playStartMs);
  // PLAYING starts on a bar line, at least INTRO_BEATS after Start and less than a bar later.
  expect(playStart % BEATS_PER_BAR).toBeCloseTo(0, 6);
  expect(playStart).toBeGreaterThanOrEqual(state.startBeat! + INTRO_BEATS - 1e-6);
  expect(playStart).toBeLessThan(state.startBeat! + INTRO_BEATS + BEATS_PER_BAR);
  state.beats.forEach((b, i) => {
    const abs = absoluteBeat(game, b.time);
    expect(abs - Math.round(abs)).toBeCloseTo(0, 6); // a whole beat on the clock
    expect(abs).toBeCloseTo(playStart + i, 6); // one cue per beat, no gaps
  });
}

describe('G4 tempo', () => {
  it('runs at 130 BPM with whole-bar intro and song lengths', () => {
    expect(BPM).toBe(130);
    expect(MS_PER_BEAT).toBeCloseTo(60000 / 130, 9);
    expect(BEATS_PER_BAR).toBe(4);
    expect(INTRO_BEATS % BEATS_PER_BAR).toBe(0);
    expect(GAME_BEATS % BEATS_PER_BAR).toBe(0);
  });

  it('keeps the one-button labels for every phase', () => {
    expect(labelsFor('READY')).toEqual({ left: 'Start', right: '—' });
    expect(labelsFor('INTRO')).toEqual({ left: 'Listen...', right: '—' });
    expect(labelsFor('PLAYING')).toEqual({ left: 'Beat!', right: '—' });
    expect(labelsFor('SUCCESS')).toEqual({ left: '—', right: '—' });
    expect(labelsFor('FAILED')).toEqual({ left: 'Retry', right: '—' });
  });
});

describe('G4 fallback clock (no audio)', () => {
  it('puts every cue on the 130 BPM grid of the internal clock, starting on the next bar', () => {
    const game = createGame();
    runFallback(game, 700); // Start is pressed part-way through a beat
    expect(game.state.clockSource).toBe('internal');
    expect(game.state.clockBeat).toBeCloseTo(game.state.timeMs === 0 ? game.state.clockBeat : 0, 0);
    game.press();
    expect(game.state.phase).toBe('INTRO');
    expectOnGrid(game);
    // PLAYING begins exactly when game time reaches the aligned bar.
    while (game.state.phase === 'INTRO') game.tick(FRAME_MS);
    expect(game.state.phase).toBe('PLAYING');
    expect(game.state.timeMs).toBeGreaterThanOrEqual(game.state.playStartMs);
    expect(game.state.timeMs - game.state.playStartMs).toBeLessThan(FRAME_MS + 1e-6);
  });

  it('advances the internal clock at 130 BPM from simulation time', () => {
    const game = createGame();
    for (let i = 0; i < 60; i++) game.tick(FRAME_MS);
    expect(game.state.clockBeat * MS_PER_BEAT).toBeCloseTo(60 * FRAME_MS, 6);
  });
});

describe('G4 music beat clock', () => {
  it("lands every cue on the music's bar grid whichever beat Start is pressed on", () => {
    for (const pressBeat of [0, 7.3, 15.99, 16, 100.5]) {
      const game = createGame();
      game.tick(FRAME_MS, pressBeat);
      expect(game.state.clockSource).toBe('music');
      game.press(pressBeat);
      expect(game.state.startBeat).toBe(pressBeat);
      expectOnGrid(game);
      const playStart = absoluteBeat(game, game.state.playStartMs);
      expect(playStart).toBeCloseTo(
        Math.ceil((pressBeat + INTRO_BEATS) / BEATS_PER_BAR) * BEATS_PER_BAR,
        9,
      );
      // Game time follows the music clock, not frame time.
      game.tick(FRAME_MS, playStart);
      expect(game.state.phase).toBe('PLAYING');
      expect(game.state.timeMs).toBeCloseTo(game.state.playStartMs, 6);
    }
  });

  it('judges presses against the beat clock with the existing hit windows', () => {
    const game = createGame();
    game.tick(FRAME_MS, 7.3);
    game.press(7.3);
    const playStart = absoluteBeat(game, game.state.playStartMs); // 20
    game.tick(FRAME_MS, playStart);
    expect(game.state.phase).toBe('PLAYING');
    const ms = (beat: number, offsetMs: number) => beat + offsetMs / MS_PER_BEAT;

    game.press(ms(playStart, 40));
    expect(game.state.lastRating).toBe('PERFECT');
    expect(game.state.tracker).toBe(TRACKER_START + SCORE_DELTA.PERFECT);
    game.press(ms(playStart + 1, -ACCURACY.GREAT));
    expect(game.state.lastRating).toBe('GREAT');
    game.press(ms(playStart + 2, ACCURACY.GOOD));
    expect(game.state.lastRating).toBe('GOOD');
    game.press(ms(playStart + 3, -ACCURACY.OK));
    expect(game.state.lastRating).toBe('OK');
    game.press(ms(playStart + 4, ACCURACY.OK + 30));
    expect(game.state.lastRating).toBe('MISS');
    // As before, a press inside the search range consumes the nearest beat even when it is rated MISS.
    expect(game.state.beats.slice(0, 5).map((b) => b.rating)).toEqual([
      'PERFECT',
      'GREAT',
      'GOOD',
      'OK',
      'MISS',
    ]);
    expect(game.state.beats[5]!.hit).toBe(false);
  });

  it('a retry restarts the pattern on the next bar of the clock that is already running', () => {
    const game = createGame();
    game.tick(FRAME_MS, 2);
    game.press(2);
    const playStart = absoluteBeat(game, game.state.playStartMs);
    game.tick(FRAME_MS, playStart);
    // Five off-beat presses empty the tracker.
    for (let i = 0; i < 5; i++) game.press(playStart + 0.5);
    game.tick(FRAME_MS, playStart + 0.6);
    expect(game.state.phase).toBe('FAILED');
    const beatAtRetry = playStart + 30.7;
    game.tick(FRAME_MS, beatAtRetry);
    game.press(beatAtRetry); // retry -> READY, the clock keeps running
    expect(game.state.phase).toBe('READY');
    expect(game.state.clockBeat).toBe(beatAtRetry);
    expect(game.state.tracker).toBe(TRACKER_START);
    game.press(beatAtRetry); // Start again
    expect(game.state.phase).toBe('INTRO');
    expect(game.state.startBeat).toBe(beatAtRetry);
    expectOnGrid(game);
  });

  it('keeps game time continuous and re-aligns to the music bars when the clock appears mid-intro', () => {
    const game = createGame();
    runFallback(game, 1000);
    game.press(); // fallback start: the first press also unlocks audio in the real game
    const before = game.state.timeMs;
    game.tick(FRAME_MS, 0.5); // the music clock appears
    expect(game.state.clockSource).toBe('music');
    expect(game.state.timeMs).toBeCloseTo(before, 6);
    expect(game.state.phase).toBe('INTRO');
    expectOnGrid(game);
    // Start is now at music beat 0.5: PLAYING on the first bar line at least INTRO_BEATS later.
    const firstBar = Math.ceil((0.5 + INTRO_BEATS) / BEATS_PER_BAR) * BEATS_PER_BAR;
    expect(absoluteBeat(game, game.state.playStartMs)).toBeCloseTo(firstBar, 9);
  });

  it('falls back to the internal clock when the music clock goes away', () => {
    const game = createGame();
    game.tick(FRAME_MS, 5);
    game.tick(FRAME_MS, null);
    expect(game.state.clockSource).toBe('internal');
    expect(game.state.clockBeat).toBeCloseTo(5 + FRAME_MS / MS_PER_BEAT, 9);
  });
});

describe('G4 completion', () => {
  it('fires onComplete exactly once after a successful run', () => {
    let completions = 0;
    const game = createGame({ onComplete: () => completions++ });
    game.tick(FRAME_MS, 0);
    game.press(0);
    const playStart = absoluteBeat(game, game.state.playStartMs);
    for (let i = 0; i < GAME_BEATS; i++) {
      game.tick(FRAME_MS, playStart + i);
      if (game.state.phase === 'PLAYING') game.press(playStart + i);
      if (game.state.phase === 'SUCCESS') break;
    }
    expect(game.state.phase).toBe('SUCCESS');
    expect(completions).toBe(0);
    runFallback(game, 1100); // the success card holds for 1 s (ticks are capped at 100 ms each)
    expect(completions).toBe(1);
    runFallback(game, 1100);
    game.press();
    expect(completions).toBe(1);
  });
});

describe("G4 gameplay start with the music started fresh", () => {
  it("beat 0 is the Start press, the listen-in is the whole drums intro, and PLAYING starts exactly at the handoff", () => {
    const game = createGame();
    // The adapter passes beat 0 on the Start press: the engine has just scheduled c1 from
    // its first downbeat at that moment, so game time and the music share the same zero.
    game.press(0);
    expect(game.state.phase).toBe("INTRO");
    expect(game.state.clockSource).toBe("music");
    expect(game.state.startBeat).toBe(0);
    expect(INTRO_BEATS).toBe(16); // the whole drums intro (4 bars) is the listen-in
    expect(game.state.playStartMs).toBeCloseTo(16 * MS_PER_BEAT, 6);
    game.tick(FRAME_MS, -0.06); // the first frames run just ahead of the scheduled start
    expect(game.state.phase).toBe("INTRO");
    expect(game.state.startBeat).toBe(0);
    game.tick(FRAME_MS, 15.99);
    expect(game.state.phase).toBe("INTRO");
    game.tick(FRAME_MS, 16); // the no-drums loop takes over on this very beat
    expect(game.state.phase).toBe("PLAYING");
    expect(game.state.timeMs).toBeCloseTo(16 * MS_PER_BEAT, 6);
    expectOnGrid(game);
  });
});
