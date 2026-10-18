/**
 * Boss Tunnel Escape - Adapter
 * 
 * Wires the pure game logic to a canvas and the shared minigame contract.
 * This is NOT registered in the normal minigame pool - it's called directly
 * by main.ts after PIN entry.
 */

import { CAUGHT_HOLD_MS, createGame, type TunnelGame } from "./logic";
import { drawFrame } from "./render";
import type { Button, MinigameAdapter, MinigameStartArgs } from "../types";

export type { Button, MinigameAdapter, MinigameStartArgs } from "../types";

export const BOSS_ID = "BOSS";

export function createBossAdapter(): MinigameAdapter {
  let args: MinigameStartArgs | null = null;
  let game: TunnelGame | null = null;
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
    if (disposed || !canvas) return;
    // Fullscreen: use window dimensions
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  };

  const frame = (ts: number): void => {
    if (disposed || !game || !ctx || !canvas) return;
    rafId = requestAnimationFrame(frame);
    const elapsed = lastFrameTs === null ? 0 : ts - lastFrameTs;
    lastFrameTs = ts;
    game.tick(elapsed);
    drawFrame(ctx, game.state, canvas.width, canvas.height);

    // Call onFail after caught hold period
    if (game.state.phase === 'CAUGHT' && game.state.phaseMs >= CAUGHT_HOLD_MS && !failFired) {
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
      teardownScene();
      args = startArgs;
      completed = false;
      failFired = false;

      host = startArgs.container ?? document.getElementById("minigame-root");
      if (!host) {
        console.warn("[BOSS] no container and no #minigame-root found; mounting on document.body");
        host = document.body;
      }

      canvas = document.createElement("canvas");
      canvas.dataset["minigame"] = BOSS_ID;
      // Fullscreen immersive display
      canvas.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 100;
        display: block;
      `;
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", "Tunnel escape boss minigame");
      document.body.appendChild(canvas);

      const context = canvas.getContext("2d");
      if (!context) {
        console.error("[BOSS] 2D canvas context unavailable");
        teardownScene();
        return;
      }
      ctx = context;

      game = createGame({
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
      // For fullscreen, always use window resize
      windowResizeHandler = () => resize();
      window.addEventListener("resize", windowResizeHandler);

      rafId = requestAnimationFrame(frame);
    },

    handleInput(button: Button): void {
      if (disposed || completed || failFired || !game) return;
      if (button !== "LEFT" && button !== "RIGHT") return;
      game.input(button);
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

// Export for direct use in main.ts (not registered in pool)
export { createBossAdapter as createAdapter };
