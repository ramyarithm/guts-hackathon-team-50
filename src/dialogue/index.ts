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
  let rendered = { index: -1, text: "", typing: true };

  const el = {
    box: null as HTMLElement | null,
    plate: null as HTMLElement | null,
    text: null as HTMLElement | null,
    indicator: null as HTMLElement | null,
    card: null as HTMLElement | null,
    cardPosition: null as HTMLElement | null,
    cardDigit: null as HTMLElement | null,
    cardSlots: null as HTMLElement | null,
  };

  const build = (host: HTMLElement): void => {
    root = document.createElement("div");
    root.className = "vn";
    // Dialogue box.
    const box = document.createElement("div");
    box.className = "vn__box";
    const plate = document.createElement("div");
    plate.className = "vn__plate";
    const text = document.createElement("p");
    text.className = "vn__text";
    const indicator = document.createElement("span");
    indicator.className = "vn__indicator";
    indicator.textContent = "▶";
    box.append(plate, text, indicator);
    // Digit card.
    const card = document.createElement("div");
    card.className = "vn__card";
    const title = document.createElement("div");
    title.className = "vn__card-title";
    title.textContent = "DIGIT RECOVERED";
    const position = document.createElement("div");
    position.className = "vn__card-position";
    const digit = document.createElement("div");
    digit.className = "vn__card-digit";
    const slots = document.createElement("div");
    slots.className = "vn__card-slots";
    card.append(title, position, digit, slots);
    root.append(box, card);
    host.appendChild(root);
    Object.assign(el, { box, plate, text, indicator, card, cardPosition: position, cardDigit: digit, cardSlots: slots });
  };

  const render = (): void => {
    if (!player || !root || !el.box || !el.plate || !el.text || !el.indicator || !el.card) return;
    const item = player.current();
    const index = player.state.index;
    if (!item) return;
    if (item.kind === "digit") {
      el.box.hidden = true;
      el.card.hidden = false;
      if (rendered.index !== index) {
        el.cardPosition!.textContent = `Position ${item.position}`;
        el.cardDigit!.textContent = item.digit;
        el.cardSlots!.replaceChildren(
          ...item.slots.map((d, i) => {
            const s = document.createElement("span");
            s.className = "vn__slot" + (i === item.position - 1 ? " vn__slot--new" : "") + (d === "?" ? " vn__slot--empty" : "");
            s.textContent = d;
            return s;
          }),
        );
        rendered = { index, text: "", typing: false };
      }
      return;
    }
    el.card.hidden = true;
    el.box.hidden = false;
    if (rendered.index !== index) {
      el.plate.textContent = PLATES[item.speaker];
      el.plate.hidden = item.speaker === "SYSTEM";
      el.box.dataset.speaker = item.speaker;
      // Restart the SYSTEM fade-in for each narration line.
      el.box.classList.remove("vn__box--enter");
      void el.box.offsetWidth;
      el.box.classList.add("vn__box--enter");
    }
    const text = player.visibleText();
    if (rendered.text !== text || rendered.index !== index) el.text.textContent = text;
    const typing = player.state.typing;
    if (rendered.typing !== typing || rendered.index !== index) el.indicator.hidden = typing;
    rendered = { index, text, typing };
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
    rendered = { index: -1, text: "", typing: true };
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
