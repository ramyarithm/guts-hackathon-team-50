// Adapter for E2 (morse pad) - PIN entry via Morse code.

import { createGame, type Game } from "./logic";
import { drawFrame } from "./render";
import { register } from "../registry";
import type { Button, MinigameAdapter, MinigameRegistryEntry, MinigameStartArgs } from "../types";

export const E2_ID = "E2";

export function createE2Adapter(): MinigameAdapter {
  let args: MinigameStartArgs | null = null;
  let game: Game | null = null;
  let host: HTMLElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let rafId: number | null = null;
  let lastFrameTs: number | null = null;
  let completed = false;
  let disposed = false;

  function frame(ts: number): void {
    if (disposed || !game || !ctx || !canvas) return;

    const delta = lastFrameTs === null ? 0 : ts - lastFrameTs;
    lastFrameTs = ts;

    game.step(delta);
    drawFrame(ctx, game.state, canvas.width, canvas.height);

    rafId = requestAnimationFrame(frame);
  }

  function resize(): void {
    if (!canvas || !host) return;
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
        console.error("[E2] No container provided");
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
        console.error("[E2] Could not get canvas context");
        return;
      }

      resize();
      window.addEventListener("resize", resize);

      // Get PIN from args - E2 expects the PIN to be passed
      // For now, use a default if not provided (will be connected to main.ts later)
      const targetPin = (startArgs as any).targetPin ?? ['7', '3', '1', '9'];

      // Create game
      game = createGame(targetPin, {
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
      args?.setControlLabels?.({ left: '━ DASH', right: '▪ DOT' });

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

export const e2Entry: MinigameRegistryEntry = {
  id: E2_ID,
  name: "Morse Override",
  ready: true,
  inputCount: 2,
  pool: false, // Ending game, not in random selection pool
  adapter: createE2Adapter,
};

// Auto-register
register(e2Entry);

export { MORSE_CODES, SYMBOLS_PER_DIGIT, PIN_LENGTH } from "./logic";
