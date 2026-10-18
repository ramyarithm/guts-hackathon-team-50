// Tests for the main menu logic (no DOM). Run from the repo root with the Vitest installed
// in chicken-cross/:
//   ./chicken-cross/node_modules/.bin/vitest run src/scenes/main-menu
import { describe, expect, it } from "vitest";
import { GAME_TITLE, createMenu, labelsFor, type ControlLabels } from "./logic";

function harness(musicEnabled = true) {
  let starts = 0;
  const toggles: boolean[] = [];
  const labels: ControlLabels[] = [];
  const menu = createMenu({
    musicEnabled,
    onStart: () => starts++,
    onToggleMusic: (on) => toggles.push(on),
    onLabels: (l) => labels.push(l),
  });
  return { menu, starts: () => starts, toggles, labels };
}

describe("main menu", () => {
  it("has a title and labels LEFT as the music toggle and RIGHT as Start", () => {
    expect(GAME_TITLE.length).toBeGreaterThan(0);
    expect(labelsFor({ musicEnabled: true, started: false })).toEqual({ left: "Music: On", right: "Start" });
    expect(labelsFor({ musicEnabled: false, started: false })).toEqual({ left: "Music: Off", right: "Start" });
    const { menu, labels } = harness();
    expect(labels.at(-1)).toEqual({ left: "Music: On", right: "Start" });
    expect(menu.state.musicEnabled).toBe(true);
  });

  it("LEFT toggles the music off and on again, updating the label each time", () => {
    const { menu, toggles, labels, starts } = harness();
    menu.setAudioState("running");
    expect(menu.press("LEFT")).toBe("music-off");
    expect(labels.at(-1)).toEqual({ left: "Music: Off", right: "Start" });
    expect(menu.press("LEFT")).toBe("music-on");
    expect(labels.at(-1)).toEqual({ left: "Music: On", right: "Start" });
    expect(toggles).toEqual([false, true]);
    expect(starts()).toBe(0);
  });

  it("RIGHT starts exactly one run, even with a double press", () => {
    const { menu, starts, labels } = harness();
    expect(menu.press("RIGHT")).toBe("start");
    expect(menu.press("RIGHT")).toBe("ignored");
    expect(menu.press("LEFT")).toBe("ignored");
    expect(starts()).toBe(1);
    expect(menu.state.started).toBe(true);
    expect(labels.at(-1)).toEqual({ left: "—", right: "—" });
  });

  it("with autoplay blocked, the first RIGHT press starts the game and is not swallowed", () => {
    const { menu, starts } = harness();
    menu.setAudioState("suspended");
    expect(menu.press("RIGHT")).toBe("start");
    expect(starts()).toBe(1);
  });

  it("with autoplay blocked, the first LEFT press turns the music on rather than off", () => {
    const { menu, toggles, labels } = harness(true);
    menu.setAudioState("suspended");
    expect(menu.press("LEFT")).toBe("music-on");
    expect(labels.at(-1)).toEqual({ left: "Music: On", right: "Start" });
    expect(toggles).toEqual([true]);
    // Once the context runs, LEFT toggles normally.
    menu.setAudioState("running");
    expect(menu.press("LEFT")).toBe("music-off");
    expect(toggles).toEqual([true, false]);
  });

  it("with autoplay blocked and music saved as off, the first LEFT press turns it on", () => {
    const { menu, toggles, labels } = harness(false);
    expect(labels.at(-1)).toEqual({ left: "Music: Off", right: "Start" });
    menu.setAudioState("suspended");
    expect(menu.press("LEFT")).toBe("music-on");
    expect(labels.at(-1)).toEqual({ left: "Music: On", right: "Start" });
    expect(toggles).toEqual([true]);
  });

  it("without audio the toggle still flips the setting", () => {
    const { menu, toggles } = harness(true);
    menu.setAudioState("unavailable");
    expect(menu.press("LEFT")).toBe("music-off");
    expect(toggles).toEqual([false]);
  });

  it("dispose stops every callback", () => {
    const { menu, starts, toggles, labels } = harness();
    menu.dispose();
    const count = labels.length;
    expect(menu.press("LEFT")).toBe("ignored");
    expect(menu.press("RIGHT")).toBe("ignored");
    expect(starts()).toBe(0);
    expect(toggles).toEqual([]);
    expect(labels.length).toBe(count);
    expect(menu.disposed).toBe(true);
  });
});
