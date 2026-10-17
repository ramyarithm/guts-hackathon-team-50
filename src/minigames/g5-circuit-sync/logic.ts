// Pure game state and rules for G5 (Circuit Sync). No DOM access.
//
// A spinning wheel has alternating red/blue contacts. The player throws
// matching colored connectors when a contact aligns with the bottom marker.
// Hit all required contacts to restore the circuit.

import type { Button, ControlLabels } from "../types";

export type { Button, ControlLabels } from "../types";

// ---- Tuning ----

export const WORLD_WIDTH = 320;
export const WORLD_HEIGHT = 480;

/** Fixed simulation step (60 Hz). */
export const TICK_MS = 1000 / 60;
const DT = TICK_MS / 1000;

/** Game rules */
export const HITS_TO_WIN = 8;
export const ALLOWED_MISSES = 3;
export const CONTACT_COUNT = 6; // Number of contacts on wheel (alternating colors)
export const HIT_WINDOW = 0.28; // Radians tolerance for a valid hit
export const START_SPEED = 1.3; // Initial rotation speed (radians/sec)
export const SPEED_PER_HIT = 0.10; // Speed increase per successful hit
export const MISTAKE_MULTIPLIER = 1.65; // Speed multiplier on mistake
export const MISTAKE_BONUS = 0.22; // Additional speed on mistake
export const MAX_SPEED = 4.8; // Maximum rotation speed
export const SHOT_COOLDOWN_MS = 270; // Minimum time between throws

/** Success hold time before onComplete */
export const SUCCESS_HOLD_MS = 1500;

// ---- Constants ----

const TWO_PI = Math.PI * 2;
const BOTTOM = Math.PI / 2; // Target angle (bottom of wheel)

// ---- Types ----

export type Phase = "READY" | "PLAYING" | "SUCCESS" | "FAILED";
export type ConnectorType = 0 | 1; // 0 = red (LEFT), 1 = blue (RIGHT)

export interface SyncedConnector {
  localAngle: number; // Angle relative to wheel rotation
  type: ConnectorType;
}

export interface FlyingConnector {
  type: ConnectorType;
  startMs: number;
}

export interface GameState {
  phase: Phase;
  /** Current wheel rotation angle */
  angle: number;
  /** Current rotation speed (radians/sec) */
  speed: number;
  /** Successful hits */
  hits: number;
  /** Remaining misses allowed */
  missesLeft: number;
  /** Connectors successfully synced to the wheel */
  syncedConnectors: SyncedConnector[];
  /** Connectors currently flying toward wheel */
  flyingConnectors: FlyingConnector[];
  /** Time of last throw */
  lastThrowMs: number;
  /** Screen flash effect */
  flashUntilMs: number;
  flashType: "good" | "bad" | null;
  /** Screen shake */
  shake: number;
  /** Status message */
  message: string;
  messageType: "success" | "danger" | "";
  /** Timing */
  timeMs: number;
  phaseMs: number;
  accumulatorMs: number;
}

export interface GameCallbacks {
  onComplete?: () => void;
  onLabels?: (labels: ControlLabels) => void;
}

export interface Game {
  readonly state: GameState;
  readonly disposed: boolean;
  step(deltaMs: number): void;
  press(button: Button): void;
  dispose(): void;
}

// ---- Helpers ----

/** Shortest signed angle difference */
function angleDifference(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

// ---- Game Factory ----

export function createGame(callbacks: GameCallbacks = {}): Game {
  const { onComplete, onLabels } = callbacks;

  const state: GameState = {
    phase: "READY",
    angle: -0.38,
    speed: START_SPEED,
    hits: 0,
    missesLeft: ALLOWED_MISSES,
    syncedConnectors: [],
    flyingConnectors: [],
    lastThrowMs: -10000,
    flashUntilMs: 0,
    flashType: null,
    shake: 0,
    message: "ALIGN COLOR TO BOTTOM MARKER",
    messageType: "",
    timeMs: 0,
    phaseMs: 0,
    accumulatorMs: 0,
  };

  let disposed = false;
  let completeFired = false;

  function setPhase(p: Phase): void {
    state.phase = p;
    state.phaseMs = 0;
  }

  function updateLabels(): void {
    if (state.phase === "PLAYING" || state.phase === "READY") {
      onLabels?.({ left: "RED", right: "BLUE" });
    } else {
      onLabels?.({ left: "—", right: "—" });
    }
  }

  function throwConnector(type: ConnectorType): void {
    if (state.phase !== "PLAYING") return;
    
    // Check cooldown
    if (state.timeMs - state.lastThrowMs < SHOT_COOLDOWN_MS) return;
    state.lastThrowMs = state.timeMs;

    // Find closest contact point to bottom
    let closestIndex = 0;
    let closestDistance = Infinity;
    
    for (let i = 0; i < CONTACT_COUNT; i++) {
      const contactAngle = state.angle + i * TWO_PI / CONTACT_COUNT;
      const gap = Math.abs(angleDifference(contactAngle, BOTTOM));
      if (gap < closestDistance) {
        closestDistance = gap;
        closestIndex = i;
      }
    }

    const goodTiming = closestDistance <= HIT_WINDOW;
    const correctColor = (closestIndex % 2) === type;
    const success = goodTiming && correctColor;

    // Add flying connector animation
    state.flyingConnectors.push({ type, startMs: state.timeMs });

    // Flash effect
    state.flashUntilMs = state.timeMs + 160;
    state.flashType = success ? "good" : "bad";

    if (success) {
      state.hits++;
      state.syncedConnectors.push({ localAngle: BOTTOM - state.angle, type });
      state.speed = Math.min(MAX_SPEED, state.speed + SPEED_PER_HIT);
      state.message = "CONTACT RESTORED";
      state.messageType = "success";
    } else {
      state.missesLeft--;
      state.shake = 17;
      state.speed = Math.min(MAX_SPEED, state.speed * MISTAKE_MULTIPLIER + MISTAKE_BONUS);
      state.message = goodTiming ? "WRONG COLOR — SPEED UP" : "MISALIGNED — SPEED UP";
      state.messageType = "danger";
    }

    // Check win/lose
    if (state.hits >= HITS_TO_WIN) {
      setPhase("SUCCESS");
      state.message = "CIRCUIT RESTORED";
      state.messageType = "success";
      updateLabels();
    } else if (state.missesLeft <= 0) {
      setPhase("FAILED");
      state.message = "CIRCUIT OVERLOAD — FAILED";
      state.messageType = "danger";
      updateLabels();
    }
  }

  function tick(): void {
    if (state.phase === "PLAYING") {
      // Rotate wheel
      state.angle = (state.angle + state.speed * DT) % TWO_PI;
    }

    // Decay shake
    state.shake = Math.max(0, state.shake - DT * 40);

    // Remove old flying connectors
    state.flyingConnectors = state.flyingConnectors.filter(
      c => state.timeMs - c.startMs < 240
    );

    // Check for completion callback
    if (state.phase === "SUCCESS" && state.phaseMs >= SUCCESS_HOLD_MS && !completeFired) {
      completeFired = true;
      onComplete?.();
    }
  }

  const game: Game = {
    get state() { return state; },
    get disposed() { return disposed; },

    step(deltaMs: number): void {
      if (disposed) return;

      state.accumulatorMs += deltaMs;
      while (state.accumulatorMs >= TICK_MS) {
        state.accumulatorMs -= TICK_MS;
        state.timeMs += TICK_MS;
        state.phaseMs += TICK_MS;
        tick();
      }
    },

    press(button: Button): void {
      if (disposed) return;

      // Start game on first press
      if (state.phase === "READY") {
        setPhase("PLAYING");
        state.message = "ALIGN COLOR TO BOTTOM MARKER";
        state.messageType = "";
        updateLabels();
      }

      if (state.phase !== "PLAYING") return;

      // LEFT = red (0), RIGHT = blue (1)
      const type: ConnectorType = button === "LEFT" ? 0 : 1;
      throwConnector(type);
    },

    dispose(): void {
      disposed = true;
    },
  };

  // Initial labels
  updateLabels();

  return game;
}
