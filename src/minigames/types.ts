/**
 * Shared types for the minigame adapter contract.
 *
 * These types define the interface between the main game controller and individual minigames.
 * Minigames must not know their stage; rewards are awarded by the controller based on stage,
 * not by the game. A game must not hard-code a story reveal, PIN digit, or stage ID.
 *
 * @see docs/TECH_SPEC.md §6 for the full contract specification.
 */

/** The only two hardware buttons available. No third input is ever allowed. */
export type Button = "LEFT" | "RIGHT";

/** Labels describing what each button currently does. */
export interface ControlLabels {
  left: string;
  right: string;
}

/**
 * Arguments passed to a minigame when it starts.
 *
 * The controller binds these to a specific run/stage/game triple. The minigame
 * must not modify them or derive rewards from them.
 */
export interface MinigameStartArgs {
  /** Minigame identifier: "G1"–"G7" */
  gameId: string;
  /** Narrative stage: "C1"–"C4", assigned by controller. DO NOT use for rewards. */
  stageId: string;
  /** Unique identifier for this playthrough; used to reject stale callbacks. */
  runId: string;
  /** Update the displayed control labels when game phase changes. */
  setControlLabels: (labels: ControlLabels) => void;
  /** Fire exactly once on successful completion; controller validates run/stage/game. */
  onComplete: () => void;
  /**
   * Fire when the player fails (out of lives, game over, etc.).
   * The controller will restart the current game from scratch.
   * Games should call this after showing a brief failure state, not immediately.
   */
  onFail: () => void;
  /** Optional mount point for the game canvas; defaults to #minigame-root. */
  container?: HTMLElement;
}

/**
 * The adapter interface that every minigame must implement.
 *
 * The controller:
 * 1. Creates an adapter via the factory in the registry entry
 * 2. Calls startMinigame() to mount and begin the game
 * 3. Routes button presses via handleInput()
 * 4. Calls dispose() when leaving the scene
 *
 * The adapter:
 * 1. Sets control labels immediately and whenever they change
 * 2. Calls onComplete exactly once when the player wins (not on retry)
 * 3. Cleans up all resources (timers, listeners, DOM) on dispose()
 */
export interface MinigameAdapter {
  /**
   * Mount the game UI and start the game loop.
   * May be called multiple times on one adapter (replaces previous scene).
   */
  startMinigame(args: MinigameStartArgs): void;

  /**
   * Handle a button press. Only "LEFT" or "RIGHT" are valid.
   * Ignored if the game has completed or been disposed.
   */
  handleInput(button: Button): void;

  /**
   * Clean up all resources: cancel animation frames, remove event listeners,
   * clear timers, remove DOM elements. Safe to call multiple times.
   */
  dispose(): void;
}

/**
 * Factory function that creates a fresh adapter instance.
 * Called once per game start; the adapter holds all mutable state in its closure.
 */
export type MinigameAdapterFactory = () => MinigameAdapter;

/**
 * Registry entry for a minigame in the selection pool.
 *
 * The controller uses these entries to:
 * 1. Filter by readiness (only ready games are eligible)
 * 2. Partition by inputCount (C1 must use a one-button game)
 * 3. Instantiate the adapter when the game is selected
 */
export interface MinigameRegistryEntry {
  /** Unique identifier: "G1"–"G7" for regular games, "E1"/"E2" for ending games. */
  id: string;
  /** Human-readable name for display. */
  name: string;
  /** Whether this game is ready to be selected. */
  ready: boolean;
  /**
   * Number of buttons this game uses.
   * - 1: One-button game; the unused button must be displayed as inactive.
   * - 2: Two-button game; both buttons have active functions.
   *
   * C1 (the opening level) MUST be a one-button game.
   * This field is declared at registration, not discovered at runtime.
   */
  inputCount: 1 | 2;
  /**
   * Whether this game is in the random selection pool for C1-C4.
   * - true (default): Game can be randomly selected for stages.
   * - false: Game is special (E1/E2 ending games) and not in the pool.
   */
  pool?: boolean;
  /** Factory that creates a fresh adapter instance. */
  adapter: MinigameAdapterFactory;
}

/**
 * Metadata for a game without the adapter factory.
 * Used by the controller for display and selection logic.
 */
export type MinigameInfo = Omit<MinigameRegistryEntry, "adapter">;
