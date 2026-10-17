# E1 — Vault Lock

E1 is a special (non-pool) minigame: crack a bunker vault's combination dial with two
buttons. The dial has `DIAL_SIZE` = 12
positions. The combination is `CODE_LENGTH` = 3 numbers, generated from the run's seed:
no two consecutive numbers are equal and the first is never the starting position (0).
**The combination is internal to this minigame and has nothing to do with the bunker
PIN**; the game never reads or shows PIN digits.

This folder is the whole game: `logic.ts` (pure state and rules), `render.ts` (canvas
drawing only), `index.ts` (adapter, `e1Entry`, auto-registration) and `logic.test.ts`.
It follows the same structure, adapter shape, shared types and visual style as G1 and
G2.

## Controls per step

Classic safe rule: number 1 is reached turning **right**, number 2 turning **left**,
number 3 turning **right**. Locking in means reversing: at each step one button turns
the dial in the required direction and the other locks in the current position.

| State / step | LEFT | RIGHT | On screen |
| --- | --- | --- | --- |
| READY | `Start` | `Start` | "CRACK THE VAULT" card |
| PLAYING, number 1 | `Lock in` | `Turn ▶` | "Turn RIGHT, listen for the click, then LEFT locks in" |
| PLAYING, number 2 | `Turn ◀` | `Lock in` | "Turn LEFT, listen for the click, then RIGHT locks in" |
| PLAYING, number 3 | `Lock in` | `Turn ▶` | as number 1 |
| DROPPED | `Retry` | `Retry` | "Tumblers dropped", then "PRESS TO RETRY" after 400 ms |
| SUCCESS | `—` | `—` | handle spins, door swings open, "Vault open" |

`setControlLabels` is called on every state **and** step change (the `createGame`
wrapper compares the label pair, not just the phase).

Each press turns the dial one position with an 80 ms eased rotation. One press made
during a rotation is buffered and runs when it ends; further presses are ignored, exactly
like G2's glide buffering. A buffered lock-in uses the position the rotation reaches.

## Listening feedback

- **Proximity meter.** `proximity(position, target)` is 1 exactly at the target and falls
  linearly with circular distance to 0 at the opposite side of the dial. The renderer
  shows it as an oscilloscope trace whose amplitude and frequency rise as you get close,
  plus a cold-to-hot bar and a COLD / WARM / HOT / CLICK label.
- **Click.** When a turn lands exactly on the target, `lastClickMs` is set: the indicator
  flashes green with a notch ring, the trace spikes, and the adapter plays a short
  optional WebAudio blip (silent if audio is unavailable or blocked; the visuals are
  sufficient on their own).
- Because the meter follows the current target continuously, the target is always
  identified within one full rotation. The tests prove an automated player that only reads
  the meter opens the vault on 300 seeds without a single drop.
- **Correct lock-in** lights a green notch on the dial and a tumbler lamp, and flashes
  "Tumbler n/3 set". **Wrong lock-in** drops the tumblers: after a 400 ms lockout either
  button returns to number 1 with the **same code**; the dial does not jump, and numbers
  already found stay as faint amber hints on the dial and lamps.
- **Win:** locking in number 3 opens the vault. The door leaf swings on its hinge, the
  handle spins, the interior lights up, and "Vault open" shows for 1 s before
  `onComplete` fires.

A first-time player needs on average about 6 turns per number plus listening time, which
lands in the intended 20–40 s range.

## Constants (`logic.ts`)

| Constant | Value | Meaning |
| --- | --- | --- |
| `DIAL_SIZE` | 12 | Dial positions 0–11, wrapping |
| `CODE_LENGTH` | 3 | Numbers in the combination |
| `START_POSITION` | 0 | Dial position at start; never the first number |
| `STEP_DIRECTIONS` | `[1, -1, 1]` | Required turning direction per step (+1 right) |
| `TURN_DURATION_MS` / `TURN_TICKS` | 80 ms / 5 | Eased rotation per press |
| `DROP_LOCKOUT_MS` | 400 | Input lockout after a wrong lock-in |
| `SUCCESS_HOLD_MS` | 1000 | "Vault open" animation before `onComplete` |
| `CLICK_FLASH_MS` / `LOCK_FLASH_MS` | 260 / 700 | Visual flash durations |
| `TICK_MS` / `MAX_STEP_MS` | 16.67 / 250 | Fixed 60 Hz step; stall clamp |

Pure helpers: `createState(seed, { code? })`, `step(state, dtMs)`, `tick(state)`,
`press(state, button)`, `generateCode(seed, start)`, `proximity`, `circularDistance`,
`turnedPosition`, `turnButton(step)`, `lockButton(step)`, `currentTarget`, `meterLevel`,
`labelsFor`, `stepHint`, `dialVisualPosition`, `rotationProgress`, `createGame`.

## Handoff note for the CORE integrator

From `src/minigames/e1-vault-lock/index.ts`:

- `createE1Adapter(): MinigameAdapter` — independent instance per call, no module-level
  state.
- `e1Entry: MinigameRegistryEntry` = `{ id: "E1", name: "Vault Lock", ready: true,
  inputCount: 2, adapter: createE1Adapter }`. The module calls `register(e1Entry)` when
  imported, like G1–G4, but nothing imports it yet (see below). Because E1 is a special
  game rather than one of the G1–G7 pool slots, CORE should decide whether the random
  run plan (`getReadyGames()`) must skip ids that start with `E`; the registry currently
  treats every `ready` entry alike.
- `startMinigame(args)` stores the args, mounts a `<canvas>` in `args.container` (or
  `#minigame-root`, falling back to `document.body` with a warning), publishes the READY
  labels synchronously and starts a `requestAnimationFrame` loop. The canvas scales to
  its container at a 2:3 aspect ratio.
- `handleInput` accepts only `"LEFT"`/`"RIGHT"`, and is ignored after `dispose()` or once
  completion has fired. The game never listens to the keyboard or mouse.
- `onComplete()` fires exactly once per instance, 1 s after the third number is locked
  in, and only on a real success. A drop and retry never fires it. Guarded by a flag in
  both logic and adapter.
- `dispose()` cancels the animation frame, disconnects the ResizeObserver / window
  listener, removes the canvas, closes the optional AudioContext and clears references.
  Safe to call twice and mid-game. There are no `setTimeout`s; lockouts and the success
  hold run on simulated time.
- `gameId`, `stageId` and `runId` are never branched on; the seed is `hashSeed(runId)`,
  so the game is identical at any stage.

## Tests

`logic.test.ts` lives in this folder. The root project has no test runner, so it runs
under the Vitest installed in `chicken-cross/`, from the repo root:

```sh
./chicken-cross/node_modules/.bin/vitest run src/minigames/e1-vault-lock
```

`vitest-shim.d.ts` provides minimal ambient typings for `vitest` so the root `tsc`
(part of `npm run build`, whose `tsconfig` includes all of `src/`) stays green. Delete
the shim when Vitest becomes a root dependency. No config outside this folder was
changed.

25 tests: code rules for 500 seeds; labels per step; wrap 11 → 0 and 0 → 11; rotation
duration and buffering; proximity maximal at the target and decreasing with distance;
click cue; correct lock-in advances, wrong lock-in drops and retries with the same code
and hints; solvability by observation on 300 seeds within `CODE_LENGTH × DIAL_SIZE`
turns; completion exactly once; inputs ignored after dispose; fixed-timestep clamp.

## Visuals

Canvas primitives and gradients only. A steel vault door leaf with bolts sits in a fixed
frame on a concrete wall with a hazard stripe. The dial has a knurled rim, 12 major ticks
with numbers, minor ticks, a fixed amber indicator at the top, green lit notches for
found numbers and faint amber hints after a drop. A three-spoke handle and three tumbler
lamps sit below the dial. The proximity meter is an oscilloscope strip along the bottom.
On success the handle spins and the door leaf foreshortens on its hinge to reveal a lit
interior. HUD and messages use the monospace CRT style with scanlines and a vignette; the
wall, frame and overlay are pre-rendered per adapter instance.

## Suggested changes outside this folder (not made)

- **Register E1** (steps 5–6 of `src/minigames/ADDING_GAMES.md`): in
  `src/minigames/index.ts` add `import "./e1-vault-lock";` next to G1–G4 and
  `export { e1Entry, E1_ID, createE1Adapter } from "./e1-vault-lock";`. For manual
  testing add a `btn-e1` debug button in `index.html` and wire it in `src/main.ts`
  (`elements.btnE1`, `updateDebugButtons()`, click handler calling `startGame('E1')`).
- **Keep E1 out of the random pool** if that is the intent of the special slot: filter
  `id.startsWith("E")` where the run plan is built, or give the registry a flag for
  special games.
- **Root test runner:** add Vitest to the root `package.json` (`"test": "vitest run"`) so
  the tests in this folder run with `npm test`; then delete `vitest-shim.d.ts`.
- **Docs:** claim E1 in the task table in `docs/TECH_SPEC.md` and update `AGENTS.md`'s
  project-state section.
