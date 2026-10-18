/**
 * G4 Rhythm Game - Adapter
 *
 * One-button rhythm game where the player taps in time to music.
 * Uses LEFT button (or spacebar) only - RIGHT is inactive.
 *
 * Music: the controller plays G4's track through the shared audio engine (c1.mp3 with
 * drums once, then the no-drums loop) when G4 starts, and crossfades back to the stage
 * track when G4 completes. This adapter plays no audio itself; it only reads the engine's
 * beat clock each frame and on each press and feeds it to the pure logic, so the cues and
 * the hit judgement stay locked to the music. Without audio the logic's internal 130 BPM
 * clock takes over and the game plays identically.
 */

import {
  AUDIO_LATENCY_OFFSET_MS,
  MS_PER_BEAT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  createGame,
  type Game,
} from './logic';
import { drawFrame } from './render';
import { audio } from '../../audio';
import { register } from '../registry';
import type { Button, MinigameAdapter, MinigameRegistryEntry, MinigameStartArgs } from '../types';

export type { Button, MinigameAdapter, MinigameRegistryEntry, MinigameStartArgs } from '../types';
export { AUDIO_LATENCY_OFFSET_MS, BPM, MS_PER_BEAT } from './logic';

export const G4_ID = 'G4';

/** The music's current beat as the player hears it, or null when there is no music. */
function musicBeat(): number | null {
  const beat = audio.getBeatClock();
  return beat === null ? null : beat - AUDIO_LATENCY_OFFSET_MS / MS_PER_BEAT;
}

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
  let failFired = false;
  let disposed = false;

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

  const frame = (ts: number): void => {
    if (disposed || !game || !ctx || !canvas) return;

    const elapsed = lastFrameTs === null ? 0 : ts - lastFrameTs;
    lastFrameTs = ts;

    game.tick(elapsed, musicBeat());
    if (disposed || !game || !ctx || !canvas) return;

    // Update press flash
    const timeSincePress = ts - lastPressTime;
    pressFlash = Math.max(0, 1 - timeSincePress / 150);

    drawFrame(ctx, game.state, canvas.width, canvas.height, pressFlash);

    // Call onFail after 1 second in FAILED state
    if (game.state.phase === 'FAILED' && game.state.phaseMs >= 1000 && !failFired) {
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
      window.removeEventListener('resize', windowResizeHandler);
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

      host = startArgs.container ?? document.getElementById('minigame-root');
      if (!host) {
        console.warn('[G4] no container and no #minigame-root found; mounting on document.body');
        host = document.body;
      }

      canvas = document.createElement('canvas');
      canvas.dataset['minigame'] = G4_ID;
      canvas.style.display = 'block';
      canvas.style.margin = '0 auto';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'Rhythm game - tap to the beat');
      host.appendChild(canvas);

      const context = canvas.getContext('2d');
      if (!context) {
        console.error('[G4] 2D canvas context unavailable');
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
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => resize());
        resizeObserver.observe(host);
      } else {
        windowResizeHandler = () => resize();
        window.addEventListener('resize', windowResizeHandler);
      }

      rafId = requestAnimationFrame(frame);
    },

    handleInput(button: Button): void {
      if (disposed || completed || !game) return;

      // Only LEFT button works (one-button game)
      // RIGHT is ignored
      if (button === 'LEFT') {
        lastPressTime = performance.now();
        game.press(musicBeat());
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
  name: 'Rhythm Game',
  ready: true,
  inputCount: 1, // One-button game - only LEFT works
  adapter: createG4Adapter,
};

// Auto-register when this module is imported
register(g4Entry);
