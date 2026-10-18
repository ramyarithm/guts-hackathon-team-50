// Which lines play at which moment (meta.dialogue_flow). Pure: builds item lists from the
// script and values handed in by the controller. Digits always come from the controller.

import type { DialogueItem } from "./player";
import { getSection, type DialogueScript, type Line } from "./script";

export type StageId = "C1" | "C2" | "C3" | "C4";

const lineItems = (lines: readonly Line[]): DialogueItem[] =>
  lines.map((l) => ({ kind: "line", id: l.id, speaker: l.speaker, text: l.text }));

/** After pressing Start on the menu, before the first station. */
export function itemsForIntro(script: DialogueScript): DialogueItem[] {
  return lineItems(getSection(script, "intro"));
}

/** pin_entry (before the dial), pin_success (after the vault opens), ending (the surface). */
export function itemsForSection(script: DialogueScript, id: string): DialogueItem[] {
  return lineItems(getSection(script, id));
}

/**
 * After a minigame succeeds: the game's reaction (by game id; none if the game has no
 * entry), then the story for the completed stage (by completion order), then the digit
 * card with the digit the controller awarded.
 */
export function itemsForStageCompletion(
  script: DialogueScript,
  gameId: string,
  stage: StageId,
  position: number,
  digit: string,
  slots: readonly string[],
): DialogueItem[] {
  const reaction = script.reactions[gameId] ?? [];
  return [...lineItems(reaction), ...itemsForStageStory(script, stage, position, digit, slots)];
}

/** Revisiting a completed station: its story and digit card again, no reaction, no award. */
export function itemsForStageStory(
  script: DialogueScript,
  stage: StageId,
  position: number,
  digit: string,
  slots: readonly string[],
): DialogueItem[] {
  const story = getSection(script, `${stage.toLowerCase()}_complete`);
  return [...lineItems(story), { kind: "digit", position, digit, slots: [...slots] }];
}
