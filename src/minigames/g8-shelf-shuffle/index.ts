import { register } from '../registry';
import type { Button, MinigameAdapter, MinigameRegistryEntry, MinigameStartArgs } from '../types';
import { createGame, WORLD_WIDTH, WORLD_HEIGHT, type Game } from './logic';
import { drawFrame } from './render';

export const G8_ID = 'G8';

// Failure hold period before calling onFail (ms)
const FAILURE_HOLD_MS = 1000;

export function createG8Adapter(): MinigameAdapter {
  let args: MinigameStartArgs | null = null;
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
  let failFired = false;
  let failedAt: number | null = null;
  let generation = 0;
  const cleanup = () => {
    mounted = false;
    generation++;
    failFired = false;
    failedAt = null;
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    observer?.disconnect();
    observer = null;
    removeResize?.();
    removeResize = null;
    game?.dispose();
    game = null;
    canvas?.remove();
    canvas = null;
    ctx = null;
    host = null;
    args = null;
  };
  const resize = () => {
    if (!canvas || !host) return;
    // Fill the phone screen like the other games; drawFrame letterboxes the 280x320 world
    // inside it with a uniform scale, so gameplay coordinates never change.
    const drawWidth = Math.max(1, Math.floor(host.clientWidth || WORLD_WIDTH));
    const drawHeight = Math.max(1, Math.floor(host.clientHeight || WORLD_HEIGHT));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.style.width = `${drawWidth}px`;
    canvas.style.height = `${drawHeight}px`;
    canvas.width = Math.round(drawWidth * dpr);
    canvas.height = Math.round(drawHeight * dpr);
  };
  const draw = () => {
    if (!game || !canvas || !ctx) return;
    drawFrame(ctx, game.state, canvas.width, canvas.height);
    const state = game.state;
    canvas.setAttribute(
      'aria-label',
      `Shelf Shuffle. ${state.phase}. Current item: ${state.current ?? 'none'}. Left shelf: ${state.shelves[0].join(', ') || 'empty'}. Right shelf: ${state.shelves[1].join(', ') || 'empty'}. ${state.matches} of 8 matches. ${Math.ceil(state.remainingMs / 1000)} seconds. ${state.failure ?? ''}`,
    );
  };
  const advance = (now: number) => {
    const elapsed = Math.max(0, now - previous);
    previous = now;
    game?.step(elapsed); // No timer clamping: a hidden tab still consumes real playing time.
  };
  return {
    startMinigame(startArgs: MinigameStartArgs) {
      cleanup();
      completionFired = false;
      args = startArgs;
      startArgs.setControlLabels({ left: 'Left shelf', right: 'Right shelf' });
      host = startArgs.container ?? document.getElementById('minigame-root');
      if (!host) throw new Error('Shelf Shuffle needs a minigame container');
      canvas = document.createElement('canvas');
      canvas.dataset.minigame = G8_ID;
      canvas.setAttribute('role', 'img');
      canvas.style.display = 'block';
      canvas.style.margin = 'auto';
      host.appendChild(canvas);
      ctx = canvas.getContext('2d');
      if (!ctx) {
        cleanup();
        throw new Error('Shelf Shuffle needs a 2D canvas context');
      }
      mounted = true;
      game = createGame({
        runId: startArgs.runId,
        onLabels: (labels) => {
          if (mounted) startArgs.setControlLabels(labels);
        },
        onComplete: () => {
          if (!mounted || completionFired) return;
          completionFired = true;
          startArgs.onComplete();
        },
      });
      previous = performance.now();
      resize();
      draw();
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => {
          resize();
          draw();
        });
        observer.observe(host);
      } else {
        const handler = () => {
          resize();
          draw();
        };
        window.addEventListener('resize', handler);
        removeResize = () => window.removeEventListener('resize', handler);
      }
      const session = generation;
      const frame = (now: number) => {
        raf = null;
        if (!mounted || session !== generation) return;
        advance(now);
        if (!mounted || session !== generation) return;
        draw();

        // Check for failure and call onFail after hold period
        if (game?.state.phase === 'FAILED' && !failFired) {
          if (failedAt === null) {
            failedAt = now;
          } else if (now - failedAt >= FAILURE_HOLD_MS) {
            failFired = true;
            args?.onFail();
            return;
          }
        }

        if (!completionFired && !failFired) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    },
    handleInput(button: Button) {
      if (!mounted || completionFired || (button !== 'LEFT' && button !== 'RIGHT')) return;
      const wasPlaying = game?.state.phase === 'PLAYING';
      advance(performance.now()); // Prevent placement after the deadline between animation frames.
      if (wasPlaying && game?.state.phase === 'FAILED') {
        draw();
        return;
      }
      if (!mounted || completionFired) return;
      game?.press(button);
      draw();
    },
    dispose: cleanup,
  };
}
export const g8Entry: MinigameRegistryEntry = {
  id: G8_ID,
  name: 'Shelf Shuffle',
  ready: true,
  inputCount: 2,
  adapter: createG8Adapter,
};
register(g8Entry);
