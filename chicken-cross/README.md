# G2 — Lane Crossing

Minigame **G2** for Team 50's bunker escape game. A lane-crossing timing game: the player
token starts on the bottom safe row and must reach the top safe row across
**6 hazard lanes** (`LANE_COUNT` in `src/logic.ts`). Lanes alternate direction and vary
in speed. The player's horizontal position is fixed at the centre column, so the only
choices are **forward**, **back** and **wait**.

Everything lives in this folder. It is a self-contained Vite + TypeScript (strict) +
Vitest package with no runtime dependencies, no frameworks and no external assets.

**The visuals are placeholders**: flat rectangles for lanes and obstacles, a circle for
the player, plain text for the lane counter and messages. They are ready to be replaced
by the shared UI layer; `src/render.ts` is the only file that draws anything.

## Run it

Built and verified with **Node v22.19.0** and **npm 10.9.3**.

```sh
cd chicken-cross
npm install
npm run dev        # dev harness at http://localhost:5182
```

Scripts (real names from `package.json`):

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server serving the harness page (`index.html` + `src/harness.ts`) |
| `npm run typecheck` | `tsc --noEmit` over `src/`, `test/` and `vite.config.ts` |
| `npm test` | `vitest run` — the logic tests in `test/logic.test.ts` |
| `npm run test:watch` | Vitest in watch mode |
| `npm run build` | typecheck, then `vite build` of the harness into `dist/` |
| `npm run preview` | serve the built harness |

Dev dependencies installed: `vite ^8.3.4`, `typescript ^7.0.2`, `vitest ^5.0.5`.

### Harness controls

- **ArrowLeft / ArrowDown / A** → `handleInput("LEFT")`, **ArrowRight / ArrowUp / D** →
  `handleInput("RIGHT")`. Keyboard auto-repeat is ignored, so holding a key is one press.
- The two on-screen buttons show the current control labels and send the same inputs.
- **New instance** calls `dispose()` on the running adapter and creates a fresh one; the
  log prints the canvas count so you can confirm the old one is gone.
- The status line and the log show when `onComplete` fires, and for which instance.

The harness is dev-only. `src/index.ts` does not import it.

## Layout

```
chicken-cross/
  package.json, package-lock.json, tsconfig.json, vite.config.ts, .gitignore
  index.html          dev harness page
  src/types.ts        local copy of the STORY.md section 7 contract (swap for CORE's)
  src/logic.ts        pure state + rules, no DOM, fixed 60 Hz step
  src/render.ts       placeholder canvas drawing, reads GameState only
  src/index.ts        createG2Adapter + g2Entry (what CORE imports)
  src/harness.ts      dev-only harness
  test/logic.test.ts  Vitest suite (35 tests)
```

## Rules and tuning (`src/logic.ts`)

- Rows: row 0 is the bottom safe row, rows 1–6 are lanes, row 7 (`TOP_ROW`) is the goal.
- **Steps glide.** A press starts a `STEP_DURATION_MS` (120 ms) glide to the next row
  with a cubic ease-out. One press made during a glide is buffered and runs the moment the
  glide ends; any further presses during that glide are ignored. LEFT during a forward
  glide is buffered like any other press, so the player can bail out straight after.
- **Collision during a glide** uses the lane being left until the glide is past halfway,
  then the lane being entered. The collision box is `PLAYER_HITBOX_SCALE` (0.75) of the
  drawn player width (`PLAYER_HITBOX_WIDTH` = 21 units), so grazing an obstacle's edge is
  forgiven.
- Obstacles in each lane sit on a cyclic track slightly wider than the screen, so they
  wrap while off screen. Gaps between obstacles are drawn from `[MIN_GAP, MAX_GAP]`
  (120–180 units) and the closing gap of the cycle also respects `MIN_GAP`.
- Lane speed is drawn from `[LANE_MIN_SPEED, LANE_MAX_SPEED]` (70–120 units/s); lane
  direction alternates.
- Fairness: the narrowest gap at the player's column is `MIN_GAP - PLAYER_HITBOX_WIDTH`
  wide and passes at the fastest lane speed in about 825 ms, well above
  `MIN_CLEAR_WINDOW_MS` (500 ms). The slowest lane repeats its widest gap every ~3.4 s, under
  `MAX_GAP_WAIT_MS` (6 s). Tests check both for many seeds, and a breadth-first planner
  proves a hit-free crossing exists on 60 seeds, including after random waits, modelling
  the glide duration and the halfway collision rule.
- Obstacles keep moving while READY so the player can read the timing before starting.
- All randomness comes from a mulberry32 PRNG. The adapter seeds it from a hash of
  `runId`, so a given run always produces the same lane layout and the game is identical
  for every stage. `Math.random` is never used.
- Simulation is a fixed 60 Hz step with an accumulator (`step(state, dtMs)`); wall-clock
  gaps above 250 ms are clamped. `createState(seed)`, `tick(state)`, `press(state, button)`,
  `rowClearForMs`, `rowOccupiedAt`, `collisionRow` and `playerVisualRow` are all pure and
  DOM-free.
- Rendering interpolates between ticks: the renderer reads the accumulator as a fraction
  of a tick and advances obstacles (sub-pixel) and the player's eased glide by that
  fraction, so motion is smooth at any refresh rate while the logic stays fixed-step.

Measured with the planner (fastest possible crossing, no hesitation) across 40 seeds:
0.1 s minimum, 2.0 s median, 14.3 s maximum. A human who waits for comfortable gaps and
takes a hit or two lands in the intended 15–30 s range. To make it harder, lower
`MAX_GAP` or raise `LANE_MIN_SPEED`; the fairness tests will tell you if you go too far.

## Handoff note for the CORE integrator

### Exports

From `chicken-cross/src/index.ts`:

```ts
import { createG2Adapter, g2Entry } from "../chicken-cross/src/index";
// g2Entry === { id: "G2", ready: true, adapter: createG2Adapter }
```

- `createG2Adapter(): MinigameAdapter` — returns an **independent instance** each call.
  There is no module-level mutable state.
- `g2Entry: MinigameRegistryEntry` — drop it into `GAME_CONFIG.minigamePool`. Nothing in
  this folder registers itself anywhere.
- `LANE_COUNT` is re-exported for display purposes if you want it.

The folder is plain TypeScript source, so a root Vite/TS project can import it directly
without a build step.

### Contract behaviour

| Method | Behaviour |
| --- | --- |
| `startMinigame(args)` | Stores `args`, appends a `<canvas>` to `args.container`, or `#minigame-root` if no container is given (falls back to `document.body` with a console warning). Publishes the READY labels synchronously, then starts a `requestAnimationFrame` loop. The canvas scales to the container and keeps a 2:3 aspect ratio; if the container has no height, it takes the natural height for its width. |
| `handleInput(button)` | Only `"LEFT"` and `"RIGHT"`. Ignored after `dispose()` and after completion has fired. Never listens to keyboard or mouse itself. |
| `dispose()` | Cancels the animation frame, disconnects the ResizeObserver / window listener, removes the canvas and clears all references. Safe to call twice and safe mid-game. There are no `setTimeout`s; the hit lockout and the success hold run on simulated time inside the loop. |

### Control labels per state

`setControlLabels` is called on **every** state change, including the initial READY.

| State | LEFT | RIGHT | Notes |
| --- | --- | --- | --- |
| READY | `Start` | `Start` | Either button starts; the player does not move. Obstacles are already moving. |
| PLAYING | `Back` | `Forward` | Glide one lane back / forward over 120 ms. `Back` at the start row does nothing. One press during a glide is buffered; more are ignored. |
| HIT | `Retry` | `Retry` | Shows "Hit!"; inputs ignored for 400 ms, then either button resets to READY on the start row with no further delay. Lanes keep their positions. |
| SUCCESS | `—` | `—` | Shows "Crossed!" for 1 s, then `onComplete()` |

### Completion signal

- `onComplete()` fires **exactly once** per adapter instance, 1 s after the token reaches
  the top row, and only on a real success. A hit and retry never fires it. It is guarded
  by a flag in both the game logic and the adapter.
- After it fires, inputs are ignored. The game keeps drawing "Crossed!" until CORE calls
  `dispose()` and moves to the story reveal.
- `gameId`, `stageId` and `runId` are stored but never branched on, apart from hashing
  `runId` into the lane seed. G2 behaves identically in C1–C4 and never reads or shows a
  PIN digit or story text.

### Types

`src/types.ts` is a **local copy** of the STORY.md section 7 contract (`Button`,
`ControlLabels`, `MinigameStartArgs`, `MinigameAdapter`, `MinigameRegistryEntry`). When
CORE publishes shared types, delete this file and point the imports in `src/logic.ts`,
`src/index.ts` and `src/harness.ts` at the shared module. The shapes are identical.

### `inputCount`

`docs/TECH_SPEC.md` extends the registry entry with `inputCount: 1 | 2`. G2 is a genuine
**two-button** game (LEFT = back, RIGHT = forward), so it should be declared
`inputCount: 2`. The field is not in the STORY.md contract that `types.ts` copies, so it
is not on `g2Entry` yet; adding it is a one-line change in `src/index.ts` (and
`src/types.ts`) once CORE confirms the shared type.

## Changes in this upgrade

- LEFT is confirmed as **Back** during PLAYING (one lane toward the start row, never
  below it) and is covered by tests; RIGHT stays **Forward**.
- Instant lane snaps replaced by a 120 ms eased glide (`STEP_DURATION_MS`), with one
  buffered press per glide and quick reversal.
- Collision now follows the glide: source lane until halfway, target lane after.
- Forgiving hitbox at 75% of the drawn size (`PLAYER_HITBOX_SCALE`, `PLAYER_HITBOX_WIDTH`).
- Renderer interpolates player and obstacle motion between fixed ticks.
- Harness also maps ArrowDown → LEFT and ArrowUp → RIGHT; auto-repeat was already ignored.
- Tests: 10 new cases for back-stepping, glide timing, buffering, reversal, halfway
  collision and the hitbox; the planner used by the crossing tests now models glides.

## Suggested changes outside this folder (not made)

- **`AGENTS.md`** still says there is no implementation and no `package.json`, while the
  root now has a Vite scaffold and `flappy-bird/` and `chicken-cross/` each have their
  own package. Update the "Project state" section and note the per-minigame folder
  convention (`<game>/src/index.ts` exporting `createGxAdapter` and `gxEntry`).
- **Root workspace**: npm workspaces (`"workspaces": ["flappy-bird", "chicken-cross", ...]`)
  would let one root `npm install` cover every minigame; alternatively the root
  `tsconfig.json` `include` needs to cover the minigame folders if CORE imports them as
  source.
- **Shared types module**: CORE should publish the section 7 contract (plus `inputCount`)
  in one place so each minigame can delete its local `types.ts`.
- **Shared UI layer**: G1 and G2 both expose a pure `GameState` and a single
  `drawFrame(ctx, state, w, h)`; a shared renderer could consume the same shape.
