import { register } from "../registry";
import type { Button, MinigameAdapter, MinigameRegistryEntry, MinigameStartArgs } from "../types";
import { createGame, WORLD_WIDTH, WORLD_HEIGHT, type Game } from "./logic";
import { drawFrame } from "./render";

export const G8_ID = "G8";
export function createG8Adapter(): MinigameAdapter {
  let game: Game | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let host: HTMLElement | null = null;
  let raf: number | null = null;
  let observer: ResizeObserver | null = null;
  let removeResize: (() => void) | null = null;
  let previous = 0;
  let mounted = false;
  let completionFired = false;
  let generation = 0;
  const cleanup = () => {
    mounted = false;
    generation++;
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    observer?.disconnect(); observer = null;
    removeResize?.(); removeResize = null;
    game?.dispose(); game = null;
    canvas?.remove(); canvas = null; ctx = null; host = null;
  };
  const resize = () => {
    if (!canvas || !host) return;
    const fit = Math.min((host.clientWidth || WORLD_WIDTH) / WORLD_WIDTH,
      (host.clientHeight || WORLD_HEIGHT) / WORLD_HEIGHT);
    canvas.width = WORLD_WIDTH; canvas.height = WORLD_HEIGHT;
    canvas.style.width = `${Math.max(1, Math.floor(WORLD_WIDTH * fit))}px`;
    canvas.style.height = `${Math.max(1, Math.floor(WORLD_HEIGHT * fit))}px`;
    canvas.style.imageRendering = "pixelated";
  };
  const draw = () => {
    if (!game || !canvas || !ctx) return;
    drawFrame(ctx, game.state, canvas.width, canvas.height);
    const state = game.state;
    canvas.setAttribute("aria-label", `Shelf Shuffle. ${state.phase}. Current item: ${state.current ?? "none"}. Left shelf: ${state.shelves[0].join(", ") || "empty"}. Right shelf: ${state.shelves[1].join(", ") || "empty"}. ${state.matches} of 8 matches. ${Math.ceil(state.remainingMs / 1000)} seconds. ${state.failure ?? ""}`);
  };
  const advance = (now: number) => {
    const elapsed = Math.max(0, now - previous);
    previous = now;
    game?.step(elapsed); // No timer clamping: a hidden tab still consumes real playing time.
  };
  return {
    startMinigame(args: MinigameStartArgs) {
      cleanup();
      completionFired = false;
      args.setControlLabels({ left: "Left shelf", right: "Right shelf" });
      host = args.container ?? document.getElementById("minigame-root");
      if (!host) throw new Error("Shelf Shuffle needs a minigame container");
      canvas = document.createElement("canvas");
      canvas.dataset.minigame = G8_ID;
      canvas.setAttribute("role", "img");
      canvas.style.display = "block"; canvas.style.margin = "auto";
      host.appendChild(canvas);
      ctx = canvas.getContext("2d");
      if (!ctx) { cleanup(); throw new Error("Shelf Shuffle needs a 2D canvas context"); }
      mounted = true;
      game = createGame({ runId: args.runId,
        onLabels: labels => { if (mounted) args.setControlLabels(labels); },
        onComplete: () => {
          if (!mounted || completionFired) return;
          completionFired = true;
          args.onComplete();
        },
      });
      previous = performance.now();
      resize(); draw();
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => { resize(); draw(); });
        observer.observe(host);
      } else {
        const handler = () => { resize(); draw(); };
        window.addEventListener("resize", handler);
        removeResize = () => window.removeEventListener("resize", handler);
      }
      const session = generation;
      const frame = (now: number) => {
        raf = null;
        if (!mounted || session !== generation) return;
        advance(now);
        if (!mounted || session !== generation) return;
        draw();
        if (!completionFired) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    },
    handleInput(button: Button) {
      if (!mounted || completionFired || (button !== "LEFT" && button !== "RIGHT")) return;
      const wasPlaying = game?.state.phase === "PLAYING";
      advance(performance.now()); // Prevent placement after the deadline between animation frames.
      if (wasPlaying && game?.state.phase === "FAILED") { draw(); return; }
      if (!mounted || completionFired) return;
      game?.press(button);
      draw();
    },
    dispose: cleanup,
  };
}
export const g8Entry: MinigameRegistryEntry = {
  id: G8_ID, name: "Shelf Shuffle", ready: true, inputCount: 2, adapter: createG8Adapter,
};
register(g8Entry);
