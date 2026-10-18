// Main menu: pure state, no DOM and no audio. The view (index.ts) feeds it the audio
// engine's output state and the button presses. LEFT toggles the music, RIGHT starts the
// run exactly once.

import type { Button, ControlLabels } from '../../minigames/types';

export type { Button, ControlLabels } from '../../minigames/types';

/** The game's title as it appears in index.html. */
export const GAME_TITLE = 'Please Hold';

export type AudioOutputState = 'running' | 'suspended' | 'unavailable';

export type PressResult = 'start' | 'music-on' | 'music-off' | 'ignored';

export interface MenuState {
  musicEnabled: boolean;
  audio: AudioOutputState;
  started: boolean;
}

export interface MenuCallbacks {
  /** Initial music setting (from the audio engine). Default on. */
  musicEnabled?: boolean;
  onStart?: () => void;
  onToggleMusic?: (enabled: boolean) => void;
  onLabels?: (labels: ControlLabels) => void;
}

export interface Menu {
  readonly state: MenuState;
  readonly disposed: boolean;
  /** Report the audio engine's output state (call whenever it may have changed). */
  setAudioState(audio: AudioOutputState): void;
  press(button: Button): PressResult;
  dispose(): void;
}

export function labelsFor(state: Pick<MenuState, 'musicEnabled' | 'started'>): ControlLabels {
  if (state.started) return { left: '—', right: '—' };
  return { left: state.musicEnabled ? 'Music: On' : 'Music: Off', right: 'Start' };
}

export function createMenu(callbacks: MenuCallbacks = {}): Menu {
  const state: MenuState = {
    musicEnabled: callbacks.musicEnabled ?? true,
    audio: 'unavailable',
    started: false,
  };
  let disposed = false;

  const publishLabels = (): void => {
    if (!disposed) callbacks.onLabels?.(labelsFor(state));
  };

  const setMusic = (enabled: boolean): PressResult => {
    state.musicEnabled = enabled;
    publishLabels();
    callbacks.onToggleMusic?.(enabled);
    return enabled ? 'music-on' : 'music-off';
  };

  const menu: Menu = {
    get state() {
      return state;
    },
    get disposed() {
      return disposed;
    },
    setAudioState(audio: AudioOutputState): void {
      if (disposed) return;
      state.audio = audio;
    },
    press(button: Button): PressResult {
      if (disposed || state.started) return 'ignored';
      if (button === 'RIGHT') {
        // Never swallowed: if audio was blocked, the controller's unlock() on this same
        // press gets sound going and the run's track takes over as normal.
        state.started = true;
        publishLabels();
        callbacks.onStart?.();
        return 'start';
      }
      // LEFT: while the browser still blocks audio, this press is the gesture that unlocks
      // it, so it turns the music on (and keeps it on) rather than toggling it off.
      if (state.audio === 'suspended') return setMusic(true);
      return setMusic(!state.musicEnabled);
    },
    dispose(): void {
      disposed = true;
    },
  };

  publishLabels();
  return menu;
}
