# Adding New Minigames - Quick Reference

This skill describes how to add and register new minigames in the "Please Hold" project.

## File Structure

Each minigame lives in `src/minigames/g[N]-[name]/` with three files:

```
src/minigames/g[N]-[name]/
├── logic.ts    # Pure game state and rules (no DOM)
├── render.ts   # Canvas drawing (reads state only)
└── index.ts    # Adapter factory + registration
```

## Step-by-Step: Adding a New Game

### 1. Create the directory

```bash
mkdir src/minigames/g[N]-[name]
```

### 2. Create logic.ts

```typescript
// Pure game logic - no DOM access
import type { ControlLabels } from "../types";
export type { Button, ControlLabels } from "../types";

export const WORLD_WIDTH = 320;
export const WORLD_HEIGHT = 480;

export type Phase = "READY" | "PLAYING" | "SUCCESS" | "FAILED";

export interface GameState {
  phase: Phase;
  // ... your game state
}

export interface GameCallbacks {
  onComplete?: () => void;
  onLabels?: (labels: ControlLabels) => void;
}

export interface Game {
  readonly state: GameState;
  readonly disposed: boolean;
  tick(elapsedMs: number): void;
  press(button: Button): void;  // or just press(): void for one-button
  dispose(): void;
}

export function createGame(opts: GameCallbacks = {}): Game {
  // Implementation
}
```

### 3. Create render.ts

```typescript
import { WORLD_WIDTH, WORLD_HEIGHT, type GameState } from "./logic";

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  canvasW: number,
  canvasH: number,
): void {
  // Drawing code
}
```

### 4. Create index.ts

```typescript
import { WORLD_HEIGHT, WORLD_WIDTH, createGame, type Game } from "./logic";
import { drawFrame } from "./render";
import { register } from "../registry";
import type { Button, MinigameAdapter, MinigameRegistryEntry, MinigameStartArgs } from "../types";

export const G[N]_ID = "G[N]";

export function createG[N]Adapter(): MinigameAdapter {
  let args: MinigameStartArgs | null = null;
  let game: Game | null = null;
  let host: HTMLElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let rafId: number | null = null;
  let lastFrameTs: number | null = null;
  let completed = false;
  let disposed = false;

  // ... standard adapter implementation (copy from existing game)

  return adapter;
}

export const g[N]Entry: MinigameRegistryEntry = {
  id: G[N]_ID,
  name: "Your Game Name",
  ready: true,
  inputCount: 1,  // or 2
  adapter: createG[N]Adapter,
};

// Auto-register
register(g[N]Entry);
```

### 5. Register in minigames/index.ts

Add these lines to `src/minigames/index.ts`:

```typescript
// In the imports section:
import "./g[N]-[name]";

// In the exports section:
export { g[N]Entry, G[N]_ID, createG[N]Adapter } from "./g[N]-[name]";
```

### 6. Add debug button (optional, for testing)

In `index.html`, add to the debug panel:
```html
<button id="btn-g[N]" type="button" class="debug-btn">G[N]</button>
```

In `src/main.ts`:
1. Add to `elements`: `btnG[N]: document.getElementById('btn-g[N]') as HTMLButtonElement,`
2. Add to `updateDebugButtons()`: `elements.btnG[N].classList.toggle('active', state.currentGameId === 'G[N]');`
3. Add event listener:
```typescript
elements.btnG[N].addEventListener('click', () => {
  if (state.currentGameId !== 'G[N]') {
    console.log('[Main] Switching to G[N]');
    startGame('G[N]');
  }
});
```

## Key Rules

1. **inputCount**: Must be `1` or `2`. Declared at registration, not runtime.
   - `1`: One-button game. Only LEFT works. RIGHT shows "—" (inactive).
   - `2`: Two-button game. Both buttons have functions.

2. **One-button game for C1**: The opening level (C1) MUST use a one-button game.

3. **No Math.random()**: Use seeded PRNG for reproducibility:
   ```typescript
   import { hashSeed, createSeededRng } from "./logic";
   const seed = hashSeed(startArgs.runId);
   const rng = createSeededRng(seed);
   ```

4. **Stage independence**: Games must not know their stage. No hard-coded PIN digits.

5. **Completion**: Call `onComplete()` exactly once when player wins.

6. **Labels**: Call `setControlLabels()` on start and phase changes.

## Checklist Before Marking Ready

- [ ] `inputCount` correctly declared (1 or 2)
- [ ] `setControlLabels()` called on start and phase changes
- [ ] Unused button shows "—" (if one-button game)
- [ ] `onComplete()` called exactly once on win
- [ ] No `Math.random()` for gameplay randomness
- [ ] `dispose()` cleans up all resources
- [ ] TypeScript compiles without errors
- [ ] Game added to `minigames/index.ts` imports and exports
