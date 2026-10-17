# G2 — Lane Crossing

A government telephone engineer crosses a bunker maintenance corridor: six hazard lanes
of carts, cable drums and sparking power units between two grating platforms. The
player's column is fixed; the only choices are **Forward** (RIGHT), **Back** (LEFT) and
waiting. Reach the lit "LINE RESTORED" terminal on the far platform once to win.

This folder is the whole game: `logic.ts` (pure rules, layout generation and the
verifier), `render.ts` (canvas drawing only) and `index.ts` (the adapter and the
`g2Entry` registry entry, `inputCount: 2`). The adapter contract, states, labels, glide
and input buffering are unchanged from the previous version.

## The bug that was fixed

Obstacles used to be laid out per lane with random gaps and a random phase, with no
relationship between lanes. The only fairness check was per lane: "a clear window of at
least 500 ms opens within 6 s". Nothing checked lanes *together*, so a player standing
in lane N could watch their lane close while lane N+1 and lane N−1 were both occupied
for the whole remaining time. Forward and Back were both deaths; waiting was a death too.
The same independence meant some layouts never lined up at all and could not be crossed
within a sensible time. Root cause: random, unverified spawning with lane-local fairness
only.

## How layouts are built now: generate → verify → accept

Everything is decided when an attempt's state is created; nothing random happens during
play.

1. **Deterministic, periodic lanes.** Each lane is a repeating pattern: one obstacle
   every `periodTicks` simulation ticks at the player column, with `direction`, `speed`,
   `obstacleWidth`, `spacing = speed × period` and a `phaseTicks` offset. Periods are
   drawn from `PERIOD_OPTIONS_TICKS` (120 or 180 ticks, i.e. 2 s or 3 s), all multiples of
   `PERIOD_UNIT_TICKS` (30), so the whole corridor repeats within the hyperperiod
   `L = lcm(periods) ≤ MAX_HYPERPERIOD_TICKS` (360 ticks, 6 s). Phases are not random:
   each lane's phase is chosen so that it offers a robust forward escape at every moment
   the previous lane closes (`coversClosings`); if no phase can do that, the lane adopts
   the previous lane's period and tries again. The goal row covers the last lane.
2. **One collision function.** `isBlocked(layout, row, tick)` is the only place the
   collision rule lives. It is pure tick arithmetic: a lane is blocked for the first
   `blockedTicks` ticks of each period, where `blockedTicksFor(width, speed)` converts the
   obstacle width plus the player's hitbox (`PLAYER_HITBOX_SCALE` = 0.75 of the drawn
   width) into ticks. Gameplay, the verifier and the generator all call it. The renderer
   derives obstacle positions from the same numbers, so what you see is what collides
   (half a tick of travel is the only tolerance, and the player is drawn wider than its
   hitbox). `glideRowAt` is the single source of the halfway rule: the source lane counts
   for the first part of a glide, the target lane after it.
3. **Exact verifier.** `verifyLayout` builds a reachability game over the finite state
   space `(row, tick mod L)`:
   - **Robust move.** Forward/Back from `(row, t)` is available only if the glide is safe
     when pressed at *any* tick in `[t, t + REACTION_TICKS)`, the current lane stays safe
     while reacting, and the target lane stays safe for the landing margin after the
     latest possible landing. `REACTION_MS` = 250 (15 ticks); the landing margin is
     `2 × REACTION_TICKS + GLIDE_SOURCE_TICKS` (33 ticks ≈ 550 ms): one reaction to look
     around plus a complete robust escape. A move leads to the whole set of landing
     ticks, and it is only winning if every landing is winning.
   - **Wait.** One tick, allowed while the lane stays safe and a robust escape still
     exists before the lane next closes. An attentive player never waits past that point
     of no return; a lane state with no robust escape before its deadline is a trap.
   - **Solvable:** the goal row is forward-reachable from `(start row, startTick)`.
   - **No traps:** every state reachable that way is winning (an attractor computation
     over the same graph: waits lead to winning states, or some robust move has all its
     landings winning). Being alive always means a win is still available with a 250 ms
     reaction margin.
   - Frame-perfect layouts fail automatically: a move that is only safe at one exact tick
     is never robust.
4. **Generation loop.** `generateVerifiedLayout(seed)` generates a layout from the seed,
   verifies it, and on failure advances the seed, up to `MAX_GENERATION_ATTEMPTS` (50).
   If every attempt fails it returns `FALLBACK_LAYOUT`, a hand-staggered set of 3 s lanes
   that the tests prove solvable and trap-free. Measured over 1000 seeds: every seed
   passed on its **first** attempt, so the fallback is never used in practice.
5. **Difficulty.** Obstacles are 48–64 units wide at 60–120 units/s with at least
   `MIN_GAP` (110 units) between them. The verifier's fastest possible crossing is
   2.2–9.7 s (median 5.5 s) across 300 seeds; a human who waits for comfortable gaps lands
   in the intended 15–30 s range.

### Retry behaviour

A HIT keeps the **same** verified layout and the lane clock keeps running. The start
row is always safe and every start-row state is reachable by waiting, so the no-trap
guarantee covers a retry from any tick. The lane seed is `hashSeed(runId)`, so a run
always gets the same corridor at any stage.

### New constants (`logic.ts`)

| Constant | Value | Meaning |
| --- | --- | --- |
| `REACTION_MS` / `REACTION_TICKS` | 250 ms / 15 | Human reaction margin for robust moves |
| `LANDING_MARGIN_TICKS` | 33 | Target lane must stay safe this long after the latest landing |
| `GLIDE_SOURCE_TICKS` | 3 | Ticks of a glide that still collide with the source lane |
| `STEP_TICKS` | 8 | Glide length in ticks (from `STEP_DURATION_MS` = 120) |
| `PERIOD_UNIT_TICKS` | 30 | All lane periods are multiples of this |
| `PERIOD_OPTIONS_TICKS` | 120, 180 | Lane periods in ticks |
| `MAX_HYPERPERIOD_TICKS` | 360 | Upper bound on `lcm(periods)` |
| `OBSTACLE_WIDTH_OPTIONS` | 48, 56, 64 | Obstacle widths, varied per lane |
| `MIN_GAP` | 110 | Minimum clear distance between obstacles |
| `LANE_MIN_SPEED` / `LANE_MAX_SPEED` | 60 / 120 | Lane speed range (units/s) |
| `MAX_GENERATION_ATTEMPTS` | 50 | Seeds tried before `FALLBACK_LAYOUT` |
| `PLAYER_HITBOX_SCALE` | 0.75 | Collision box as a fraction of the drawn player |

Exports added for tests and tooling: `isBlocked`, `glideRowAt`, `glideSafe`,
`blockedTicksFor`, `obstacleBodiesAt`, `generateLayout`, `generateVerifiedLayout`,
`verifyLayout`, `findWinningPlan`, `coversClosings`, `makeLayout`, `FALLBACK_LAYOUT`.
`createState(seed, { layout })` injects a layout.

## Tests

The suite lives in `chicken-cross/test/logic.test.ts` (the root project has no test
runner yet) and imports this folder's `logic.ts`. Run it with:

```sh
cd chicken-cross && npm install && npx vitest run
```

38 tests, including:

- **Fuzz:** 1000 seeds → generated layout is solvable and trap-free, with a bounded number
  of attempts and at most a handful of fallbacks (observed: zero).
- **Replay proof:** for 60 seeds the verifier's winning strategy is turned into a per-tick
  action list and replayed through the real `press`/`tick` path; it reaches SUCCESS with
  zero hits, both from tick 0 and from arbitrary start ticks.
- **Trap detection:** a hand-built layout where lane 2 closes while lanes 1 and 3 are
  blocked is solvable but fails the no-trap check.
- **Frame-perfect detection:** a lane that is clear for 12 ticks is solvable with a
  1-tick reaction window and fails with the real one.
- `FALLBACK_LAYOUT` passes and is not trivial; drawn obstacle bodies agree with
  `isBlocked`; Back/Forward labels; start-row Back does nothing; buffering and quick
  reversal; halfway collision rule; completion fires once; inputs ignored after dispose.

## Visual changes (render only)

`render.ts` draws a bunker maintenance corridor with canvas primitives and gradients:
dark concrete wall, lanes as rail tracks with sleepers, rivets and faint hazard
striping (alternating shades), safe rows as metal grating with an amber edge, and a lit
"LINE RESTORED" terminal on the goal row. Obstacles vary by lane: maintenance carts,
rolling cable drums and sparking power units, each with a blinking amber warning light on
the leading edge. The player is a top-down engineer with an amber hard hat, hi-vis
stripes and a toolbox, with a subtle bob during glides. HUD and state text are monospace
CRT style with scanlines and a vignette. The static background and the CRT overlay are
pre-rendered to offscreen canvases per adapter instance and redrawn only when the canvas
size changes. Every obstacle body is drawn exactly as wide as its collision width, and
the player's hitbox sits inside the drawn figure.

## Suggested changes outside this folder (not made)

- **Root test runner.** Add Vitest to the root `package.json` (`"test": "vitest run"`) and
  move `chicken-cross/test/logic.test.ts` to `src/minigames/g2-lane-crossing/logic.test.ts`.
  Until then the root `tsconfig.json` (`include: ["src"]`) would fail on a test file inside
  `src/`, which is why the tests stay in the legacy package.
- **Delete the legacy packages** `chicken-cross/` and `flappy-bird/` once their tests have
  moved; their `src/` copies are stale.
- **`AGENTS.md`** still says there is no implementation and no test runner; update the
  project-state section and document `src/minigames/`.
- **Shared minigame tooling:** G1 and G2 both expose a pure state and a renderer; a shared
  harness page under `src/` would make manual testing easier than the debug toggle in
  `main.ts`.
