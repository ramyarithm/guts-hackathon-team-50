/**
 * Boss Tunnel Escape - Pure game logic
 * 
 * The player escapes through a dark maintenance tunnel with two actions:
 * - LEFT: Toggle flashlight ON/OFF
 * - RIGHT: Move forward (only works when light is ON)
 * 
 * Fail conditions:
 * - Light on too long → Monster sees you → Caught
 * - Standing still too long → Monster catches up → Caught
 * 
 * Win condition: Reach the end of the tunnel
 */

import type { Button, ControlLabels } from "../types";

// ---- Configuration ----

/** Total distance to travel to escape */
export const TUNNEL_LENGTH = 100;

/** Distance gained per move action */
export const MOVE_DISTANCE = 8;

/** Maximum time (ms) light can be on before monster sees you */
export const MAX_LIGHT_TIME_MS = 3500;

/** Maximum time (ms) standing still before monster catches you */
export const MAX_STILL_TIME_MS = 5000;

/** Time (ms) to show caught state before triggering fail */
export const CAUGHT_HOLD_MS = 1500;

/** Time (ms) to show escaped state before triggering complete */
export const ESCAPED_HOLD_MS = 500;

// ---- Types ----

export type TunnelPhase = 'PLAYING' | 'CAUGHT' | 'ESCAPED';

export interface TunnelState {
  phase: TunnelPhase;
  phaseMs: number;           // Time in current phase
  lightOn: boolean;
  lightOnTime: number;       // ms light has been on continuously
  stillTime: number;         // ms since last move
  distanceTraveled: number;  // 0 to TUNNEL_LENGTH
}

export interface TunnelCallbacks {
  onLabels: (labels: ControlLabels) => void;
  onComplete: () => void;
}

export interface TunnelGame {
  readonly state: TunnelState;
  tick: (dt: number) => void;
  input: (button: Button) => void;
  dispose: () => void;
}

// ---- Control Labels ----

function labelsFor(state: TunnelState): ControlLabels {
  switch (state.phase) {
    case 'PLAYING':
      return {
        left: state.lightOn ? 'LIGHT OFF' : 'LIGHT ON',
        right: state.lightOn ? 'MOVE' : '—',
      };
    case 'CAUGHT':
    case 'ESCAPED':
      return { left: '—', right: '—' };
  }
}

// ---- Game Factory ----

export function createGame(callbacks: TunnelCallbacks): TunnelGame {
  const state: TunnelState = {
    phase: 'PLAYING',
    phaseMs: 0,
    lightOn: false,
    lightOnTime: 0,
    stillTime: 0,
    distanceTraveled: 0,
  };

  let disposed = false;
  let completeFired = false;

  // Send initial labels
  callbacks.onLabels(labelsFor(state));

  function setPhase(phase: TunnelPhase): void {
    if (state.phase === phase) return;
    state.phase = phase;
    state.phaseMs = 0;
    callbacks.onLabels(labelsFor(state));
  }

  function tick(dt: number): void {
    if (disposed) return;

    state.phaseMs += dt;

    switch (state.phase) {
      case 'PLAYING': {
        // Update light timer
        if (state.lightOn) {
          state.lightOnTime += dt;
          if (state.lightOnTime >= MAX_LIGHT_TIME_MS) {
            setPhase('CAUGHT');
            return;
          }
        }

        // Update still timer (always counting, reset on move)
        state.stillTime += dt;
        if (state.stillTime >= MAX_STILL_TIME_MS) {
          setPhase('CAUGHT');
          return;
        }
        break;
      }

      case 'CAUGHT': {
        // Hold on caught screen then fail is handled by adapter
        break;
      }

      case 'ESCAPED': {
        // Hold briefly then complete
        if (state.phaseMs >= ESCAPED_HOLD_MS && !completeFired) {
          completeFired = true;
          callbacks.onComplete();
        }
        break;
      }
    }
  }

  function input(button: Button): void {
    if (disposed || state.phase !== 'PLAYING') return;

    if (button === 'LEFT') {
      // Toggle light
      state.lightOn = !state.lightOn;
      if (state.lightOn) {
        // Just turned on - reset light timer
        state.lightOnTime = 0;
      }
      callbacks.onLabels(labelsFor(state));
    } else if (button === 'RIGHT') {
      // Move forward - only works if light is on
      if (state.lightOn) {
        state.distanceTraveled += MOVE_DISTANCE;
        state.stillTime = 0; // Reset still timer on move

        // Check for escape
        if (state.distanceTraveled >= TUNNEL_LENGTH) {
          state.distanceTraveled = TUNNEL_LENGTH;
          setPhase('ESCAPED');
        }
      }
    }
  }

  function dispose(): void {
    disposed = true;
  }

  return {
    get state() { return state; },
    tick,
    input,
    dispose,
  };
}
