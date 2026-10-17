/**
 * Minigames Module
 *
 * Public API for the minigame system. Import from here, not from individual files.
 *
 * Usage:
 *   import { register, getReadyGames, createAdapter } from './minigames';
 *   import type { MinigameAdapter, MinigameRegistryEntry } from './minigames';
 *
 * To auto-register all games, import this module:
 *   import './minigames';
 */

// Types
export type {
  Button,
  ControlLabels,
  MinigameAdapter,
  MinigameAdapterFactory,
  MinigameInfo,
  MinigameRegistryEntry,
  MinigameStartArgs,
} from "./types";

// Registry functions
export {
  clearRegistry,
  createAdapter,
  getAllGames,
  getGame,
  getInputCount,
  getOneButtonGames,
  getReadyGames,
  getTwoButtonGames,
  register,
  unregister,
  validateReadiness,
} from "./registry";

// Import game modules for side-effect registration
// Each module calls register() when imported
import "./g1-signal-relay";
import "./g2-lane-crossing";
import "./g3-tetris";
import "./g4-rhythm";
import "./g6-pressure-valves"
// Re-export game entries for direct access if needed
export { g1Entry, G1_ID, createG1Adapter } from "./g1-signal-relay";
export { g2Entry, G2_ID, createG2Adapter } from "./g2-lane-crossing";
export { g3Entry, G3_ID, createG3Adapter } from "./g3-tetris";
export { g4Entry, G4_ID, createG4Adapter } from "./g4-rhythm";
export { g6Entry, G6_ID, createG6Adapter } from "./g6-pressure-valves";
