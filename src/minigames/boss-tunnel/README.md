# Dead Line — the boss fight (first-person tunnel escape)

The vault has opened onto a maintenance tunnel of the same government communications
bunker: riveted steel panels, cable trays full of phone lines, relay cabinets, stencilled
sector signs, dead bulkhead lamps. The missing colleague escaped this way and chalked an
arrow on the wall facing every junction. Something blind lives down here: it hunts
**light**. The lantern shows the way but draws it in; the dark is safe but you cannot move.

| File | Role |
| --- | --- |
| `world.ts` | The tunnel as a tile grid: seeded path with real T junctions and dark side stubs, camera pose per cell, the grid and per-face decorations the raycaster walks. |
| `logic.ts` | Pure rules: lantern, steps, junction turns, attention, tutorial prompts, the door sequence, events. `createState(seed)`, `step(state, dtMs)`, `press(state, button)`, `takeEvents(state)`, `cameraPose(state)`, `doorSequence(state)`. |
| `render.ts` | Retro raycaster (320x180, nearest-neighbour) over the grid, procedural bunker textures, lighting, emissive lamps and door glow, eyes, particles, HUD, prompts and the two control labels. |
| `audio.ts` | Synthesized sound on its own AudioContext: creature bed through a proximity low-pass and stereo panner, footsteps, click, blocked-step thud, heartbeat, stingers, the door's wheel ratchet and clank. |
| `index.ts` | Adapter (`createBossAdapter`, `BOSS_ID`, `BossStartArgs`, `TunnelEvent`), full-screen canvas, `onEvent` hook. |
| `logic.test.ts` | Rules and the fairness proofs. `./chicken-cross/node_modules/.bin/vitest run src/minigames/boss-tunnel` |

## One rule

**Light shows the way. Light wakes the creature.** You can only step while the lantern is
on, so the loop is push-your-luck: light on to move (danger rises), light off to hide
(danger falls while you stand still). Because you always arrive at a junction with light,
you always see the chalk: every junction is taken correctly and the camera turns into the
right branch. There is no dead end and no wrong branch to enter.

## Controls (never change meaning)

| Lantern | LEFT | RIGHT |
| --- | --- | --- |
| On | Lantern off | Step forward |
| Off | Lantern on | Too dark (a press only shows "Too dark to move. Turn your lantern on.") |
| Caught / at the door | — | — (the run is over) |

One press is buffered during a step or a turn. Three non-blocking prompts guide the start:
"Turn your lantern ON (LEFT) to see.", "Press RIGHT to step forward.", and, when the eyes
turn toward the light, "It hunts light. Turn it OFF to hide, then move again." The HUD shows
a DANGER meter (green to red), the lantern state and a SURFACE bar. Being caught ends the
whole run: a cut to black with the sting, "CAUGHT" and the cause ("It followed your light."
when danger maxed while lit, otherwise "It found you.") for `CAUGHT_HOLD_MS`, then `onFail`
once and the controller's Game Over flow. Above 70% danger the meter pulses and the
heartbeat speeds up.

## Junctions

`buildGeometry` lays the cells through a 2D grid: at a junction the corridor ends in a solid
wall straight ahead (the chalk arrow is painted on that face, pointing down the correct
branch) and opens left and right. The correct side is the next segment of the path; the
wrong side is a `STUB_DEPTH`-cell dark passage with its own walls, depth and fog. A layout
whose corridors would cross or touch is rejected and the branch directions are re-rolled;
`FALLBACK_LAYOUT` (alternating turns) is used if no roll fits. Stepping into the junction
starts a `TURN_MS` (350 ms) eased camera turn (`state.turn`, `cameraPose`) into the branch.

## The door

The last segment ends in a blast door: hazard-striped frame, "SURFACE ACCESS" and
"EMERGENCY EXIT" stencils, a six-spoke locking wheel, and a slit of daylight around the leaf
that is emissive, so it is visible from several cells away and brightens as you approach.
Arriving at the final cell enters `SURFACE`: the wheel spins (`DOOR_WHEEL_MS`, ratchet SFX),
the leaf swings open with a clank (`DOOR_SWING_MS`, daylight spills into the corridor), the
screen floods white (`DOOR_FLOOD_MS`), and after `SURFACE_HOLD_MS` `onComplete` fires once.

## Rendering

A Wolfenstein-style DDA raycaster over the grid at `INTERNAL_W x INTERNAL_H` (320x180),
scaled up with nearest-neighbour into a 16:9 box. Textures are generated once on offscreen
canvases (walls 128 px, floor and ceiling 64 px) and cached per decoration:

- **Walls:** grey-green painted steel in two panels per cell with dark seams, rivets,
  chipped paint, rust streaks and a grimier skirting; a cable tray of bundled phone cables
  with tags and a conduit along the top. Variants: junction boxes (labelled plates, one with
  its lid open), relay cabinets (louvres, indicator lamps), stencilled signs ("LINE 4",
  "SECTOR C", "MAINTENANCE ACCESS", "AUTHORISED PERSONNEL ONLY", "COMMS TRUNK / DO NOT
  CUT") with direction arrows that point the way the corridor runs, and caged bulkhead
  lamps, mostly dead; two per run still flicker (emissive, amber).
- **Floor:** steel grating over dark water with puddles that catch the lantern. Junction
  cells use a plate with a drain. **Ceiling:** a duct with flanges, two pipes, a cable
  bundle and hangers, all running along the corridor; a duct crossing and junction box over
  junctions.
- Palette taken from `assets/scenes`: the bunker's cold blue-grey steel panels and dark
  seams, the phosphor-green HUD, amber and red lamps, and the yellow-black hazard striping
  of the vault door.
- Distance fog to black, lantern beam with falloff and flicker, a faint ambient outline in
  the dark, film grain and vignette, drips and motes in the beam, blinking eyes that close
  in with danger (kept in front of the nearest wall), a silhouette at the beam's edge.

## Full screen

The adapter appends a fixed canvas over the whole window, sized to the viewport times
`devicePixelRatio` (cap 2) and re-fitted on resize and orientation change. The corridor is
drawn in a 16:9 view box centred in the window; the rest stays dark. HUD and the control
labels are drawn on the canvas inside safe margins; the dialogue subtitles overlay it
(z-index 200 over 100). Disposing removes the canvas, which restores the shared layout
exactly as it was; `fillsViewport` is the check used for it.

## Constants (`logic.ts`)

`ATTENTION_CAUGHT` 100, `DETECT_THRESHOLD` 30 (eyes), `PANIC_THRESHOLD` 70 (vignette,
heartbeat, shake), `LANTERN_RATE_PER_S` 20, `STEP_NOISE` 6, `DARK_DECAY_PER_S` 3.2 (dark
and still), `SCRIPTED_DETECT_CELL` 2, `REACT_DELAY_MS` 900 (eyes out before they turn to
the light), `GRACE_MS` 2000 (the lantern raises nothing after the reveal), `STEP_MS` 200,
`TURN_MS` 350, `DARK_HINT_MS` 1500, `CAUGHT_HOLD_MS` 1500, `DOOR_WHEEL_MS` 900,
`DOOR_SWING_MS` 1100, `DOOR_FLOOD_MS` 700, `SURFACE_HOLD_MS` 3000. Layouts: 15–18 cells,
4 junctions (5 only at 18) spaced ≥ 3 apart; `validateLayout` also checks the geometry.

## Dialogue events (`onEvent`, each once per run)

`tunnel_enter` on the first frame; `monster_first_detected` when attention first reaches
30 (reaching cell 2 lifts attention to at least 32, so it always happens early);
`monster_reacts_to_flashlight` once the eyes have been out for `REACT_DELAY_MS` with the
lantern on; `light_mechanic_revealed` straight after, followed by the grace period.

## Fairness (proved in `logic.test.ts`)

- A careful bot with a 300 ms reaction (lit to move, hides above 70, moves again below
  20) reaches the door on 400 seeds, never caught, in 40–130 s with a mean of about 62 s.
- A bot that hides later (above 85) still makes it on 100 seeds.
- An always-lit bot is caught on all 400 seeds.
- There is no retry inside the boss; a catch is game over. Bunker progress is the
  controller's and is never touched.
