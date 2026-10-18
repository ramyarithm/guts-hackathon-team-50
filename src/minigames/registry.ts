/**
 * Minigame Registry
 *
 * Central registry of all minigames in the pool. The controller uses this to:
 * 1. Get the list of ready games for selection
 * 2. Partition games by inputCount (C1 requires a one-button game)
 * 3. Instantiate adapters when games are selected
 *
 * Games register themselves by importing this module and calling register().
 * The CORE controller imports getReadyGames() and createAdapter().
 *
 * @see docs/TECH_SPEC.md §3 for configuration requirements
 */

import type { MinigameAdapter, MinigameInfo, MinigameRegistryEntry } from './types';

/** Internal storage for all registered minigames. */
const registry: Map<string, MinigameRegistryEntry> = new Map();

/**
 * Register a minigame in the pool.
 * Called once per game at module load time.
 *
 * @throws If a game with the same ID is already registered.
 */
export function register(entry: MinigameRegistryEntry): void {
  if (registry.has(entry.id)) {
    throw new Error(`Minigame ${entry.id} is already registered`);
  }
  registry.set(entry.id, entry);
}

/**
 * Unregister a minigame (for testing only).
 */
export function unregister(id: string): void {
  registry.delete(id);
}

/**
 * Clear all registrations (for testing only).
 */
export function clearRegistry(): void {
  registry.clear();
}

/**
 * Get a list of all registered games (ready or not).
 */
export function getAllGames(): MinigameInfo[] {
  return Array.from(registry.values()).map(({ adapter: _, ...info }) => info);
}

/**
 * Get a list of all ready games for selection (only pool games).
 */
export function getReadyGames(): MinigameInfo[] {
  return getAllGames().filter((g) => g.ready && g.pool !== false);
}

/**
 * Get ready pool games that use exactly one button.
 * C1 (the opening level) must draw from this pool.
 */
export function getOneButtonGames(): MinigameInfo[] {
  return getReadyGames().filter((g) => g.inputCount === 1);
}

/**
 * Get ready pool games that use two buttons.
 */
export function getTwoButtonGames(): MinigameInfo[] {
  return getReadyGames().filter((g) => g.inputCount === 2);
}

/**
 * Check if the registry has enough games to start a run.
 * Returns an error message if not, or null if ready.
 */
export function validateReadiness(minGames = 4): string | null {
  const ready = getReadyGames();
  if (ready.length < minGames) {
    return `Need at least ${minGames} ready games, but only ${ready.length} are ready: ${ready.map((g) => g.id).join(', ') || '(none)'}`;
  }
  const oneButton = getOneButtonGames();
  if (oneButton.length === 0) {
    return `Need at least one ready one-button game for C1, but none are ready. Ready games: ${ready.map((g) => `${g.id}(${g.inputCount}btn)`).join(', ')}`;
  }
  return null;
}

/**
 * Get a game entry by ID.
 */
export function getGame(id: string): MinigameRegistryEntry | undefined {
  return registry.get(id);
}

/**
 * Create an adapter instance for a game by ID.
 *
 * @throws If the game is not registered.
 */
export function createAdapter(id: string): MinigameAdapter {
  const entry = registry.get(id);
  if (!entry) {
    throw new Error(`Minigame ${id} is not registered`);
  }
  return entry.adapter();
}

/**
 * Get the inputCount for a game by ID.
 *
 * @throws If the game is not registered.
 */
export function getInputCount(id: string): 1 | 2 {
  const entry = registry.get(id);
  if (!entry) {
    throw new Error(`Minigame ${id} is not registered`);
  }
  return entry.inputCount;
}
