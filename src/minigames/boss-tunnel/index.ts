/**
 * Dead Line - adapter for the first-person tunnel escape (the boss fight).
 *
 * Fills the whole browser window (the one exception to the shared layout): a fixed
 * full-screen canvas sized to the viewport x devicePixelRatio, re-fitted on resize and
 * orientation change, with the HUD and the two control labels drawn on top. Removing the
 * canvas on dispose restores the shared layout untouched. Not in the minigame pool: the
 * controller starts it after the vault opens.
 */

import { createBossAudio, type BossAudio } from "./audio";
import {
  ATTENTION_CAUGHT,
  DETECT_THRESHOLD,
  DOOR_WHEEL_MS,
  PANIC_THRESHOLD,
  createState,
  labelsFor,
  press,
  step,
  takeEvents,
  type TunnelEvent,
  type TunnelState,
} from "./logic";
import { createRenderer, type Renderer } from "./render";
import type { Button, MinigameAdapter, MinigameStartArgs } from "../types";

export type { Button, MinigameAdapter, MinigameStartArgs } from "../types";
export type { TunnelEvent } from "./logic";

export const BOSS_ID = "BOSS";
/** Backing resolution cap. */
const MAX_DPR = 2;
/** Heartbeat interval at the panic threshold; it speeds up toward CAUGHT. */
const HEARTBEAT_MS = 900;
const CAUGHT_HOLD_MS_FADE = 300;

export interface BossStartArgs extends MinigameStartArgs {
  /** Optional: called at the matching gameplay moment, each once per tunnel run. */
  onEvent?: (name: TunnelEvent) => void;
}

/** Seed from the run id so the layout is reproducible per run. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** True when a rect covers the whole viewport (used by the fullscreen check). */
export function fillsViewport(rect: { left: number; top: number; width: number; height: number }, vw: number, vh: number): boolean {
  return rect.left <= 0 && rect.top <= 0 && rect.width >= vw && rect.height >= vh;
}

export function createBossAdapter(): MinigameAdapter {
  let args: BossStartArgs | null = null;
  let state: TunnelState | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let rafId: number | null = null;
  let lastTs: number | null = null;
  let onResize: (() => void) | null = null;
  let audio: BossAudio | null = null;
  let renderer: Renderer | null = null;
  let completed = false;
  let failed = false;
  let disposed = false;
  let lastLabels = "";
  let seen = { step: -Infinity, click: -Infinity, denied: -Infinity, caught: false, sighting: false, heartbeat: 0, wheel: false, clank: false };

  const publishLabels = (): void => {
    if (!state || disposed) return;
    const l = labelsFor(state);
    const key = `${l.left}/${l.right}`;
    if (key === lastLabels) return;
    lastLabels = key;
    args?.setControlLabels(l);
  };

  const resize = (): void => {
    if (!canvas) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  };

  const frame = (ts: number): void => {
    if (disposed || !state || !ctx || !canvas) return;
    rafId = requestAnimationFrame(frame);
    const dt = lastTs === null ? 0 : ts - lastTs;
    lastTs = ts;
    step(state, dt);
    for (const name of takeEvents(state)) {
      try {
        args?.onEvent?.(name);
      } catch (error) {
        console.warn("[BOSS] onEvent failed", error);
      }
    }
    // Sound cues from state changes.
    if (audio) {
      const s = state;
      if (s.lastStepMs !== seen.step) { seen.step = s.lastStepMs; if (Number.isFinite(s.lastStepMs)) audio.footstep(); }
      if (s.lastClickMs !== seen.click) { seen.click = s.lastClickMs; if (Number.isFinite(s.lastClickMs)) audio.click(); }
      if (s.lastDeniedMs !== seen.denied) { seen.denied = s.lastDeniedMs; if (Number.isFinite(s.lastDeniedMs)) audio.blocked(); }
      if (s.attention >= DETECT_THRESHOLD && !seen.sighting) { seen.sighting = true; audio.sightingSting(); }
      if (s.phase === "CAUGHT" && !seen.caught) { seen.caught = true; audio.caughtSting(); audio.setPresence(0, 0); }
      if (s.phase === "TUNNEL") {
        seen.caught = false;
        const level = s.attention / ATTENTION_CAUGHT;
        audio.setPresence(level, s.creatureSide);
        const panic = (s.attention - PANIC_THRESHOLD) / (ATTENTION_CAUGHT - PANIC_THRESHOLD);
        if (panic >= 0 && ts - seen.heartbeat >= HEARTBEAT_MS * (1 - 0.55 * panic)) { seen.heartbeat = ts; audio.heartbeat(); }
      }
      if (s.phase === "SURFACE") {
        // The door: the wheel ratchets round, the leaf unseats with a clank, then everything fades under the daylight.
        if (!seen.wheel) { seen.wheel = true; audio.setPresence(0, 0); audio.wheelSpin(DOOR_WHEEL_MS); }
        if (!seen.clank && s.phaseMs >= DOOR_WHEEL_MS) { seen.clank = true; audio.doorClank(); audio.fadeOut(2200); }
      }
    }
    renderer?.draw(ctx, state, canvas.width, canvas.height, ts);
    publishLabels();
    if (state.completionFired && !completed && !failed) {
      completed = true;
      args?.onComplete();
    } else if (state.failureFired && !failed && !completed) {
      failed = true; // caught: the run is over (the controller's Game Over flow)
      audio?.fadeOut(CAUGHT_HOLD_MS_FADE);
      args?.onFail();
    }
  };

  const teardown = (): void => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    lastTs = null;
    if (onResize) {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      onResize = null;
    }
    audio?.dispose();
    audio = null;
    renderer?.dispose();
    renderer = null;
    canvas?.remove();
    canvas = null;
    ctx = null;
    state = null;
  };

  const adapter: MinigameAdapter = {
    startMinigame(startArgs: MinigameStartArgs): void {
      if (disposed) return;
      teardown();
      args = startArgs as BossStartArgs;
      completed = false;
      failed = false;
      lastLabels = "";
      seen = { step: -Infinity, click: -Infinity, denied: -Infinity, caught: false, sighting: false, heartbeat: 0, wheel: false, clank: false };

      canvas = document.createElement("canvas");
      canvas.dataset["minigame"] = BOSS_ID;
      canvas.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:100;display:block;background:#000;";
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", "Dead Line: first-person tunnel escape");
      document.body.appendChild(canvas);
      const context = canvas.getContext("2d");
      if (!context) {
        console.error("[BOSS] 2D canvas context unavailable");
        teardown();
        return;
      }
      ctx = context;
      state = createState(hashSeed(startArgs.runId));
      renderer = createRenderer();
      audio = createBossAudio();
      audio.unlock();
      resize();
      onResize = () => resize();
      window.addEventListener("resize", onResize);
      window.addEventListener("orientationchange", onResize);
      publishLabels();
      rafId = requestAnimationFrame(frame);
    },

    handleInput(button: Button): void {
      if (disposed || completed || failed || !state) return;
      if (button !== "LEFT" && button !== "RIGHT") return;
      audio?.unlock();
      press(state, button);
      publishLabels();
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      teardown();
      args = null;
    },
  };

  return adapter;
}
