// G2 adapter: wires the pure game logic to a canvas and the shared minigame contract.
// Auto-registers when imported. CORE imports this module for the side effect.

import { WORLD_HEIGHT, WORLD_WIDTH, HIT_LOCKOUT_MS, createGame, hashSeed, type Game } from "./logic";
import { createRenderer } from "./render";
import { register } from "../registry";
import type { Button, MinigameAdapter, MinigameRegistryEntry, MinigameStartArgs } from "../types";

export type { Button, MinigameAdapter, MinigameRegistryEntry, MinigameStartArgs } from "../types";
export { LANE_COUNT } from "./logic";

export const G2_ID = "G2";

export function createG2Adapter(): MinigameAdapter {
  // Every piece of mutable state lives inside this closure; no module-level state.
  let args: MinigameStartArgs | null = null;
  let game: Game | null = null;
  let host: HTMLElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let rafId: number | null = null;
  let lastFrameTs: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let windowResizeHandler: (() => void) | null = null;
  let completed = false;
  let failFired = false;
  let disposed = false;
  // Static layers are cached per adapter instance, never at module level.
  const renderer = createRenderer();

  const resize = (): void => {
    if (disposed || !host || !canvas) return;
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
    const elapsed = lastFrameTs === null ? 0 : ts - lastFrameTs;
    lastFrameTs = ts;
    game.step(elapsed);
    if (disposed || !game || !ctx || !canvas) return;
    renderer.drawFrame(ctx, game.state, canvas.width, canvas.height);
    
    // Call onFail after hit lockout period
    if (game.state.phase === "HIT" && game.state.phaseMs >= HIT_LOCKOUT_MS && !failFired) {
      failFired = true;
      args?.onFail();
    }
    rafId = requestAnimationFrame(frame);
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
      args = startArgs;

      host = startArgs.container ?? document.getElementById("minigame-root");
      if (!host) {
        console.warn("[G2] no container and no #minigame-root found; mounting on document.body");
        host = document.body;
      }

      canvas = document.createElement("canvas");
      canvas.dataset["minigame"] = G2_ID;
      canvas.style.display = "block";
      canvas.style.margin = "0 auto";
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", "Lane crossing minigame");
      host.appendChild(canvas);

      const context = canvas.getContext("2d");
      if (!context) {
        console.error("[G2] 2D canvas context unavailable");
        teardownScene();
        return;
      }
      ctx = context;

      game = createGame({
        // Lanes are seeded from the run id: reproducible per run, identical for every stage.
        seed: hashSeed(startArgs.runId),
        onLabels: (labels) => {
          if (!disposed) args?.setControlLabels(labels);
        },
        onComplete: () => {
          if (disposed || completed) return;
          completed = true;
          args?.onComplete();
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
      if (disposed || completed || !game) return;
      if (button !== "LEFT" && button !== "RIGHT") return;
      game.press(button);
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      teardownScene();
      args = null;
    },
  };

  return adapter;
}

/** Registry entry for G2 Lane Crossing. */
export const g2Entry: MinigameRegistryEntry = {
  id: G2_ID,
  name: "Lane Crossing",
  ready: true,
  inputCount: 2, // LEFT=Back, RIGHT=Forward
  adapter: createG2Adapter,
};

// Auto-register when this module is imported
register(g2Entry);
