// Credits scene: mounts on the phone screen like every other scene. Title, "Made by Team
// 50", one row per person (a real link, so it is clickable and tappable) and a "Main
// menu" row, with a staggered fade-in that never delays the controls. Presses go to the
// pure logic in ./logic (LEFT = next, RIGHT = open the profile / main menu). Audio is the
// controller's: this scene never starts or stops music.

import type { Button, ControlLabels } from "../../minigames/types";
import { CREDITS, CREDITS_EVENT, CREDITS_OUTRO, CREDITS_SUBTITLE, CREDITS_TITLE, isAllowedUrl, type Person } from "./credits";
import { createCredits, type Credits } from "./logic";

export { CREDITS, CREDITS_EVENT, CREDITS_OUTRO, CREDITS_SUBTITLE, CREDITS_TITLE, isAllowedUrl } from "./credits";
export type { Person } from "./credits";
export { createCredits, labelsFor } from "./logic";
export type { Credits, CreditsState, PressResult } from "./logic";
export type { CreditsEntry } from "./flow";

export interface CreditsStartArgs {
  /** Mount point; defaults to #minigame-root like the minigames. */
  container?: HTMLElement;
  setControlLabels: (labels: ControlLabels) => void;
  /** Fires exactly once, when the player chooses Main menu. */
  onMainMenu: () => void;
  /** The team to list; defaults to CREDITS. */
  people?: readonly Person[];
}

export interface CreditsScene {
  start(args: CreditsStartArgs): void;
  /** LEFT moves the highlight; RIGHT opens the highlighted profile or leaves to the menu. */
  handleInput(button: Button): void;
  /** Remove the DOM, listeners and animations. Safe to call more than once. */
  dispose(): void;
}

/** Open a profile in a new tab so the game keeps running. Only LinkedIn URLs are allowed. */
export function openProfile(url: string): boolean {
  if (!isAllowedUrl(url)) return false;
  try {
    // With "noopener" most browsers return null even on success, so the result is not a
    // popup-blocked signal; the link rows remain as a fallback.
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}

export function createCreditsScene(): CreditsScene {
  let args: CreditsStartArgs | null = null;
  let credits: Credits | null = null;
  let root: HTMLElement | null = null;
  let rows: HTMLElement[] = [];
  let listeners: AbortController | null = null;
  let disposed = false;

  const reflect = (): void => {
    if (!credits) return;
    rows.forEach((row, i) => {
      const on = i === credits!.state.index && !credits!.state.done;
      row.classList.toggle("is-highlighted", on);
      if (on) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
    });
  };

  const teardown = (): void => {
    listeners?.abort();
    listeners = null;
    credits?.dispose();
    credits = null;
    root?.remove();
    root = null;
    rows = [];
  };

  const scene: CreditsScene = {
    start(startArgs: CreditsStartArgs): void {
      if (disposed) return;
      teardown();
      args = startArgs;
      const people = startArgs.people ?? CREDITS;
      const host = startArgs.container ?? document.getElementById("minigame-root") ?? document.body;
      listeners = new AbortController();
      const { signal } = listeners;

      root = document.createElement("div");
      root.className = "credits";
      root.setAttribute("role", "group");
      root.setAttribute("aria-label", "Credits");

      const eyebrow = document.createElement("div");
      eyebrow.className = "credits__eyebrow";
      eyebrow.textContent = "GOV. TELECOM · BUNKER TERMINAL";
      const title = document.createElement("h2");
      title.className = "credits__title";
      title.textContent = CREDITS_TITLE;
      const sub = document.createElement("div");
      sub.className = "credits__sub";
      sub.textContent = CREDITS_SUBTITLE;
      const list = document.createElement("ol");
      list.className = "credits__list";
      list.setAttribute("aria-label", "Team");

      people.forEach((person, i) => {
        const li = document.createElement("li");
        li.className = "credits__row";
        li.style.setProperty("--i", String(i));
        const a = document.createElement("a");
        a.className = "credits__person";
        if (isAllowedUrl(person.url)) {
          a.href = person.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
        }
        const name = document.createElement("span");
        name.className = "credits__name";
        name.textContent = person.name;
        const tag = document.createElement("span");
        tag.className = "credits__tag";
        tag.textContent = "LinkedIn ↗";
        tag.setAttribute("aria-label", `${person.name} on LinkedIn`);
        a.append(name, tag);
        // A click or tap follows the link itself; it also moves the highlight to that row.
        a.addEventListener("click", () => credits?.highlight(i), { signal });
        li.appendChild(a);
        list.appendChild(li);
        rows.push(li);
      });

      const menuLi = document.createElement("li");
      menuLi.className = "credits__row credits__row--menu";
      menuLi.style.setProperty("--i", String(people.length));
      const menuBtn = document.createElement("button");
      menuBtn.type = "button";
      menuBtn.className = "credits__menu";
      const menuLabel = document.createElement("span");
      menuLabel.className = "credits__name";
      menuLabel.textContent = "Main menu";
      menuBtn.appendChild(menuLabel);
      menuBtn.addEventListener("click", () => {
        if (!credits) return;
        credits.highlight(credits.state.menuIndex);
        credits.press("RIGHT");
        reflect();
      }, { signal });
      menuLi.appendChild(menuBtn);
      list.appendChild(menuLi);
      rows.push(menuLi);

      const outro = document.createElement("div");
      outro.className = "credits__outro";
      outro.textContent = CREDITS_OUTRO;
      const event = document.createElement("div");
      event.className = "credits__event";
      event.textContent = CREDITS_EVENT;
      const hint = document.createElement("div");
      hint.className = "credits__hint";
      hint.textContent = "LEFT next · RIGHT select";

      root.append(eyebrow, title, sub, list, outro, event, hint);
      host.appendChild(root);

      credits = createCredits({
        people,
        openUrl: openProfile,
        onMainMenu: () => {
          if (!disposed) args?.onMainMenu();
        },
        onLabels: (labels) => {
          if (!disposed) args?.setControlLabels(labels);
        },
      });
      reflect();
    },

    handleInput(button: Button): void {
      if (disposed || !credits) return;
      if (button !== "LEFT" && button !== "RIGHT") return;
      credits.press(button);
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
