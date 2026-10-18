// Pure visual-novel player: a sequence of items (lines and the digit card), a typewriter
// with delivery pauses, and the two-button rules. No DOM.

import type { Button, ControlLabels } from "../minigames/types";
import type { Speaker } from "./script";

export type { Button, ControlLabels } from "../minigames/types";

export type DialogueItem =
  | { kind: "line"; id: string; speaker: Speaker; text: string }
  | { kind: "digit"; position: number; digit: string; slots: string[] };

// ---- Tuning (meta.delivery: "Pause briefly at ellipses") -------------------------------

/** Typewriter speed. */
export const CHARS_PER_SECOND = 45;
export const MS_PER_CHAR = 1000 / CHARS_PER_SECOND;
/** Extra hold after "…" or "..." */
export const ELLIPSIS_PAUSE_MS = 400;
/** Extra hold after a full stop, question or exclamation mark. */
export const FULL_STOP_PAUSE_MS = 180;
/** A second RIGHT press inside this window is ignored, so a double press never skips two lines. */
export const DOUBLE_PRESS_GUARD_MS = 160;

export interface PlayerState {
  index: number;
  /** Characters of the current line revealed so far. */
  shown: number;
  /** True while the current line is still being revealed (or holding its last pause). */
  typing: boolean;
  /** Remaining pause before the next character (or before the line counts as shown). */
  pauseMs: number;
  budgetMs: number;
  timeMs: number;
  lastRightMs: number;
  done: boolean;
}

export interface PlayerCallbacks {
  onLabels?: (labels: ControlLabels) => void;
  /** The last item's Continue. Fires once. */
  onDone?: () => void;
}

export interface Player {
  readonly state: PlayerState;
  readonly items: readonly DialogueItem[];
  current(): DialogueItem | null;
  visibleText(): string;
  tick(dtMs: number): void;
  press(button: Button): void;
  labels(): ControlLabels;
  dispose(): void;
}

/** The pause that follows the character at `index` of `text`. */
export function pauseAfter(text: string, index: number): number {
  const ch = text[index];
  if (ch === "…") return ELLIPSIS_PAUSE_MS;
  if (ch === ".") {
    if (text[index - 1] === "." && text[index - 2] === "." ) return ELLIPSIS_PAUSE_MS; // third dot of "..."
    if (text[index + 1] === ".") return 0; // inside "..."
    return FULL_STOP_PAUSE_MS;
  }
  if (ch === "?" || ch === "!") return FULL_STOP_PAUSE_MS;
  return 0;
}

export function createPlayer(items: readonly DialogueItem[], callbacks: PlayerCallbacks = {}): Player {
  const state: PlayerState = { index: 0, shown: 0, typing: false, pauseMs: 0, budgetMs: 0, timeMs: 0, lastRightMs: -Infinity, done: false };
  let disposed = false;
  let doneNotified = false;
  let lastLabels = "";

  const current = (): DialogueItem | null => items[state.index] ?? null;
  const textOf = (item: DialogueItem | null): string => (item && item.kind === "line" ? item.text : "");

  const labels = (): ControlLabels => {
    if (state.done) return { left: "—", right: "—" };
    if (state.typing) return { left: "Back", right: "Skip" };
    return { left: "Back", right: state.index >= items.length - 1 ? "Continue" : "Next" };
  };

  const publish = (): void => {
    if (disposed) return;
    const l = labels();
    const key = `${l.left}/${l.right}`;
    if (key !== lastLabels) {
      lastLabels = key;
      callbacks.onLabels?.(l);
    }
  };

  const beginItem = (index: number, revealAll: boolean): void => {
    state.index = index;
    const text = textOf(current());
    state.budgetMs = 0;
    state.pauseMs = 0;
    if (revealAll || text.length === 0) {
      state.shown = text.length;
      state.typing = false;
    } else {
      state.shown = 0;
      state.typing = true;
    }
  };

  const finish = (): void => {
    if (state.done) return;
    state.done = true;
    publish();
    if (!doneNotified) {
      doneNotified = true;
      callbacks.onDone?.();
    }
  };

  const player: Player = {
    get state() {
      return state;
    },
    get items() {
      return items;
    },
    current,
    visibleText: () => textOf(current()).slice(0, state.shown),
    labels,
    tick(dtMs: number): void {
      if (disposed || state.done || !state.typing) return;
      state.timeMs += dtMs;
      const text = textOf(current());
      let remaining = Math.max(0, dtMs);
      while (remaining > 0) {
        if (state.pauseMs > 0) {
          const used = Math.min(state.pauseMs, remaining);
          state.pauseMs -= used;
          remaining -= used;
          if (state.pauseMs > 0) break;
          if (state.shown >= text.length) {
            state.typing = false;
            break;
          }
          continue;
        }
        if (state.shown >= text.length) {
          state.typing = false;
          break;
        }
        state.budgetMs += remaining;
        remaining = 0;
        while (state.budgetMs >= MS_PER_CHAR && state.shown < text.length && state.pauseMs <= 0) {
          state.budgetMs -= MS_PER_CHAR;
          state.shown += 1;
          const pause = pauseAfter(text, state.shown - 1);
          if (pause > 0) {
            state.pauseMs = pause;
            const spill = state.budgetMs;
            state.budgetMs = 0;
            remaining = spill; // leftover time carries into the pause
          }
        }
        if (state.pauseMs <= 0 && state.shown >= text.length) state.typing = false;
      }
      publish();
    },
    press(button: Button): void {
      if (disposed || state.done) return;
      if (button === "LEFT") {
        if (state.index > 0) beginItem(state.index - 1, true);
        publish();
        return;
      }
      if (button !== "RIGHT") return;
      if (state.timeMs - state.lastRightMs < DOUBLE_PRESS_GUARD_MS) return;
      state.lastRightMs = state.timeMs;
      if (state.typing) {
        state.shown = textOf(current()).length;
        state.pauseMs = 0;
        state.typing = false;
        publish();
        return;
      }
      if (state.index >= items.length - 1) {
        finish();
        return;
      }
      beginItem(state.index + 1, false);
      publish();
    },
    dispose(): void {
      disposed = true;
    },
  };

  // The guard clock only advances in tick() while typing; make it count always.
  const rawTick = player.tick;
  player.tick = (dtMs: number): void => {
    if (!disposed && !state.typing) state.timeMs += Math.max(0, dtMs);
    rawTick(dtMs);
  };

  if (items.length === 0) {
    finish();
  } else {
    beginItem(0, false);
    publish();
  }
  return player;
}
