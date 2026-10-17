/**
 * G4 Rhythm Game - Pure game logic
 * 
 * A one-button rhythm game where the player taps in time to music.
 * - First 5 seconds: plays drums version (with beat)
 * - After 5 seconds: switches to beatless version, player must keep the rhythm
 * - Tracker bar fills with accurate taps, drains with misses
 * - 129 BPM = ~465ms per beat
 */

import type { ControlLabels } from "../types";

export type { Button, ControlLabels } from "../types";

// ---- Tuning -----------------------------------------------------------------

/** Beats per minute of the track */
export const BPM = 129;

/** Milliseconds per beat */
export const MS_PER_BEAT = 60000 / BPM; // ~582.5ms

/** Duration to play the drums version before switching (ms) */
export const INTRO_DURATION_MS = 5000;

/** 
 * Accuracy windows (ms from perfect beat timing)
 * These determine how much the tracker fills/drains
 */
export const ACCURACY = {
  PERFECT: 50,    // ±50ms = perfect hit
  GREAT: 100,     // ±100ms = great hit  
  GOOD: 150,      // ±150ms = good hit
  OK: 200,        // ±200ms = ok hit
  // Beyond OK = miss
} as const;

/** Points added/subtracted for each accuracy level */
export const SCORE_DELTA = {
  PERFECT: 15,
  GREAT: 10,
  GOOD: 5,
  OK: 2,
  MISS: -10,      // Pressing at wrong time
  SKIP: -5,       // Not pressing when should have
} as const;

/** Tracker bar range */
export const TRACKER_MIN = 0;
export const TRACKER_MAX = 100;
export const TRACKER_START = 50;
export const TRACKER_WIN_THRESHOLD = 80;

/** Game duration after intro (ms) - about 30 seconds of rhythm */
export const GAME_DURATION_MS = 30000;

/** Grace period at start where misses don't count (ms) */
export const GRACE_PERIOD_MS = 1000;

export const WORLD_WIDTH = 320;
export const WORLD_HEIGHT = 480;

// ---- Types ------------------------------------------------------------------

export type Phase = "READY" | "INTRO" | "PLAYING" | "SUCCESS" | "FAILED";

export type HitRating = "PERFECT" | "GREAT" | "GOOD" | "OK" | "MISS" | "SKIP" | null;

export interface BeatEvent {
  time: number;       // When this beat occurs (ms from game start)
  hit: boolean;       // Whether player hit this beat
  rating: HitRating;  // How accurate the hit was
}

export interface GameState {
  phase: Phase;
  /** Milliseconds since game started (intro + playing) */
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
  tick(elapsedMs: number): void;
  press(): void;
  dispose(): void;
}

// ---- Pure helpers -----------------------------------------------------------

export function labelsFor(phase: Phase): ControlLabels {
  switch (phase) {
    case "READY":
      return { left: "Start", right: "—" };
    case "INTRO":
      return { left: "Listen...", right: "—" };
    case "PLAYING":
      return { left: "Beat!", right: "—" };
    case "SUCCESS":
      return { left: "—", right: "—" };
    case "FAILED":
      return { left: "Retry", right: "—" };
  }
}

/** Generate all beat timestamps for the song */
function generateBeats(startOffset: number, duration: number): BeatEvent[] {
  const beats: BeatEvent[] = [];
  let time = startOffset;
  
  while (time < startOffset + duration) {
    beats.push({
      time,
      hit: false,
      rating: null,
    });
    time += MS_PER_BEAT;
  }
  
  return beats;
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
  if (abs <= ACCURACY.PERFECT) return "PERFECT";
  if (abs <= ACCURACY.GREAT) return "GREAT";
  if (abs <= ACCURACY.GOOD) return "GOOD";
  if (abs <= ACCURACY.OK) return "OK";
  return "MISS";
}

/** Get score delta for a rating */
function scoreDelta(rating: HitRating): number {
  switch (rating) {
    case "PERFECT": return SCORE_DELTA.PERFECT;
    case "GREAT": return SCORE_DELTA.GREAT;
    case "GOOD": return SCORE_DELTA.GOOD;
    case "OK": return SCORE_DELTA.OK;
    case "MISS": return SCORE_DELTA.MISS;
    case "SKIP": return SCORE_DELTA.SKIP;
    default: return 0;
  }
}

function createInitialState(): GameState {
  // Beats start after intro, during the playing phase
  const beats = generateBeats(INTRO_DURATION_MS, GAME_DURATION_MS);
  
  return {
    phase: "READY",
    timeMs: 0,
    phaseMs: 0,
    tracker: TRACKER_START,
    beats,
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
    if (phase === "INTRO") {
      state.introDrums = true;
      callbacks.onPhaseChange?.(phase, true);
    } else if (phase === "PLAYING") {
      state.introDrums = false;
      callbacks.onPhaseChange?.(phase, false);
    } else {
      callbacks.onPhaseChange?.(phase, state.introDrums);
    }
  };

  const addRating = (rating: HitRating): void => {
    state.lastRating = rating;
    state.lastRatingTime = state.timeMs;
    state.recentHits.push({ time: state.timeMs, rating });
    
    // Keep only recent hits (last 2 seconds)
    state.recentHits = state.recentHits.filter(h => state.timeMs - h.time < 2000);
    
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
        if (!beat.hit && state.timeMs > INTRO_DURATION_MS + GRACE_PERIOD_MS) {
          beat.rating = "SKIP";
          addRating("SKIP");
        }
        state.nextBeatIndex++;
      } else {
        break;
      }
    }
  };

  const tick = (elapsedMs: number): void => {
    if (disposed) return;
    
    const dt = Math.min(elapsedMs, 100); // Cap delta time
    state.phaseMs += dt;
    
    if (state.phase === "INTRO" || state.phase === "PLAYING") {
      state.timeMs += dt;
    }

    switch (state.phase) {
      case "READY":
        // Waiting for player to start
        break;
        
      case "INTRO":
        // Playing drums version
        if (state.timeMs >= INTRO_DURATION_MS) {
          setPhase("PLAYING");
        }
        break;
        
      case "PLAYING":
        // Check for missed beats
        checkMissedBeats();
        
        // Check win/lose conditions
        if (state.tracker >= TRACKER_WIN_THRESHOLD && 
            state.timeMs >= INTRO_DURATION_MS + GAME_DURATION_MS * 0.5) {
          // Won! (reached threshold and played at least half the song)
          setPhase("SUCCESS");
        } else if (state.tracker <= TRACKER_MIN) {
          // Failed - tracker emptied
          setPhase("FAILED");
        } else if (state.timeMs >= INTRO_DURATION_MS + GAME_DURATION_MS) {
          // Time's up - check if passed
          if (state.tracker >= TRACKER_START) {
            setPhase("SUCCESS");
          } else {
            setPhase("FAILED");
          }
        }
        break;
        
      case "SUCCESS":
        if (!state.completionFired && state.phaseMs >= 1000) {
          state.completionFired = true;
          callbacks.onComplete?.();
        }
        break;
        
      case "FAILED":
        // Waiting for retry
        break;
    }
  };

  const press = (): void => {
    if (disposed) return;

    switch (state.phase) {
      case "READY":
        setPhase("INTRO");
        break;
        
      case "INTRO":
        // Ignore presses during intro - just listen
        break;
        
      case "PLAYING": {
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
          addRating("MISS");
        }
        break;
      }
        
      case "FAILED":
        // Retry
        state = createInitialState();
        publishLabels();
        break;
        
      case "SUCCESS":
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

/** Get the current beat progress (0-1) within the current beat */
export function getBeatProgress(timeMs: number): number {
  const beatPosition = (timeMs % MS_PER_BEAT) / MS_PER_BEAT;
  return beatPosition;
}

/** Get beats that should be visible (upcoming and recent) */
export function getVisibleBeats(state: GameState, windowMs: number = 2000): BeatEvent[] {
  return state.beats.filter(b => 
    b.time >= state.timeMs - windowMs && 
    b.time <= state.timeMs + windowMs
  );
}

/** Get time until next beat (negative if past) */
export function getTimeToNextBeat(state: GameState): number {
  if (state.nextBeatIndex >= state.beats.length) return Infinity;
  return state.beats[state.nextBeatIndex].time - state.timeMs;
}
