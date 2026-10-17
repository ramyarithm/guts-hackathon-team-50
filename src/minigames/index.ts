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
import "./g5-circuit-sync";
import "./e1-vault-lock";
import "./e2-morse-pad";
import "./g6-pressure-valves";
import "./g7-coffee-run";
import "./g8-shelf-shuffle";

// Re-export game entries for direct access if needed
export { g1Entry, G1_ID, createG1Adapter } from "./g1-signal-relay";
export { g2Entry, G2_ID, createG2Adapter } from "./g2-lane-crossing";
export { g3Entry, G3_ID, createG3Adapter } from "./g3-tetris";
export { g4Entry, G4_ID, createG4Adapter } from "./g4-rhythm";
export { g5Entry, G5_ID, createG5Adapter } from "./g5-circuit-sync";
export { e1Entry, E1_ID, createE1Adapter } from "./e1-vault-lock";
export { e2Entry, E2_ID, createE2Adapter } from "./e2-morse-pad";
export { g6Entry, G6_ID, createG6Adapter } from "./g6-pressure-valves";
export { g7Entry, G7_ID, createG7Adapter } from "./g7-coffee-run";
export { g8Entry, G8_ID, createG8Adapter } from "./g8-shelf-shuffle";
