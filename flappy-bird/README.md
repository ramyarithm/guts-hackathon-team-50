# G1 — Signal Pulse

Minigame **G1** for Team 50's bunker escape game. The player guides a signal pulse
through the gaps between broken relay pylons / junction boxes to re-establish a phone
line. Pass **8** gaps (`TARGET_GAPS` in `src/logic.ts`) and the line is restored.

Everything lives in this folder. It is a self-contained Vite + TypeScript (strict) +
Vitest package with no runtime dependencies, no frameworks and no external assets:
all art is drawn with canvas primitives.

## Run it

Built and verified with **Node v22.19.0** and **npm 10.9.3**.

```sh
cd flappy-bird
npm install
npm run dev        # dev harness at http://localhost:5181
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

- **ArrowLeft / A** → `handleInput("LEFT")`, **ArrowRight / D** → `handleInput("RIGHT")`.
- The two on-screen buttons show the current control labels and send the same inputs.
- **New instance** calls `dispose()` on the running adapter and creates a fresh one, so
  you can confirm the old canvas and loop are gone (the log prints the canvas count).
- The status line and the log show when `onComplete` fires, and for which instance.

The harness is dev-only. `src/index.ts` does not import it.

## Layout

```
flappy-bird/
  package.json, package-lock.json, tsconfig.json, vite.config.ts, .gitignore
  index.html          dev harness page
  src/types.ts        local copy of the STORY.md section 7 contract (swap for CORE's)
  src/logic.ts        pure state machine + physics, no DOM, fixed 60 Hz step
  src/render.ts       canvas drawing, reads GameState only
  src/index.ts        createG1Adapter + g1Entry (what CORE imports)
  src/harness.ts      dev-only harness
  test/logic.test.ts  Vitest suite
```

## Handoff note for the CORE integrator

### Exports

From `flappy-bird/src/index.ts`:

```ts
import { createG1Adapter, g1Entry } from "../flappy-bird/src/index";
// g1Entry === { id: "G1", ready: true, adapter: createG1Adapter }
```

- `createG1Adapter(): MinigameAdapter` — returns an **independent instance** each call.
  There is no module-level mutable state.
- `g1Entry: MinigameRegistryEntry` — drop it into `GAME_CONFIG.minigamePool`. Nothing in
  this folder registers itself anywhere.
- `TARGET_GAPS` is re-exported for display purposes if you want it.

The folder is plain TypeScript source, so a root Vite/TS project can import it directly
without a build step. If CORE prefers a prebuilt bundle, say so and a library build can
be added here.

### Contract behaviour

| Method | Behaviour |
| --- | --- |
| `startMinigame(args)` | Stores `args`, appends a `<canvas>` to `args.container`, or `#minigame-root` if no container is given (falls back to `document.body` with a console warning). Publishes the READY labels synchronously, then starts a `requestAnimationFrame` loop. The simulation runs on a fixed 60 Hz accumulator; stalls longer than 250 ms are clamped. The canvas scales to the container and keeps a 2:3 aspect ratio; if the container has no height, it takes the natural height for its width. |
| `handleInput(button)` | Only `"LEFT"` and `"RIGHT"`; both do the same thing. Ignored after `dispose()` and after completion has fired. Never listens to keyboard or mouse itself. |
| `dispose()` | Cancels the animation frame, disconnects the ResizeObserver / window listener, removes the canvas and clears all references. Safe to call twice and safe mid-game. There are no `setTimeout`s; lockouts and the success hold run on simulated time inside the loop. |

### Control labels per state

`setControlLabels` is called on **every** state change, including the initial READY.

| State | LEFT | RIGHT | Notes |
| --- | --- | --- | --- |
| READY | `Pulse` | `Pulse` | First press starts the run and pulses |
| PLAYING | `Pulse` | `Pulse` | Same upward impulse on either button |
| CRASHED | `Retry` | `Retry` | Shows "Signal lost"; inputs ignored for 400 ms, then either button resets to READY |
| SUCCESS | `—` | `—` | Shows "Line restored" for 1 s, then `onComplete()` |

### Completion signal

- `onComplete()` fires **exactly once** per adapter instance, about 1 s after the eighth
  gap is passed, and only on a real success. A crash and retry never fires it. It is
  guarded by a flag in both the game logic and the adapter.
- After it fires, inputs are ignored. The game keeps drawing the "Line restored" card
  until CORE calls `dispose()` and moves to the story reveal.
- `gameId`, `stageId` and `runId` are stored but never branched on: G1 behaves identically
  in C1–C4 and never reads or shows a PIN digit or story text.

### Types

`src/types.ts` is a **local copy** of the STORY.md section 7 contract (`Button`,
`ControlLabels`, `MinigameStartArgs`, `MinigameAdapter`, `MinigameRegistryEntry`). When
CORE publishes shared types, delete this file and point the imports in `src/logic.ts`,
`src/index.ts` and `src/harness.ts` at the shared module. The shapes are identical, so
nothing else should need to change.

### One thing to decide: `inputCount`

`docs/TECH_SPEC.md` on `origin/main` extends the registry entry with
`inputCount: 1 | 2` and requires stage C1 to be served by a one-button game. The task
brief for G1 specified that **both** buttons pulse, so `g1Entry` currently matches the
STORY.md contract and has no `inputCount`.

Because both buttons do the same thing, G1 works either way:

- Declare `inputCount: 2` and keep both labels as `Pulse`, or
- Declare `inputCount: 1` so G1 qualifies as the one-button opener for C1, and have CORE
  show RIGHT as inactive. The game still plays fine on LEFT alone.

Adding the field is a one-line change in `src/index.ts` (and `src/types.ts`) once CORE
confirms which it wants.

## Tuning reference (`src/logic.ts`)

World is 320 × 480 units. Gravity 900, pulse impulse −300, max fall 380, scroll 80 u/s,
gap height 170, pylon width 44, spacing 200, minimum pylon thickness 36, max vertical
shift between consecutive gaps 120 (so every gap is reachable), hit radius 7 against a
drawn radius of 10. Eight gaps take roughly 22 s of play. Tests assert the autopilot wins
on 40 different seeds and that generated gaps stay inside bounds.

## Suggested changes outside this folder (not made)

- **`AGENTS.md`**: the local copy still says the repo is empty. `origin/main` already has
  a root Vite scaffold (`package.json`, `tsconfig.json`, `src/main.ts`) and the
  `STORY.md` / `TECH_SPEC.md` split. Update the "Project state" section, and add a note
  that minigames live in their own folders (e.g. `flappy-bird/`) with their own
  `package.json` until a workspace is set up.
- **Root workspace**: consider npm workspaces (`"workspaces": ["flappy-bird", ...]`) so
  one `npm install` at the root installs every minigame, or let the root Vite project
  import `flappy-bird/src/index.ts` directly as source (the root `tsconfig.json`
  `include` would need to cover it).
- **Shared types module**: CORE should publish the section 7 contract (plus `inputCount`
  if adopted) in one place so each minigame can delete its local `types.ts`.
- **Stray folder**: an empty `flappy_bird/` (underscore) exists at the repo root. Git
  does not track empty directories, so it is harmless, but it can be deleted to avoid
  confusion with `flappy-bird/`.
- **Docs**: the local `docs/PLEASE_HOLD.md` and the remote `docs/STORY.md` /
  `docs/TECH_SPEC.md` have diverged (local `main` is 1 commit ahead and 2 behind
  `origin/main`); whoever merges should reconcile them.
