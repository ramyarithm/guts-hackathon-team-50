// E1 adapter: the PIN door. Wires the pure game logic to a canvas and the shared minigame
// contract. Registered outside the random pool (`pool: false`): the controller starts it
// for the ending once all four stages are complete, passing a `checkPin` callback that
// owns the real PIN. A wrong entry ends the run (onFail). Auto-registers when imported.

import { WORLD_HEIGHT, WORLD_WIDTH, createGame, type Game, type PinCheck } from "./logic";
import { createRenderer } from "./render";
import { register } from "../registry";
import type { Button, MinigameAdapter, MinigameRegistryEntry, MinigameStartArgs } from "../types";

export type { Button, MinigameAdapter, MinigameRegistryEntry, MinigameStartArgs } from "../types";
export { CODE_LENGTH, DIAL_SIZE } from "./logic";
export type { PinCheck } from "./logic";

export const E1_ID = "E1";

/** Start arguments for the PIN door: the shared contract plus the PIN check. */
export interface E1StartArgs extends MinigameStartArgs {
  /** Validates a complete 4-digit entry. The controller derives it from its PIN config. */
  checkPin?: PinCheck;
}

/** Optional click sound. Silent when audio is unavailable or blocked; visuals suffice. */
function createClicker(): { click(): void; close(): void } {
  let audio: AudioContext | null = null;
  let failed = false;
  const ensure = (): AudioContext | null => {
    if (failed || audio) return audio;
    try {
      const Ctor = (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
      if (!Ctor) {
        failed = true;
        return null;
      }
      audio = new Ctor();
    } catch {
      failed = true;
      audio = null;
    }
    return audio;
  };
  return {
    click(): void {
      const ctx = ensure();
      if (!ctx) return;
      try {
        if (ctx.state === "suspended") void ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = 1400;
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.07);
      } catch {
        // Audio is optional; ignore any failure.
      }
    },
    close(): void {
      try {
        void audio?.close();
      } catch {
        // ignore
      }
      audio = null;
    },
  };
}

export function createE1Adapter(): MinigameAdapter {
  // Every piece of mutable state lives inside this closure; no module-level state.
  let args: E1StartArgs | null = null;
  let game: Game | null = null;
  let host: HTMLElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let rafId: number | null = null;
  let lastFrameTs: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let windowResizeHandler: (() => void) | null = null;
  let completed = false;
  let failed = false;
  let disposed = false;
  let lastClickSeen = -Infinity;
  const renderer = createRenderer();
  const clicker = createClicker();

  const resize = (): void => {
    if (!host || !canvas) return;
    const cssW = host.clientWidth || WORLD_WIDTH;
    // A host with no explicit height gets the game's natural aspect ratio.
    const cssH = host.clientHeight || (cssW * WORLD_HEIGHT) / WORLD_WIDTH;
    const fit = Math.min(cssW / WORLD_WIDTH, cssH / WORLD_HEIGHT);
    const drawW = Math.max(1, Math.floor(WORLD_WIDTH * fit));
    const drawH = Math.max(1, Math.floor(WORLD_HEIGHT * fit));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.style.width = `${drawW}px`;
    canvas.style.height = `${drawH}px`;
    canvas.width = Math.round(drawW * dpr);
    canvas.height = Math.round(drawH * dpr);
  };

  const frame = (ts: number): void => {
    if (disposed || !game || !ctx || !canvas) return;
    rafId = requestAnimationFrame(frame);
    const elapsed = lastFrameTs === null ? 0 : ts - lastFrameTs;
    lastFrameTs = ts;
    game.step(elapsed);
    // onComplete / onFail run inside step() and the controller may dispose this scene
    // synchronously in response; stop here if it did.
    if (disposed || !game || !ctx || !canvas) return;
    if (game.state.lastClickMs !== lastClickSeen) {
      lastClickSeen = game.state.lastClickMs;
      if (Number.isFinite(lastClickSeen)) clicker.click();
    }
    renderer.drawFrame(ctx, game.state, canvas.width, canvas.height);
  };

  const teardownScene = (): void => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastFrameTs = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (windowResizeHandler) {
      window.removeEventListener("resize", windowResizeHandler);
      windowResizeHandler = null;
    }
    game?.dispose();
    game = null;
    canvas?.remove();
    canvas = null;
    ctx = null;
    host = null;
  };

  const adapter: MinigameAdapter = {
    startMinigame(startArgs: MinigameStartArgs): void {
      if (disposed) return;
      // Starting twice on one instance replaces the previous scene cleanly.
      teardownScene();
      args = startArgs as E1StartArgs;
      if (typeof args.checkPin !== "function") {
        console.warn("[E1] started without checkPin; every entry will be denied");
      }

      host = startArgs.container ?? document.getElementById("minigame-root");
      if (!host) {
        console.warn("[E1] no container and no #minigame-root found; mounting on document.body");
        host = document.body;
      }

      canvas = document.createElement("canvas");
      canvas.dataset["minigame"] = E1_ID;
      canvas.style.display = "block";
      canvas.style.margin = "0 auto";
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", "Exit door: enter the four-digit code on the vault dial");
      host.appendChild(canvas);

      const context = canvas.getContext("2d");
      if (!context) {
        console.error("[E1] 2D canvas context unavailable");
        teardownScene();
        return;
      }
      ctx = context;

      game = createGame({
        checkPin: args.checkPin,
        onLabels: (labels) => {
          if (!disposed) args?.setControlLabels(labels);
        },
        onComplete: () => {
          if (disposed || completed || failed) return;
          completed = true;
          args?.onComplete();
        },
        // A wrong entry ends the run: signalled once, after the denied flash.
        onFail: () => {
          if (disposed || completed || failed) return;
          failed = true;
          args?.onFail();
        },
      });

      resize();
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => resize());
        resizeObserver.observe(host);
      } else {
        windowResizeHandler = () => resize();
        window.addEventListener("resize", windowResizeHandler);
      }

      rafId = requestAnimationFrame(frame);
    },

    handleInput(button: Button): void {
      if (disposed || completed || failed || !game) return;
      if (button !== "LEFT" && button !== "RIGHT") return;
      game.press(button);
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      teardownScene();
      clicker.close();
      args = null;
    },
  };

  return adapter;
}

/** Registry entry for E1, the PIN door. */
export const e1Entry: MinigameRegistryEntry = {
  id: E1_ID,
  name: "Vault Door",
  ready: true,
  inputCount: 2, // LEFT turns the dial, RIGHT sets the digit / opens
  pool: false, // The ending door: never drawn for C1-C4
  adapter: createE1Adapter,
};

// Auto-register when this module is imported
register(e1Entry);
