/**
 * Dead Line - pure rules. One rule: "Light shows the way. Light wakes the creature."
 * LEFT toggles the lantern, RIGHT steps forward, and only while the lantern is on. Light
 * on to move (danger rises), light off to hide (danger falls). Every junction is taken
 * correctly: the chalk is always visible because you can only arrive with light.
 */

import type { Button, ControlLabels } from "../types";
import {
  HEADING_ANGLE, buildGeometry, headingAt, posAt, type Heading, type Junction, type Layout,
} from "./world";

export type { Button, ControlLabels } from "../types";
export type { Heading, Junction, Layout, Tile } from "./world";

// ---- Tuning ---------------------------------------------------------------------------

export const ATTENTION_CAUGHT = 100;
export const DETECT_THRESHOLD = 30;
export const PANIC_THRESHOLD = 70;
/** Danger per second while the lantern is on. */
export const LANTERN_RATE_PER_S = 20;
/** Danger per step. */
export const STEP_NOISE = 6;
/** Danger lost per second hiding in the dark. */
export const DARK_DECAY_PER_S = 3.2;
export const SCRIPTED_DETECT_CELL = 2;
/** After the eyes react, the lantern raises nothing for this long. */
export const GRACE_MS = 2000;
/** The eyes take this long to turn toward the light once they are out. */
export const REACT_DELAY_MS = 900;
export const STEP_MS = 200;
/** Camera turn into the correct branch at a junction. */
export const TURN_MS = 350;
/** "Too dark to move" hint hold. */
export const DARK_HINT_MS = 1500;
/** The cut to black and the reason are shown this long, then onFail. */
export const CAUGHT_HOLD_MS = 1500;
/** Door sequence: the wheel spins, the door swings, daylight floods, then onComplete. */
export const DOOR_WHEEL_MS = 900;
export const DOOR_SWING_MS = 1100;
export const DOOR_FLOOD_MS = 700;
export const SURFACE_HOLD_MS = DOOR_WHEEL_MS + DOOR_SWING_MS + DOOR_FLOOD_MS + 300;
export const ONE_RULE = "Light shows the way. Light wakes the creature.";
export const DARK_HINT_TEXT = "Too dark to move. Turn your lantern on.";

// ---- Layout ---------------------------------------------------------------------------

export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function validateLayout(l: Layout): string | null {
  if (l.length < 14 || l.length > 18) return "length";
  if (l.junctions.length < 4 || l.junctions.length > 5) return "junction count";
  const cells = l.junctions.map((j) => j.cell);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    if (c < 3 || c > l.length - 3) return "junction position";
    if (i > 0 && c - cells[i - 1]! < 3) return "junction spacing";
  }
  if (l.path.length !== l.length + 1 || l.headings.length !== l.length) return "geometry";
  if (l.stubs.length !== l.junctions.length) return "stubs";
  if (buildGeometry(l.length, l.junctions) === null) return "geometry crosses";
  return null;
}

/** Alternating turns never cross at spacing 3; used when a seed cannot be laid out. */
export const FALLBACK_LAYOUT: Layout = buildGeometry(16, [
  { cell: 3, correct: "LEFT" }, { cell: 6, correct: "RIGHT" }, { cell: 9, correct: "LEFT" }, { cell: 12, correct: "RIGHT" },
])!;

export function generateLayout(seed: number): Layout {
  const rng = createSeededRng(seed * 7919 + 13);
  // Junctions sit at cells 3..length-3, at least 3 apart: four need 15 cells, five need 18.
  const length = 15 + Math.floor(rng() * 4);
  const count = length === 18 && rng() < 0.5 ? 5 : 4;
  const cells: number[] = [];
  let slack = length - 3 - (3 + 3 * (count - 1));
  for (let i = 0; i < count; i++) {
    const extra = slack > 0 && rng() < 0.5 ? 1 : 0;
    slack -= extra;
    cells.push((i === 0 ? 3 : cells[i - 1]! + 3) + extra);
  }
  // Roll branch directions until the path fits the grid without crossing itself.
  for (let attempt = 0; attempt < 80; attempt++) {
    const junctions: Junction[] = cells.map((cell) => ({ cell, correct: rng() < 0.5 ? "LEFT" : "RIGHT" }));
    const layout = buildGeometry(length, junctions);
    if (layout && validateLayout(layout) === null) return layout;
  }
  return FALLBACK_LAYOUT;
}

// ---- State ----------------------------------------------------------------------------

export type Phase = "TUNNEL" | "CAUGHT" | "SURFACE";
export type TunnelEvent = "tunnel_enter" | "monster_first_detected" | "monster_reacts_to_flashlight" | "light_mechanic_revealed";
/** "light": danger maxed while the lantern was on. "found": any other cause. */
export type CaughtReason = "light" | "found";
export type Prompt = "lantern" | "step" | "light_off" | null;

export interface TunnelState {
  layout: Layout;
  phase: Phase;
  cell: number;
  lanternOn: boolean;
  attention: number;
  /** Step in progress toward cell + 1. */
  transition: { elapsedMs: number } | null;
  /** Camera turn in progress at a junction. */
  turn: { elapsedMs: number; from: Heading; to: Heading } | null;
  bufferedPress: Button | null;
  /** Remaining hold of the "too dark to move" hint. */
  darkHintMs: number;
  grace: number;
  /** Time since the eyes first came out. */
  detectMs: number;
  eyesTurned: boolean;
  creatureSide: -1 | 1;
  caughtReason: CaughtReason | null;
  tutorial: { lit: boolean; stepped: boolean; lightOffAfterEyes: boolean };
  phaseMs: number;
  timeMs: number;
  lastStepMs: number;
  lastClickMs: number;
  lastDeniedMs: number;
  firedEvents: TunnelEvent[];
  pendingEvents: TunnelEvent[];
  completionFired: boolean;
  /** Set once when the caught hold has elapsed: the run is over. */
  failureFired: boolean;
}

export function createState(seed: number): TunnelState {
  return {
    layout: generateLayout(seed), phase: "TUNNEL", cell: 0, lanternOn: false, attention: 0,
    transition: null, turn: null, bufferedPress: null, darkHintMs: 0, grace: 0, detectMs: 0,
    eyesTurned: false, creatureSide: 1, caughtReason: null,
    tutorial: { lit: false, stepped: false, lightOffAfterEyes: false },
    phaseMs: 0, timeMs: 0, lastStepMs: -Infinity, lastClickMs: -Infinity, lastDeniedMs: -Infinity,
    firedEvents: [], pendingEvents: [], completionFired: false, failureFired: false,
  };
}

// ---- Queries ----------------------------------------------------------------------------

export function junctionAt(state: TunnelState, cell: number): Junction | null {
  return state.layout.junctions.find((j) => j.cell === cell) ?? null;
}
export function eyesVisible(state: TunnelState): boolean {
  return state.attention >= DETECT_THRESHOLD && state.phase !== "SURFACE";
}
export function darkHintVisible(state: TunnelState): boolean {
  return state.phase === "TUNNEL" && state.darkHintMs > 0;
}

export function labelsFor(state: TunnelState): ControlLabels {
  switch (state.phase) {
    case "TUNNEL":
      return state.lanternOn ? { left: "Lantern off", right: "Step forward" } : { left: "Lantern on", right: "Too dark" };
    case "CAUGHT":
    case "SURFACE":
      return { left: "—", right: "—" };
  }
}

/** The guided prompt to show (non-blocking), or null. */
export function tutorialPrompt(state: TunnelState): Prompt {
  if (state.phase !== "TUNNEL") return null;
  if (state.eyesTurned && !state.tutorial.lightOffAfterEyes) return "light_off";
  if (!state.tutorial.lit) return "lantern";
  if (!state.tutorial.stepped) return "step";
  return null;
}

export const PROMPT_TEXT: Record<Exclude<Prompt, null>, string> = {
  lantern: "Turn your lantern ON (LEFT) to see.",
  step: "Press RIGHT to step forward.",
  light_off: "It hunts light. Turn it OFF to hide, then move again.",
};

export function takeEvents(state: TunnelState): TunnelEvent[] {
  const out = state.pendingEvents;
  state.pendingEvents = [];
  return out;
}

export function transitionProgress(state: TunnelState): number {
  return state.transition ? Math.min(1, state.transition.elapsedMs / STEP_MS) : 1;
}

const easeInOut = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

/** Where the camera is and which way it faces, in grid units and radians. */
export function cameraPose(state: TunnelState): { x: number; y: number; angle: number } {
  const l = state.layout;
  const from = posAt(l, state.cell);
  let x = from.x, y = from.y;
  if (state.transition) {
    const to = posAt(l, state.cell + 1);
    const p = easeInOut(transitionProgress(state));
    x = from.x + (to.x - from.x) * p;
    y = from.y + (to.y - from.y) * p;
  }
  let angle = HEADING_ANGLE[headingAt(l, state.cell)]!;
  if (state.turn) {
    const a0 = HEADING_ANGLE[state.turn.from]!;
    const a1 = HEADING_ANGLE[state.turn.to]!;
    let delta = a1 - a0;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    angle = a0 + delta * easeInOut(Math.min(1, state.turn.elapsedMs / TURN_MS));
  }
  return { x, y, angle };
}

/** Door opening progress (each 0..1) once the player has reached it. */
export function doorSequence(state: TunnelState): { wheel: number; swing: number; flood: number } {
  if (state.phase !== "SURFACE") return { wheel: 0, swing: 0, flood: 0 };
  const t = state.phaseMs;
  const clamp = (v: number): number => Math.max(0, Math.min(1, v));
  return {
    wheel: clamp(t / DOOR_WHEEL_MS),
    swing: clamp((t - DOOR_WHEEL_MS) / DOOR_SWING_MS),
    flood: clamp((t - DOOR_WHEEL_MS - DOOR_SWING_MS) / DOOR_FLOOD_MS),
  };
}

// ---- Internals ---------------------------------------------------------------------------

function fire(state: TunnelState, name: TunnelEvent): void {
  if (state.firedEvents.includes(name)) return;
  state.firedEvents.push(name);
  state.pendingEvents.push(name);
}
function setPhase(state: TunnelState, phase: Phase): void {
  state.phase = phase;
  state.phaseMs = 0;
}
function addAttention(state: TunnelState, amount: number, fromLight: boolean): void {
  if (fromLight && state.grace > 0) return;
  state.attention = Math.max(0, Math.min(ATTENTION_CAUGHT, state.attention + amount));
}
function caught(state: TunnelState): void {
  state.caughtReason = state.lanternOn ? "light" : "found";
  state.lanternOn = false;
  state.transition = null;
  state.turn = null;
  state.bufferedPress = null;
  state.darkHintMs = 0;
  setPhase(state, "CAUGHT");
}
function beginStep(state: TunnelState): void {
  state.transition = { elapsedMs: 0 };
  state.lastStepMs = state.timeMs;
  state.tutorial.stepped = true;
  addAttention(state, STEP_NOISE, false);
}
function arrive(state: TunnelState): void {
  state.cell += 1;
  state.transition = null;
  if (state.cell === SCRIPTED_DETECT_CELL && state.attention < DETECT_THRESHOLD + 2) state.attention = DETECT_THRESHOLD + 2;
  if (state.cell >= state.layout.length) {
    state.cell = state.layout.length;
    state.bufferedPress = null;
    setPhase(state, "SURFACE");
    return;
  }
  const j = junctionAt(state, state.cell);
  if (j) state.turn = { elapsedMs: 0, from: state.layout.headings[state.cell - 1]!, to: state.layout.headings[state.cell]! };
  const next = state.layout.junctions.find((x) => x.cell > state.cell);
  if (next) state.creatureSide = next.correct === "LEFT" ? 1 : -1;
}
function flushBuffered(state: TunnelState): void {
  const queued = state.bufferedPress;
  state.bufferedPress = null;
  if (queued && state.phase === "TUNNEL") applyPress(state, queued);
}

// ---- Simulation -------------------------------------------------------------------------

export function step(state: TunnelState, dtMs: number): void {
  const dt = Math.min(Math.max(dtMs, 0), 250);
  if (state.timeMs === 0) fire(state, "tunnel_enter");
  state.timeMs += dt;
  state.phaseMs += dt;
  if (state.grace > 0) state.grace = Math.max(0, state.grace - dt);
  if (state.darkHintMs > 0) state.darkHintMs = Math.max(0, state.darkHintMs - dt);

  switch (state.phase) {
    case "TUNNEL": {
      if (state.attention >= ATTENTION_CAUGHT) { caught(state); break; }
      if (state.lanternOn) addAttention(state, (LANTERN_RATE_PER_S * dt) / 1000, true);
      else state.attention = Math.max(0, state.attention - (DARK_DECAY_PER_S * dt) / 1000);
      if (state.attention >= DETECT_THRESHOLD) {
        fire(state, "monster_first_detected");
        state.detectMs += dt;
      }
      if (state.lanternOn && eyesVisible(state) && state.detectMs >= REACT_DELAY_MS && !state.eyesTurned) {
        state.eyesTurned = true;
        fire(state, "monster_reacts_to_flashlight");
        fire(state, "light_mechanic_revealed");
        state.grace = GRACE_MS;
      }
      if (state.transition) {
        state.transition.elapsedMs += dt;
        if (state.transition.elapsedMs >= STEP_MS) {
          arrive(state);
          if (!state.turn) flushBuffered(state);
        }
      } else if (state.turn) {
        state.turn.elapsedMs += dt;
        if (state.turn.elapsedMs >= TURN_MS) {
          state.turn = null;
          flushBuffered(state);
        }
      }
      if (state.phase === "TUNNEL" && state.attention >= ATTENTION_CAUGHT) caught(state);
      break;
    }
    case "CAUGHT":
      if (state.phaseMs >= CAUGHT_HOLD_MS && !state.failureFired) state.failureFired = true;
      break;
    case "SURFACE":
      if (state.phaseMs >= SURFACE_HOLD_MS && !state.completionFired) state.completionFired = true;
      break;
  }
}

function applyPress(state: TunnelState, button: Button): void {
  if (button === "LEFT") {
    state.lanternOn = !state.lanternOn;
    state.lastClickMs = state.timeMs;
    if (state.lanternOn) state.tutorial.lit = true;
    if (!state.lanternOn && state.eyesTurned) state.tutorial.lightOffAfterEyes = true;
    return;
  }
  if (!state.lanternOn) {
    state.darkHintMs = DARK_HINT_MS;
    state.lastDeniedMs = state.timeMs;
    return;
  }
  beginStep(state);
}

export function press(state: TunnelState, button: Button): void {
  switch (state.phase) {
    case "TUNNEL":
      if (state.transition || state.turn) {
        if (state.bufferedPress === null) state.bufferedPress = button;
        return;
      }
      applyPress(state, button);
      return;
    case "CAUGHT":
    case "SURFACE":
      return; // the run is over either way
  }
}
