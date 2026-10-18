// Credits: pure navigation state, no DOM and no audio. LEFT moves the highlight through
// every person and then "Main menu", wrapping; RIGHT opens the highlighted person's
// LinkedIn profile (through the injected opener, guarded against double presses) or
// leaves to the main menu exactly once.

import type { Button, ControlLabels } from '../../minigames/types';
import { isAllowedUrl, type Person } from './credits';

export type { Button, ControlLabels } from '../../minigames/types';

/** A second RIGHT on the same person within this window opens nothing (double press). */
export const OPEN_GUARD_MS = 1000;

export type PressResult = 'next' | 'opened' | 'menu' | 'ignored';

export interface CreditsState {
  /** Highlighted row: 0..people.length-1 are people, menuIndex is "Main menu". */
  index: number;
  menuIndex: number;
  /** Set once Main menu has been chosen; every later press is ignored. */
  done: boolean;
}

export interface CreditsCallbacks {
  people: readonly Person[];
  /** Open a profile in a new tab. Returns false if it could not be opened. */
  openUrl: (url: string) => boolean;
  onMainMenu: () => void;
  onLabels?: (labels: ControlLabels) => void;
  /** Clock for the double-press guard (ms); defaults to Date.now. */
  now?: () => number;
}

export interface Credits {
  readonly state: CreditsState;
  readonly disposed: boolean;
  /** Jump the highlight to a row (a click or tap). Out-of-range indices are ignored. */
  highlight(index: number): void;
  press(button: Button): PressResult;
  dispose(): void;
}

export function labelsFor(state: CreditsState): ControlLabels {
  if (state.done) return { left: '—', right: '—' };
  return { left: 'Next', right: state.index === state.menuIndex ? 'Main menu' : 'Open LinkedIn' };
}

export function createCredits(callbacks: CreditsCallbacks): Credits {
  const people = callbacks.people;
  const now = callbacks.now ?? (() => Date.now());
  const state: CreditsState = { index: 0, menuIndex: people.length, done: false };
  let disposed = false;
  let lastOpen: { url: string; at: number } | null = null;

  const publishLabels = (): void => {
    if (!disposed) callbacks.onLabels?.(labelsFor(state));
  };

  const credits: Credits = {
    get state() {
      return state;
    },
    get disposed() {
      return disposed;
    },
    highlight(index: number): void {
      if (disposed || state.done) return;
      if (!Number.isInteger(index) || index < 0 || index > state.menuIndex) return;
      state.index = index;
      publishLabels();
    },
    press(button: Button): PressResult {
      if (disposed || state.done) return 'ignored';
      if (button === 'LEFT') {
        state.index = (state.index + 1) % (state.menuIndex + 1);
        publishLabels();
        return 'next';
      }
      if (button !== 'RIGHT') return 'ignored';
      if (state.index === state.menuIndex) {
        state.done = true;
        publishLabels();
        callbacks.onMainMenu();
        return 'menu';
      }
      const person = people[state.index];
      if (!person || !isAllowedUrl(person.url)) return 'ignored';
      const t = now();
      if (lastOpen && lastOpen.url === person.url && t - lastOpen.at < OPEN_GUARD_MS)
        return 'ignored';
      lastOpen = { url: person.url, at: t };
      return callbacks.openUrl(person.url) ? 'opened' : 'ignored';
    },
    dispose(): void {
      disposed = true;
    },
  };

  publishLabels();
  return credits;
}
