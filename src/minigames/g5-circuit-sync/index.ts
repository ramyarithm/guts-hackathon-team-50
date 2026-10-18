// Adapter for G5 (Circuit Sync) - timing game with spinning wheel and colored contacts.

import { createGame, hashSeed, type Game } from "./logic";
import { drawFrame } from "./render";
import { register } from "../registry";
import type { Button, MinigameAdapter, MinigameRegistryEntry, MinigameStartArgs } from "../types";

export const G5_ID = "G5";

export function createG5Adapter(): MinigameAdapter {
  let args: MinigameStartArgs | null = null;
  let game: Game | null = null;
  let host: HTMLElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let rafId: number | null = null;
  let lastFrameTs: number | null = null;
  let completed = false;
  let failFired = false;
  let disposed = false;

  function frame(ts: number): void {
    if (disposed || !game || !ctx || !canvas) return;

    const delta = lastFrameTs === null ? 0 : ts - lastFrameTs;
    lastFrameTs = ts;

    game.step(delta);
    drawFrame(ctx, game.state, canvas.width, canvas.height);
    
    // Call onFail after 1 second in FAILED state
    if (game.state.phase === "FAILED" && game.state.phaseMs >= 1000 && !failFired) {
      failFired = true;
      args?.onFail();
    }

    rafId = requestAnimationFrame(frame);
  }

  function resize(): void {
    if (disposed || !canvas || !host) return;
    const rect = host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }

  const adapter: MinigameAdapter = {
    startMinigame(startArgs: MinigameStartArgs): void {
      if (disposed) return;
      args = startArgs;
      host = startArgs.container ?? null;

      if (!host) {
        console.error("[G5] No container provided");
        return;
      }

      // Create canvas
      canvas = document.createElement("canvas");
      canvas.style.display = "block";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      host.appendChild(canvas);

      ctx = canvas.getContext("2d");
      if (!ctx) {
        console.error("[G5] Could not get canvas context");
        return;
      }

      resize();
      window.addEventListener("resize", resize);

      // Create game
      game = createGame({
        seed: hashSeed(startArgs.runId),
        onComplete: () => {
          if (!completed && args?.onComplete) {
            completed = true;
            args.onComplete();
          }
        },
        onLabels: (labels) => {
          args?.setControlLabels?.(labels);
        },
      });

      // Set initial labels
      args?.setControlLabels?.({ left: "RED", right: "BLUE" });

      // Start render loop
      rafId = requestAnimationFrame(frame);
    },

    handleInput(button: Button): void {
      if (disposed || !game) return;
      game.press(button);
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;

      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      window.removeEventListener("resize", resize);

      if (game) {
        game.dispose();
        game = null;
      }

      if (canvas && host) {
        host.removeChild(canvas);
        canvas = null;
      }

      host = null;
      ctx = null;
      args = null;
    },
  };

  return adapter;
}

export const g5Entry: MinigameRegistryEntry = {
  id: G5_ID,
  name: "Circuit Sync",
  ready: true,
  inputCount: 2,
  adapter: createG5Adapter,
};

// Auto-register
register(g5Entry);
