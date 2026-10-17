// G3 adapter: wires the pure game logic to a canvas and the shared minigame contract.
// Auto-registers when imported. CORE imports this module for the side effect.

import { WORLD_HEIGHT, WORLD_WIDTH, OVERFLOW_LOCKOUT_MS, createGame, hashSeed, type Game } from "./logic";
import { drawFrame } from "./render";
import { register } from "../registry";
import type { Button, MinigameAdapter, MinigameRegistryEntry, MinigameStartArgs } from "../types";

export type { Button, MinigameAdapter, MinigameRegistryEntry, MinigameStartArgs } from "../types";
export { TARGET_LINES } from "./logic";

export const G3_ID = "G3";

export function createG3Adapter(): MinigameAdapter {
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
    drawFrame(ctx, game.state, canvas.width, canvas.height);
    
    // Call onFail after overflow lockout period
    if (game.state.phase === "OVERFLOW" && game.state.phaseMs >= OVERFLOW_LOCKOUT_MS && !failFired) {
      failFired = true;
      args?.onFail();
    }
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
      completed = false; // Reset completion flag for new game
      args = startArgs;

      host = startArgs.container ?? document.getElementById("minigame-root");
      if (!host) {
        console.warn("[G3] no container and no #minigame-root found; mounting on document.body");
        host = document.body;
      }

      canvas = document.createElement("canvas");
      canvas.dataset["minigame"] = G3_ID;
      canvas.style.display = "block";
      canvas.style.margin = "0 auto";
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", "Memory block stacking minigame");
      host.appendChild(canvas);

      const context = canvas.getContext("2d");
      if (!context) {
        console.error("[G3] 2D canvas context unavailable");
        teardownScene();
        return;
      }
      ctx = context;

      game = createGame({
        // The block sequence is seeded from the run id: reproducible per run, identical for every stage.
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

/** Registry entry for G3 Core Defrag (two-button Tetris). */
export const g3Entry: MinigameRegistryEntry = {
  id: G3_ID,
  name: "Core Defrag",
  ready: true,
  inputCount: 2, // Hovering: LEFT=Rotate, RIGHT=Drop. Falling: LEFT=Left, RIGHT=Right.
  adapter: createG3Adapter,
};

// Auto-register when this module is imported
register(g3Entry);
