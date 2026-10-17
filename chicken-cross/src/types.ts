// Local copy of the STORY.md contract; replace with CORE's shared types when they exist.

export type Button = "LEFT" | "RIGHT";

export interface ControlLabels {
  left: string;
  right: string;
}

export interface MinigameStartArgs {
  gameId: string; // "G1"–"G7"
  stageId: string; // "C1"–"C4", assigned by controller
  runId: string;
  setControlLabels: (labels: ControlLabels) => void;
  onComplete: () => void;
  container?: HTMLElement; // optional mount point; default #minigame-root
}

export interface MinigameAdapter {
  startMinigame(args: MinigameStartArgs): void;
  handleInput(button: Button): void;
  dispose(): void;
}

export interface MinigameRegistryEntry {
  id: string;
  ready: boolean;
  adapter: () => MinigameAdapter;
}
