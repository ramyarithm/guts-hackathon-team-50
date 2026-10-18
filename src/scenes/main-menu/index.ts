// Main menu scene: the first thing the player sees. Mounts on the phone screen like every
// other scene, shows the title and a Start button over the bunker background, and hands
// presses to the pure logic in ./logic (LEFT = music toggle, RIGHT = start). The
// controller owns the music (audio.playMusic("menu") as soon as the menu opens) and the
// run start; this scene only reports the audio output state to the logic and calls
// onStart exactly once.

import { GAME_TITLE, createMenu, type AudioOutputState, type Menu } from "./logic";
import type { Button, ControlLabels } from "../../minigames/types";

export { GAME_TITLE, createMenu, labelsFor } from "./logic";
export type { AudioOutputState, Menu, MenuState, PressResult } from "./logic";

/** How often the menu re-reads the audio output state (ms). */
const AUDIO_POLL_MS = 100;

export interface MainMenuStartArgs {
  /** Mount point; defaults to #minigame-root like the minigames. */
  container?: HTMLElement;
  setControlLabels: (labels: ControlLabels) => void;
  /** Fires exactly once, when the player starts a run. */
  onStart: () => void;
  /** The current global music setting, shown on the LEFT label. */
  musicEnabled: boolean;
  /** The player toggled the music (LEFT). */
  onToggleMusic: (enabled: boolean) => void;
  /** The audio engine's output state, polled while the menu is open. */
  getAudioState: () => AudioOutputState;
  /** A click or tap on the on-screen Start button. The controller routes it like a RIGHT press. */
  onPointerStart: () => void;
  /** A click or tap on the small Credits link in the corner. Omit it to hide the link. */
  onCredits?: () => void;
}

export interface MainMenuScene {
  start(args: MainMenuStartArgs): void;
  /** LEFT toggles the music; RIGHT starts the run. */
  handleInput(button: Button): void;
  /** Remove the DOM, listeners and timers. Safe to call more than once. */
  dispose(): void;
}

export function createMainMenuScene(): MainMenuScene {
  let args: MainMenuStartArgs | null = null;
  let menu: Menu | null = null;
  let root: HTMLElement | null = null;
  let startButton: HTMLButtonElement | null = null;
  let musicLine: HTMLElement | null = null;
  let creditsLink: HTMLButtonElement | null = null;
  let pollId: number | null = null;
  let onClick: (() => void) | null = null;
  let onCreditsClick: (() => void) | null = null;
  let disposed = false;

  const reflect = (): void => {
    if (!menu || !root || !startButton || !musicLine) return;
    startButton.disabled = menu.state.started;
    musicLine.textContent = `MUSIC: ${menu.state.musicEnabled ? "ON" : "OFF"}`;
  };

  const poll = (): void => {
    if (disposed || !menu || !args) return;
    menu.setAudioState(args.getAudioState());
  };

  const teardown = (): void => {
    if (pollId !== null) {
      clearInterval(pollId);
      pollId = null;
    }
    if (startButton && onClick) startButton.removeEventListener("click", onClick);
    onClick = null;
    if (creditsLink && onCreditsClick) creditsLink.removeEventListener("click", onCreditsClick);
    onCreditsClick = null;
    creditsLink = null;
    menu?.dispose();
    menu = null;
    root?.remove();
    root = null;
    startButton = null;
    musicLine = null;
  };

  const scene: MainMenuScene = {
    start(startArgs: MainMenuStartArgs): void {
      if (disposed) return;
      teardown();
      args = startArgs;
      const host = startArgs.container ?? document.getElementById("minigame-root") ?? document.body;

      root = document.createElement("div");
      root.className = "main-menu";
      root.setAttribute("role", "group");
      root.setAttribute("aria-label", "Main menu");
      root.innerHTML = `
        <div class="main-menu__eyebrow">GOV. TELECOM &middot; BUNKER TERMINAL</div>
        <h2 class="main-menu__title"></h2>
        <div class="main-menu__sub">Underground comms maintenance</div>
        <button class="main-menu__start" type="button">START</button>
        <div class="main-menu__music"></div>
        <button class="main-menu__credits" type="button">Credits</button>
      `;
      root.querySelector(".main-menu__title")!.textContent = GAME_TITLE.toUpperCase();
      startButton = root.querySelector<HTMLButtonElement>(".main-menu__start");
      musicLine = root.querySelector<HTMLElement>(".main-menu__music");
      creditsLink = root.querySelector<HTMLButtonElement>(".main-menu__credits");
      if (startArgs.onCredits) {
        // Click or tap only: LEFT and RIGHT keep their meaning (music toggle, start).
        onCreditsClick = () => {
          if (!disposed && menu && !menu.state.started) args?.onCredits?.();
        };
        creditsLink?.addEventListener("click", onCreditsClick);
      } else {
        creditsLink?.remove();
        creditsLink = null;
      }
      host.appendChild(root);

      menu = createMenu({
        musicEnabled: startArgs.musicEnabled,
        onLabels: (labels) => {
          if (!disposed) args?.setControlLabels(labels);
        },
        onToggleMusic: (enabled) => {
          if (!disposed) args?.onToggleMusic(enabled);
        },
        onStart: () => {
          if (!disposed) args?.onStart();
        },
      });

      // Pointer input already exists for LEFT/RIGHT (the on-screen control buttons), so a
      // click on the big Start button is routed through the controller as a RIGHT press.
      onClick = () => {
        if (!disposed && menu && !menu.state.started) args?.onPointerStart();
      };
      startButton?.addEventListener("click", onClick);

      poll();
      reflect();
      pollId = window.setInterval(poll, AUDIO_POLL_MS);
    },

    handleInput(button: Button): void {
      if (disposed || !menu) return;
      if (button !== "LEFT" && button !== "RIGHT") return;
      // Read the audio state right now: this press may be the gesture that unlocks it.
      poll();
      menu.press(button);
      reflect();
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      teardown();
      args = null;
    },
  };

  return scene;
}
