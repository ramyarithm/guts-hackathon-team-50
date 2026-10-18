// The dialogue system: a visual-novel box on the phone screen (blocking, two buttons) and
// non-blocking tunnel subtitles. The controller decides when each section plays; this
// module only renders and drives lines. Text is always set with textContent.

import raw from "../../assets/Dialogue/dialogue.json";
import type { Button, ControlLabels } from "../minigames/types";
import { createPlayer, type DialogueItem, type Player } from "./player";
import { loadScript, tunnelLine, type DialogueScript, type Speaker } from "./script";
import { createSubtitleQueue, type SubtitleQueue } from "./subtitles";

export { itemsForIntro, itemsForSection, itemsForStageCompletion, itemsForStageStory } from "./flow";
export { TUNNEL_TRIGGERS, getSection, loadScript, tunnelLine } from "./script";
export type { DialogueScript, Line, Speaker, TunnelTrigger } from "./script";
export type { DialogueItem } from "./player";
export { SUBTITLE_HOLD_MS } from "./subtitles";

/** The script, loaded once from assets/Dialogue/dialogue.json. */
export const script: DialogueScript = loadScript(raw);

/** Name plates per speaker; SYSTEM has none (centred narration). */
const PLATES: Record<Speaker, string> = {
  ENGINEER: "ENGINEER",
  SUPERVISOR: "CONTROL — INTERCOM",
  COLLEAGUE_RECORDING: "ARCHIVED RECORDING",
  SYSTEM: "",
};

// ---- Blocking dialogue scene ------------------------------------------------------------

export interface DialogueSceneArgs {
  container: HTMLElement;
  items: readonly DialogueItem[];
  setControlLabels: (labels: ControlLabels) => void;
  /** The last item's Continue. Fires once. */
  onDone: () => void;
}

export interface DialogueScene {
  start(args: DialogueSceneArgs): void;
  handleInput(button: Button): void;
  dispose(): void;
}

export function createDialogueScene(): DialogueScene {
  let player: Player | null = null;
  let root: HTMLElement | null = null;
  let rafId: number | null = null;
  let lastTs: number | null = null;
  let disposed = false;
  /**
   * The chat log. One bubble per item up to the current one; earlier bubbles stay on
   * screen (dimmed) so both voices read together, like a phone conversation.
   */
  let log: HTMLElement | null = null;
  interface Bubble {
    el: HTMLElement;
    text: HTMLElement | null;
    indicator: HTMLElement | null;
    shown: string;
    typing: boolean;
  }
  const bubbles: Bubble[] = [];

  const build = (host: HTMLElement): void => {
    root = document.createElement("div");
    root.className = "vn vn--chat";
    log = document.createElement("div");
    log.className = "vn__log";
    root.appendChild(log);
    host.appendChild(root);
  };

  const makeLineBubble = (speaker: Speaker): Bubble => {
    const box = document.createElement("div");
    box.className = "vn__box vn__box--enter";
    box.dataset.speaker = speaker;
    const plate = document.createElement("div");
    plate.className = "vn__plate";
    plate.textContent = PLATES[speaker];
    plate.hidden = speaker === "SYSTEM";
    const text = document.createElement("p");
    text.className = "vn__text";
    const indicator = document.createElement("span");
    indicator.className = "vn__indicator";
    indicator.textContent = "▶";
    indicator.hidden = true;
    box.append(plate, text, indicator);
    return { el: box, text, indicator, shown: "", typing: true };
  };

  const makeDigitCard = (item: Extract<DialogueItem, { kind: "digit" }>): Bubble => {
    const card = document.createElement("div");
    card.className = "vn__card vn__box--enter";
    const title = document.createElement("div");
    title.className = "vn__card-title";
    title.textContent = "DIGIT RECOVERED";
    const position = document.createElement("div");
    position.className = "vn__card-position";
    position.textContent = `Position ${item.position}`;
    const digit = document.createElement("div");
    digit.className = "vn__card-digit";
    digit.textContent = item.digit;
    const slots = document.createElement("div");
    slots.className = "vn__card-slots";
    slots.replaceChildren(
      ...item.slots.map((d, i) => {
        const s = document.createElement("span");
        s.className = "vn__slot" + (i === item.position - 1 ? " vn__slot--new" : "") + (d === "?" ? " vn__slot--empty" : "");
        s.textContent = d;
        return s;
      }),
    );
    card.append(title, position, digit, slots);
    return { el: card, text: null, indicator: null, shown: "", typing: false };
  };

  const scrollToEnd = (): void => {
    if (root) root.scrollTop = root.scrollHeight;
  };

  const render = (): void => {
    if (!player || !root || !log) return;
    const index = player.state.index;
    const items = player.items;
    if (!items[index]) return;

    // Back removed items: drop their bubbles.
    let changed = false;
    while (bubbles.length > index + 1) {
      bubbles.pop()?.el.remove();
      changed = true;
    }
    // New items: append bubbles for everything up to the current one.
    while (bubbles.length <= index) {
      const i = bubbles.length;
      const item = items[i];
      const bubble = item.kind === "digit" ? makeDigitCard(item) : makeLineBubble(item.speaker);
      // Everything before the current item shows in full.
      if (i < index && item.kind === "line" && bubble.text) {
        bubble.text.textContent = item.text;
        bubble.shown = item.text;
        bubble.typing = false;
        bubble.el.classList.remove("vn__box--enter");
      }
      bubbles.push(bubble);
      log.appendChild(bubble.el);
      changed = true;
    }
    // Earlier bubbles sit back; the current one is live.
    bubbles.forEach((b, i) => b.el.classList.toggle("vn__box--past", i < index));

    // Drive the current bubble's typewriter.
    const current = bubbles[index];
    if (current.text && current.indicator) {
      const text = player.visibleText();
      if (current.shown !== text) {
        current.text.textContent = text;
        current.shown = text;
        changed = true;
      }
      const typing = player.state.typing;
      if (current.typing !== typing) {
        current.indicator.hidden = typing;
        current.typing = typing;
      }
    }
    if (changed) scrollToEnd();
  };

  const frame = (ts: number): void => {
    if (disposed || !player) return;
    rafId = requestAnimationFrame(frame);
    const dt = lastTs === null ? 0 : ts - lastTs;
    lastTs = ts;
    player.tick(Math.min(dt, 250));
    render();
  };

  const teardown = (): void => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    lastTs = null;
    player?.dispose();
    player = null;
    root?.remove();
    root = null;
    log = null;
    bubbles.length = 0;
  };

  return {
    start(args: DialogueSceneArgs): void {
      if (disposed) return;
      teardown();
      build(args.container);
      player = createPlayer(args.items, {
        onLabels: (labels) => {
          if (!disposed) args.setControlLabels(labels);
        },
        onDone: () => {
          if (!disposed) args.onDone();
        },
      });
      render();
      rafId = requestAnimationFrame(frame);
    },
    handleInput(button: Button): void {
      if (disposed || !player) return;
      if (button !== "LEFT" && button !== "RIGHT") return;
      player.press(button);
      render();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      teardown();
    },
  };
}

// ---- Tunnel subtitles (non-blocking) ----------------------------------------------------

export interface TunnelSubtitles {
  /** Called by the boss fight's onEvent. Never consumes input or pauses anything. */
  fire(trigger: string): void;
  dispose(): void;
}

export function createTunnelSubtitles(host: HTMLElement = document.body): TunnelSubtitles {
  const queue: SubtitleQueue = createSubtitleQueue();
  const root = document.createElement("div");
  root.className = "vn-subtitle";
  root.hidden = true;
  const plate = document.createElement("span");
  plate.className = "vn-subtitle__plate";
  const text = document.createElement("span");
  text.className = "vn-subtitle__text";
  root.append(plate, text);
  host.appendChild(root);
  let shownId = "";
  let rafId: number | null = null;
  let lastTs: number | null = null;
  let disposed = false;

  const frame = (ts: number): void => {
    if (disposed) return;
    rafId = requestAnimationFrame(frame);
    const dt = lastTs === null ? 0 : ts - lastTs;
    lastTs = ts;
    queue.tick(Math.min(dt, 250));
    const line = queue.current();
    if (!line) {
      if (!root.hidden) root.hidden = true;
      shownId = "";
      return;
    }
    if (line.id !== shownId) {
      shownId = line.id;
      plate.textContent = PLATES[line.speaker];
      plate.hidden = line.speaker === "SYSTEM";
      text.textContent = line.text;
      root.dataset.speaker = line.speaker;
      root.hidden = false;
    }
  };
  rafId = requestAnimationFrame(frame);

  return {
    fire(trigger: string): void {
      if (disposed) return;
      queue.fire(trigger, tunnelLine(script, trigger));
    },
    dispose(): void {
      disposed = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      root.remove();
    },
  };
}
