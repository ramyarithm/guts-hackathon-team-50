# Minigame Development Guide

This guide explains how to implement a new minigame for "Please Hold" that conforms to the adapter contract.

## Quick Start

1. Create your game directory: `src/minigames/g[N]-[name]/`
2. Implement `logic.ts` (pure game state, no DOM)
3. Implement `render.ts` (canvas drawing, reads state only)
4. Implement `index.ts` (adapter factory + registration)
5. Import your game in the main entry point

## File Structure

```
src/minigames/g3-your-game/
├── index.ts      # Adapter factory + auto-registration
├── logic.ts      # Pure game state and rules
└── render.ts     # Canvas rendering
```

## The Adapter Contract

Every minigame exports an adapter that implements `MinigameAdapter`:

```typescript
interface MinigameAdapter {
  startMinigame(args: MinigameStartArgs): void;
  handleInput(button: Button): void;
  dispose(): void;
}
```

### startMinigame(args)

Called by the controller to mount and start your game.

```typescript
interface MinigameStartArgs {
  gameId: string;           // Your game ID ("G3", etc.)
  stageId: string;          // "C1"–"C4" - DO NOT use for rewards
  runId: string;            // Unique playthrough ID
  setControlLabels: (labels: ControlLabels) => void;
  onComplete: () => void;
  container?: HTMLElement;  // Defaults to #minigame-root
}
```

**Requirements:**
- Mount your canvas inside `container` (or `#minigame-root`)
- Call `setControlLabels()` immediately with your initial labels
- Start your game loop (requestAnimationFrame)
- May be called multiple times; clean up previous state first

### handleInput(button)

Called when the player presses LEFT or RIGHT.

```typescript
type Button = "LEFT" | "RIGHT";
```

**Requirements:**
- Ignore if game is completed or disposed
- Only respond to "LEFT" or "RIGHT" exactly
- Update game state accordingly

### dispose()

Called when the player leaves the scene.

**Requirements:**
- Cancel all animation frames
- Remove all event listeners
- Clear all timers
- Remove DOM elements you created
- Safe to call multiple times

## Registration

Register your game so the controller can select it:

```typescript
// src/minigames/g3-your-game/index.ts
import { register } from "../registry";
import type { MinigameRegistryEntry } from "../types";

export const g3Entry: MinigameRegistryEntry = {
  id: "G3",
  name: "Your Game Name",
  ready: true,           // Set to false while developing
  inputCount: 1,         // or 2
  adapter: createG3Adapter,
};

register(g3Entry);
```

**Important:** `inputCount` must be declared at registration, not discovered at runtime.

## One-Button vs Two-Button Games

### One-Button Game (inputCount: 1)
- C1 (opening level) MUST use a one-button game
- Only one button has a function
- The unused button must be visibly inactive (disabled/greyed), not blank
- Example labels: `{ left: "Jump", right: "—" }` or `{ left: "—", right: "Action" }`

### Two-Button Game (inputCount: 2)
- Both buttons have active functions
- Example labels: `{ left: "Back", right: "Forward" }`
- Even if both buttons do the same thing, if both are active it's a two-button game

## Control Labels

Update labels when your game phase changes:

```typescript
function labelsFor(phase: Phase): ControlLabels {
  switch (phase) {
    case "READY":
      return { left: "Start", right: "—" };  // One-button example
    case "PLAYING":
      return { left: "Action", right: "—" };
    case "FAILED":
      return { left: "Retry", right: "—" };
    case "SUCCESS":
      return { left: "—", right: "—" };
  }
}
```

## Completion

Call `onComplete()` exactly once when the player wins:

```typescript
// In your game logic
if (playerWon && !completionFired) {
  completionFired = true;
  onComplete();
}
```

**Rules:**
- Call once per playthrough, not on retry
- The controller validates the runId and stage/game pair
- Duplicate calls are ignored
- Don't call if disposed

## Seeded Randomness

**NEVER use `Math.random()` for anything that affects gameplay.**

Use a seeded PRNG derived from the `runId`:

```typescript
// FNV-1a hash for string → number
function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32 PRNG
function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Usage in startMinigame
const seed = hashSeed(args.runId);
const rng = createSeededRng(seed);
const randomValue = rng();  // 0–1
```

## Stage Independence

**Your game must not know its stage.** Don't:
- Hard-code PIN digits or story reveals
- Change behavior based on stageId
- Reference C1/C2/C3/C4 in game logic

The controller awards rewards based on stage, not the game.

## Example: Minimal One-Button Game

```typescript
// src/minigames/g3-timing/index.ts
import { register } from "../registry";
import type { Button, MinigameAdapter, MinigameRegistryEntry, MinigameStartArgs, ControlLabels } from "../types";

const G3_ID = "G3";

function createG3Adapter(): MinigameAdapter {
  let args: MinigameStartArgs | null = null;
  let completed = false;
  let disposed = false;
  
  return {
    startMinigame(startArgs: MinigameStartArgs): void {
      if (disposed) return;
      args = startArgs;
      completed = false;
      args.setControlLabels({ left: "Stop!", right: "—" });
      // ... setup game
    },
    
    handleInput(button: Button): void {
      if (disposed || completed) return;
      if (button === "LEFT") {
        // Handle press
        if (playerWon) {
          completed = true;
          args?.onComplete();
        }
      }
      // RIGHT does nothing (one-button game)
    },
    
    dispose(): void {
      if (disposed) return;
      disposed = true;
      // ... cleanup
    },
  };
}

export const g3Entry: MinigameRegistryEntry = {
  id: G3_ID,
  name: "Timing Game",
  ready: true,
  inputCount: 1,
  adapter: createG3Adapter,
};

register(g3Entry);
```

## Testing

Structure your logic for easy testing:

```typescript
// logic.ts - pure functions, no DOM
export function createState(): GameState { ... }
export function tick(state: GameState): void { ... }
export function press(state: GameState, button: Button): void { ... }

// Tests can import and test these directly
import { createState, tick, press } from "./logic";
```

## Checklist Before Marking Ready

- [ ] `inputCount` correctly declared (1 or 2)
- [ ] `setControlLabels()` called on start and phase changes
- [ ] Unused button shown as inactive (if one-button game)
- [ ] `onComplete()` called exactly once on win
- [ ] No `Math.random()` for gameplay randomness
- [ ] Uses seeded RNG from runId if random elements exist
- [ ] No hard-coded PIN digits or stage-specific behavior
- [ ] `dispose()` cleans up all resources
- [ ] Works at any stage (C1–C4)
