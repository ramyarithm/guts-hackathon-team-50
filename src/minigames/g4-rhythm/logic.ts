/**
 * G4 Rhythm Game - Pure game logic
 *
 * A one-button rhythm game where the player taps in time to music.
 * - The music (c1.mp3 with drums once, then the no-drums loop) is played by the shared
 *   audio engine, driven by the controller; this module never touches audio.
 * - After Start: a listen-in of at least INTRO_BEATS, then PLAYING begins on the next bar
 * - PLAYING: one cue per beat for GAME_BEATS; the tracker fills with accurate taps and
 *   drains with misses
 * - 130 BPM = ~461.5ms per beat, matching the music
 *
 * Timing comes from a clock measured in beats (`state.clockBeat`). When the adapter passes
 * the music's beat clock to tick()/press(), game time is derived from it and can never
 * drift from the music. Without one (audio unavailable or not yet started) an internal
 * 130 BPM clock runs from simulation time and the game plays identically, just silently.
 */

import type { ControlLabels } from '../types';

export type { Button, ControlLabels } from '../types';

// ---- Tuning -----------------------------------------------------------------

/** Beats per minute of the track (c1.mp3) */
export const BPM = 130;

/** Milliseconds per beat */
export const MS_PER_BEAT = 60000 / BPM; // ~461.5ms

export const BEATS_PER_BAR = 4;
export const MS_PER_BAR = MS_PER_BEAT * BEATS_PER_BAR; // ~1846ms

/**
 * Minimum listen-in after Start, in beats (3 bars, ~5.5 s; was 5 s). PLAYING then starts
 * on the next bar line of the clock, so the listen-in lasts INTRO_BEATS..INTRO_BEATS+3.
 */
export const INTRO_BEATS = 12;
export const INTRO_DURATION_MS = INTRO_BEATS * MS_PER_BEAT;

/** Beats to tap once PLAYING starts (16 bars, ~29.5 s; was 30 s). */
export const GAME_BEATS = 64;

/**
 * Manual calibration added by the adapter to the music beat clock, in ms. Positive if the
 * cues are heard later than the clock says. The audio engine already subtracts the
 * AudioContext's reported output latency, so this stays 0 unless tuned by ear.
 */
export const AUDIO_LATENCY_OFFSET_MS = 0;

/**
 * Accuracy windows (ms from perfect beat timing)
 * These determine how much the tracker fills/drains
 */
export const ACCURACY = {
  PERFECT: 50, // ±50ms = perfect hit
  GREAT: 100, // ±100ms = great hit
  GOOD: 150, // ±150ms = good hit
  OK: 200, // ±200ms = ok hit
  // Beyond OK = miss
} as const;

/** Points added/subtracted for each accuracy level */
export const SCORE_DELTA = {
  PERFECT: 15,
  GREAT: 10,
  GOOD: 5,
  OK: 2,
  MISS: -10, // Pressing at wrong time
  SKIP: -5, // Not pressing when should have
} as const;

/** Tracker bar range */
export const TRACKER_MIN = 0;
export const TRACKER_MAX = 100;
export const TRACKER_START = 50;
export const TRACKER_WIN_THRESHOLD = 80;

/** Game duration after the listen-in (ms) */
export const GAME_DURATION_MS = GAME_BEATS * MS_PER_BEAT;

/** Grace period at start where misses don't count (ms) */
export const GRACE_PERIOD_MS = 1000;

export const WORLD_WIDTH = 320;
export const WORLD_HEIGHT = 480;

// ---- Types ------------------------------------------------------------------

export type Phase = 'READY' | 'INTRO' | 'PLAYING' | 'SUCCESS' | 'FAILED';

export type HitRating = 'PERFECT' | 'GREAT' | 'GOOD' | 'OK' | 'MISS' | 'SKIP' | null;

export interface BeatEvent {
  time: number; // When this beat occurs (ms from game start)
  hit: boolean; // Whether player hit this beat
  rating: HitRating; // How accurate the hit was
}

export interface GameState {
  phase: Phase;
  /**
   * Current clock position in beats: the music's beat clock when one is fed to tick()/press(),
   * otherwise an internal 130 BPM clock accumulated from simulation time.
   */
  clockBeat: number;
  clockSource: 'music' | 'internal';
  /** clockBeat when Start was pressed for this attempt (game time 0); null in READY. */
  startBeat: number | null;
  /** Game time (ms) of the first PLAYING beat: the first bar line >= INTRO_BEATS after Start. */
  playStartMs: number;
  /** Game time (ms) when the song ends. */
  playEndMs: number;
  /** Milliseconds since Start was pressed (intro + playing), derived from the clock */
  timeMs: number;
  /** Milliseconds spent in current phase */
  phaseMs: number;
  /** Tracker bar value (0-100) */
  tracker: number;
  /** All beats in the song */
  beats: BeatEvent[];
  /** Index of next beat to check */
  nextBeatIndex: number;
  /** Last hit rating for display */
  lastRating: HitRating;
  /** Time of last rating for fade effect */
  lastRatingTime: number;
  /** Whether intro drums are playing */
  introDrums: boolean;
  /** Completion flag */
  completionFired: boolean;
  /** Recent hit timings for visual feedback */
  recentHits: Array<{ time: number; rating: HitRating }>;
}

export interface GameCallbacks {
  onComplete?: () => void;
  onLabels?: (labels: ControlLabels) => void;
  onPhaseChange?: (phase: Phase, introDrums: boolean) => void;
}

export interface Game {
  readonly state: GameState;
  readonly disposed: boolean;
  /**
   * Advance by `elapsedMs` of frame time. `beatClock` is the music's current beat
   * (fractional) when audio is playing; omit it or pass null to use the internal clock.
   */
  tick(elapsedMs: number, beatClock?: number | null): void;
  /** Handle a press; `beatClock` as for tick(), sampled at the moment of the press. */
  press(beatClock?: number | null): void;
  dispose(): void;
}

// ---- Pure helpers -----------------------------------------------------------

export function labelsFor(phase: Phase): ControlLabels {
  switch (phase) {
    case 'READY':
      return { left: 'Start', right: '—' };
    case 'INTRO':
      return { left: 'Listen...', right: '—' };
    case 'PLAYING':
      return { left: 'Beat!', right: '—' };
    case 'SUCCESS':
      return { left: '—', right: '—' };
    case 'FAILED':
      return { left: 'Retry', right: '—' };
  }
}

/** Generate `count` beat timestamps, one per beat from `startMs` (game time). */
function generateBeats(startMs: number, count: number): BeatEvent[] {
  const beats: BeatEvent[] = [];
  for (let i = 0; i < count; i++) {
    beats.push({ time: startMs + i * MS_PER_BEAT, hit: false, rating: null });
  }
  return beats;
}

/** The first bar line at or after `beat` (absolute clock beats). */
function nextBarAtOrAfter(beat: number): number {
  return Math.ceil(beat / BEATS_PER_BAR - 1e-9) * BEATS_PER_BAR;
}

/** Find the closest beat to a given time */
function findClosestBeat(beats: BeatEvent[], time: number, searchRange: number): number {
  let closest = -1;
  let closestDist = Infinity;

  for (let i = 0; i < beats.length; i++) {
    const dist = Math.abs(beats[i].time - time);
    if (dist < closestDist && dist <= searchRange) {
      closest = i;
      closestDist = dist;
    }
  }

  return closest;
}

/** Rate a hit based on timing accuracy */
function rateHit(deltaMs: number): HitRating {
  const abs = Math.abs(deltaMs);
  if (abs <= ACCURACY.PERFECT) return 'PERFECT';
  if (abs <= ACCURACY.GREAT) return 'GREAT';
  if (abs <= ACCURACY.GOOD) return 'GOOD';
  if (abs <= ACCURACY.OK) return 'OK';
  return 'MISS';
}

/** Get score delta for a rating */
function scoreDelta(rating: HitRating): number {
  switch (rating) {
    case 'PERFECT':
      return SCORE_DELTA.PERFECT;
    case 'GREAT':
      return SCORE_DELTA.GREAT;
    case 'GOOD':
      return SCORE_DELTA.GOOD;
    case 'OK':
      return SCORE_DELTA.OK;
    case 'MISS':
      return SCORE_DELTA.MISS;
    case 'SKIP':
      return SCORE_DELTA.SKIP;
    default:
      return 0;
  }
}

function createInitialState(
  clockBeat = 0,
  clockSource: 'music' | 'internal' = 'internal',
): GameState {
  return {
    phase: 'READY',
    clockBeat,
    clockSource,
    startBeat: null,
    playStartMs: INTRO_DURATION_MS,
    playEndMs: INTRO_DURATION_MS + GAME_DURATION_MS,
    timeMs: 0,
    phaseMs: 0,
    tracker: TRACKER_START,
    beats: [], // generated when Start is pressed, aligned to the clock's bars
    nextBeatIndex: 0,
    lastRating: null,
    lastRatingTime: 0,
    introDrums: true,
    completionFired: false,
    recentHits: [],
  };
}

// ---- Game controller --------------------------------------------------------

export function createGame(callbacks: GameCallbacks = {}): Game {
  let state = createInitialState();
  let disposed = false;

  const publishLabels = (): void => {
    if (!disposed) callbacks.onLabels?.(labelsFor(state.phase));
  };

  const setPhase = (phase: Phase): void => {
    state.phase = phase;
    state.phaseMs = 0;
    publishLabels();

    // Notify about phase/audio changes
    if (phase === 'INTRO') {
      state.introDrums = true;
      callbacks.onPhaseChange?.(phase, true);
    } else if (phase === 'PLAYING') {
      state.introDrums = false;
      callbacks.onPhaseChange?.(phase, false);
    } else {
      callbacks.onPhaseChange?.(phase, state.introDrums);
    }
  };

  /**
   * Lay out this attempt's chart on the clock: PLAYING begins on the first bar line at
   * least INTRO_BEATS after Start, then one cue per beat for GAME_BEATS.
   */
  const alignChart = (): void => {
    const start = state.startBeat ?? state.clockBeat;
    const playStartBeat = nextBarAtOrAfter(start + INTRO_BEATS);
    state.playStartMs = (playStartBeat - start) * MS_PER_BEAT;
    state.playEndMs = state.playStartMs + GAME_DURATION_MS;
    state.beats = generateBeats(state.playStartMs, GAME_BEATS);
    state.nextBeatIndex = 0;
  };

  /** Move the clock on: follow the music's beat when given, else run at 130 BPM from dt. */
  const advanceClock = (dt: number, beatClock: number | null | undefined): void => {
    if (typeof beatClock === 'number' && Number.isFinite(beatClock)) {
      if (state.clockSource !== 'music' && state.startBeat !== null) {
        // The music clock appeared mid-attempt (e.g. the Start press also unlocked audio):
        // keep game time continuous, and while still listening, put the chart on the music's bars.
        state.startBeat += beatClock - state.clockBeat;
        if (state.phase === 'INTRO') {
          state.clockBeat = beatClock;
          alignChart();
        }
      }
      state.clockSource = 'music';
      state.clockBeat = beatClock;
    } else {
      state.clockSource = 'internal';
      state.clockBeat += dt / MS_PER_BEAT;
    }
    if ((state.phase === 'INTRO' || state.phase === 'PLAYING') && state.startBeat !== null) {
      state.timeMs = (state.clockBeat - state.startBeat) * MS_PER_BEAT;
    }
  };

  const addRating = (rating: HitRating): void => {
    state.lastRating = rating;
    state.lastRatingTime = state.timeMs;
    state.recentHits.push({ time: state.timeMs, rating });

    // Keep only recent hits (last 2 seconds)
    state.recentHits = state.recentHits.filter((h) => state.timeMs - h.time < 2000);

    // Update tracker
    const delta = scoreDelta(rating);
    state.tracker = Math.max(TRACKER_MIN, Math.min(TRACKER_MAX, state.tracker + delta));
  };

  const checkMissedBeats = (): void => {
    // Check if any beats have passed without being hit
    const missWindow = ACCURACY.OK + 50; // A bit past the OK window

    while (state.nextBeatIndex < state.beats.length) {
      const beat = state.beats[state.nextBeatIndex];

      if (state.timeMs > beat.time + missWindow) {
        // This beat was missed
        if (!beat.hit && state.timeMs > state.playStartMs + GRACE_PERIOD_MS) {
          beat.rating = 'SKIP';
          addRating('SKIP');
        }
        state.nextBeatIndex++;
      } else {
        break;
      }
    }
  };

  const tick = (elapsedMs: number, beatClock?: number | null): void => {
    if (disposed) return;

    const dt = Math.min(elapsedMs, 100); // Cap delta time
    state.phaseMs += dt;
    advanceClock(dt, beatClock);

    switch (state.phase) {
      case 'READY':
        // Waiting for player to start
        break;

      case 'INTRO':
        // Listening; PLAYING starts on the aligned bar line
        if (state.timeMs >= state.playStartMs) {
          setPhase('PLAYING');
        }
        break;

      case 'PLAYING':
        // Check for missed beats
        checkMissedBeats();

        // Check win/lose conditions
        if (
          state.tracker >= TRACKER_WIN_THRESHOLD &&
          state.timeMs >= state.playStartMs + GAME_DURATION_MS * 0.5
        ) {
          // Won! (reached threshold and played at least half the song)
          setPhase('SUCCESS');
        } else if (state.tracker <= TRACKER_MIN) {
          // Failed - tracker emptied
          setPhase('FAILED');
        } else if (state.timeMs >= state.playEndMs) {
          // Time's up - check if passed
          if (state.tracker >= TRACKER_START) {
            setPhase('SUCCESS');
          } else {
            setPhase('FAILED');
          }
        }
        break;

      case 'SUCCESS':
        if (!state.completionFired && state.phaseMs >= 1000) {
          state.completionFired = true;
          callbacks.onComplete?.();
        }
        break;

      case 'FAILED':
        // Waiting for retry
        break;
    }
  };

  const press = (beatClock?: number | null): void => {
    if (disposed) return;
    // Judge against the clock as it is right now, not as of the last frame.
    if (typeof beatClock === 'number') advanceClock(0, beatClock);

    switch (state.phase) {
      case 'READY':
        state.startBeat = state.clockBeat;
        state.timeMs = 0;
        alignChart();
        setPhase('INTRO');
        break;

      case 'INTRO':
        // Ignore presses during intro - just listen
        break;

      case 'PLAYING': {
        // Find closest beat within reasonable range
        const searchRange = ACCURACY.OK + 100;
        const beatIndex = findClosestBeat(state.beats, state.timeMs, searchRange);

        if (beatIndex >= 0 && !state.beats[beatIndex].hit) {
          const beat = state.beats[beatIndex];
          const delta = state.timeMs - beat.time;
          const rating = rateHit(delta);

          beat.hit = true;
          beat.rating = rating;
          addRating(rating);
        } else {
          // No beat nearby - it's a miss
          addRating('MISS');
        }
        break;
      }

      case 'FAILED':
        // Retry: a fresh attempt on the clock that is already running (the music keeps going)
        state = createInitialState(state.clockBeat, state.clockSource);
        publishLabels();
        break;

      case 'SUCCESS':
        // Do nothing
        break;
    }
  };

  const game: Game = {
    get state() {
      return state;
    },
    get disposed() {
      return disposed;
    },
    tick,
    press,
    dispose(): void {
      disposed = true;
    },
  };

  publishLabels();
  return game;
}

// ---- Helpers for rendering --------------------------------------------------

/** Get the current beat progress (0-1) within the current beat, on the grid anchored at `originMs`. */
export function getBeatProgress(timeMs: number, originMs = 0): number {
  const sinceOrigin = timeMs - originMs;
  return (((sinceOrigin % MS_PER_BEAT) + MS_PER_BEAT) % MS_PER_BEAT) / MS_PER_BEAT;
}

/** Get beats that should be visible (upcoming and recent) */
export function getVisibleBeats(state: GameState, windowMs: number = 2000): BeatEvent[] {
  return state.beats.filter(
    (b) => b.time >= state.timeMs - windowMs && b.time <= state.timeMs + windowMs,
  );
}

/** Get time until next beat (negative if past) */
export function getTimeToNextBeat(state: GameState): number {
  if (state.nextBeatIndex >= state.beats.length) return Infinity;
  return state.beats[state.nextBeatIndex].time - state.timeMs;
}
