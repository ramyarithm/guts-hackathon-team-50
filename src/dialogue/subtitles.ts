// Tunnel subtitles: non-blocking, event-driven, shown once per trigger per tunnel attempt,
// queued when two fire close together, auto-hidden. Pure queue; the view renders it.

import type { Line } from "./script";

/** How long a subtitle stays up. */
export const SUBTITLE_HOLD_MS = 3500;

export interface SubtitleQueue {
  /** Queue the line for `trigger` unless that trigger already fired. Returns whether it was queued. */
  fire(trigger: string, line: Line | null): boolean;
  tick(dtMs: number): void;
  current(): Line | null;
}

export function createSubtitleQueue(holdMs = SUBTITLE_HOLD_MS): SubtitleQueue {
  const fired = new Set<string>();
  const queue: Line[] = [];
  let showing: Line | null = null;
  let shownMs = 0;

  const next = (): void => {
    showing = queue.shift() ?? null;
    shownMs = 0;
  };

  return {
    fire(trigger, line) {
      if (fired.has(trigger) || !line) return false;
      fired.add(trigger);
      queue.push(line);
      if (!showing) next();
      return true;
    },
    tick(dtMs) {
      if (!showing) return;
      shownMs += Math.max(0, dtMs);
      if (shownMs >= holdMs) next();
    },
    current: () => showing,
  };
}
