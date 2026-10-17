/**
 * G4 Rhythm Game - Adapter
 * 
 * One-button rhythm game where the player taps in time to music.
 * Uses LEFT button (or spacebar) only - RIGHT is inactive.
 * 
 * Audio files expected in /assets/audio/:
 * - rhythm-drums.mp3    (version with drums/beat audible)
 * - rhythm-beatless.mp3 (version without drums, just melody/bass)
 */

import { WORLD_HEIGHT, WORLD_WIDTH, createGame, type Game, type Phase } from "./logic";
import { drawFrame } from "./render";
import { register } from "../registry";
import type { Button, MinigameAdapter, MinigameRegistryEntry, MinigameStartArgs } from "../types";

export type { Button, MinigameAdapter, MinigameRegistryEntry, MinigameStartArgs } from "../types";
export { BPM, MS_PER_BEAT } from "./logic";

export const G4_ID = "G4";

// Audio file paths
const AUDIO_DRUMS = "/assets/audio/rhythm-drums.mp3";
const AUDIO_BEATLESS = "/assets/audio/rhythm-beatless.mp3";

export function createG4Adapter(): MinigameAdapter {
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
  let disposed = false;
  
  // Audio elements
  let audioDrums: HTMLAudioElement | null = null;
  let audioBeatless: HTMLAudioElement | null = null;
  let audioError = false;
  
  // Press flash for visual feedback
  let pressFlash = 0;
  let lastPressTime = 0;

  const resize = (): void => {
    if (!host || !canvas) return;
    const cssW = host.clientWidth || WORLD_WIDTH;
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

  const loadAudio = (): void => {
    // Create audio elements
    audioDrums = new Audio(AUDIO_DRUMS);
    audioBeatless = new Audio(AUDIO_BEATLESS);
    
    audioDrums.preload = "auto";
    audioBeatless.preload = "auto";
    
    // Track loading
    let loadCount = 0;
    const onLoad = () => {
      loadCount++;
      if (loadCount >= 2) {
        console.log("[G4] Audio loaded successfully");
      }
    };
    
    const onError = (e: Event) => {
      console.warn("[G4] Audio failed to load:", e);
      audioError = true;
      // Game will still work, just without audio
    };
    
    audioDrums.addEventListener("canplaythrough", onLoad, { once: true });
    audioBeatless.addEventListener("canplaythrough", onLoad, { once: true });
    audioDrums.addEventListener("error", onError, { once: true });
    audioBeatless.addEventListener("error", onError, { once: true });
    
    // Start loading
    audioDrums.load();
    audioBeatless.load();
  };

  const handlePhaseChange = (phase: Phase, _introDrums: boolean): void => {
    if (!audioDrums || !audioBeatless || audioError) return;
    
    try {
      if (phase === "INTRO") {
        // Start drums version
        audioBeatless.pause();
        audioBeatless.currentTime = 0;
        audioDrums.currentTime = 0;
        audioDrums.play().catch(e => console.warn("[G4] Audio play failed:", e));
      } else if (phase === "PLAYING") {
        // Switch to beatless version, synced
        const currentTime = audioDrums.currentTime;
        audioDrums.pause();
        audioBeatless.currentTime = currentTime;
        audioBeatless.play().catch(e => console.warn("[G4] Audio play failed:", e));
      } else if (phase === "SUCCESS" || phase === "FAILED" || phase === "READY") {
        // Stop all audio
        audioDrums.pause();
        audioBeatless.pause();
        audioDrums.currentTime = 0;
        audioBeatless.currentTime = 0;
      }
    } catch (e) {
      console.warn("[G4] Audio control error:", e);
    }
  };

  const frame = (ts: number): void => {
    if (disposed || !game || !ctx || !canvas) return;
    rafId = requestAnimationFrame(frame);
    
    const elapsed = lastFrameTs === null ? 0 : ts - lastFrameTs;
    lastFrameTs = ts;
    
    game.tick(elapsed);
    
    // Update press flash
    const timeSincePress = ts - lastPressTime;
    pressFlash = Math.max(0, 1 - timeSincePress / 150);
    
    drawFrame(ctx, game.state, canvas.width, canvas.height, pressFlash);
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
    
    // Stop and clean up audio
    if (audioDrums) {
      audioDrums.pause();
      audioDrums.src = "";
      audioDrums = null;
    }
    if (audioBeatless) {
      audioBeatless.pause();
      audioBeatless.src = "";
      audioBeatless = null;
    }
    audioError = false;
    
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

      host = startArgs.container ?? document.getElementById("minigame-root");
      if (!host) {
        console.warn("[G4] no container and no #minigame-root found; mounting on document.body");
        host = document.body;
      }

      canvas = document.createElement("canvas");
      canvas.dataset["minigame"] = G4_ID;
      canvas.style.display = "block";
      canvas.style.margin = "0 auto";
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", "Rhythm game - tap to the beat");
      host.appendChild(canvas);

      const context = canvas.getContext("2d");
      if (!context) {
        console.error("[G4] 2D canvas context unavailable");
        teardownScene();
        return;
      }
      ctx = context;

      // Load audio
      loadAudio();

      game = createGame({
        onLabels: (labels) => {
          if (!disposed) args?.setControlLabels(labels);
        },
        onComplete: () => {
          if (disposed || completed) return;
          completed = true;
          args?.onComplete();
        },
        onPhaseChange: handlePhaseChange,
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
      
      // Only LEFT button works (one-button game)
      // RIGHT is ignored
      if (button === "LEFT") {
        lastPressTime = performance.now();
        game.press();
      }
      // RIGHT does nothing - this is a one-button game
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

/** Registry entry for G4 Rhythm Game */
export const g4Entry: MinigameRegistryEntry = {
  id: G4_ID,
  name: "Rhythm Game",
  ready: true,
  inputCount: 1, // One-button game - only LEFT works
  adapter: createG4Adapter,
};

// Auto-register when this module is imported
register(g4Entry);
