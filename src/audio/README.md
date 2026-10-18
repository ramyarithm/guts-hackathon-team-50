# Audio

Music and sound effects for the bunker escape, built on the Web Audio API with no new
dependencies. Everything lives in this folder; the controller (`src/main.ts`) only makes
six small calls, each marked with a `// [audio]` comment, and the G4 rhythm game reads the
beat clock.

| File | Role |
| --- | --- |
| `engine.ts` | The engine: crossfading music voices, seamless loops, the G4 intro → no-drums handoff, the beat clock, one-shots, scene → track mapping. No DOM or Web Audio; it talks to an injected backend, so it is fully testable. |
| `webaudio-backend.ts` | The real backend: AudioContext, `fetch` + `decodeAudioData`, thin GainNode / BufferSourceNode adapters. |
| `tracks.ts` | The manifest, `MINIGAME_TRACKS` (games whose music overrides the stage track) and `GAMES_WITH_OWN_AUDIO`. Imports the files from `assets/` exactly as named (spaces and brackets included); Vite hashes them into the build. |
| `index.ts` | The shared `audio` instance plus re-exports (`trackForScene`, `trackForMinigame`, `trackForHub`, `MINIGAME_TRACKS`, `GAMES_WITH_OWN_AUDIO`). |
| `engine.test.ts` | 33 tests against a fake backend. |

## Track map

| Key | File | Where it plays | Loop |
| --- | --- | --- | --- |
| `menu` | `main menu music.mp3` (22.68 s) | The main menu (`src/scenes/main-menu`), the entry scene | yes |
| `c1` | `c1.mp3` (7.44 s, with drums) | Stage C1, whatever minigame is assigned (except G4) | yes, whole bars |
| `g4` → `c1_loop` | `c1.mp3` once, then `c1(no drums).mp3` (7.44 s each) | The G4 rhythm game, whichever stage it is in: the drums intro once, then the no-drums loop forever | intro once, loop yes |
| `c2` | `c2.mp3` (10.73 s) | Stage C2 | yes |
| `c3` | `c3.mp3` (13.78 s) | Stage C3 | yes |
| `c4` | `c4.mp3` (10.73 s) | Stage C4, the PIN door / E-games (E1, E2) and the ending until the sting | yes |
| `boss` | `creepy sounds.mp3` (26.11 s) | Boss fight ambience (not wired; see below) | yes |
| `victory` | `victory sound.mp3` (3.81 s) | One-shot on the core ending ("ESCAPED!") | no |
| `gameover_music` | `game over music.mp3` (69.14 s) | Plays when a minigame fails | yes |

Music is tied to the **narrative stage**, not to the minigame drawn for it: whatever game
runs in C2 plays `c2`, and stage C1 just loops `c1.mp3` with drums. A stage's track starts
when its minigame starts and keeps playing through the reveal, retries and failed attempts.
The end stage uses the same `c4` key as stage C4, so going from C4 into the PIN door never
restarts it.

The one exception is **G4, the rhythm game**, listed in `MINIGAME_TRACKS` (`G4` → `g4`).
`trackForMinigame(gameId, scene, MINIGAME_TRACKS)` returns the game's own track for it and
the scene track for everything else. While G4 runs, in any stage (C1 included), the
controller crossfades into `g4`: `c1.mp3` once, then `c1(no drums).mp3` looping. When G4
completes, the controller plays the stage's normal track again, which crossfades back for
the reveal. A G4 retry restarts the minigame, not the music: the controller asks for `g4`
again, which is already playing, so the no-drums loop just carries on and the intro is
never replayed. Only a new run (`resetRun()` / reload) plays the intro again. `trackForHub(completed)`
implements the hub rule (next stage still to complete, `c4` once all are done) for when a
hub scene exists; `trackForScene({ kind: "hub", completed })` wraps it.

### Rules the engine enforces

- `playMusic(key)` is a **no-op when that key is already playing**, so nothing ever
  restarts; in particular the G4 intro never replays once the no-drums loop has begun.
- Switching tracks **crossfades** over `CROSSFADE_MS` (800 ms): the old voice ramps to 0
  and its sources are stopped on the clock, the new voice ramps to 1. `activeTracks()`
  shows at most the outgoing and incoming track during the fade, then exactly one.
- Loops use `AudioBufferSourceNode.loop = true` with trimmed `loopStart` / `loopEnd`,
  never `<audio loop>`.
- Every track is decoded into an `AudioBuffer` by `preload()` at startup.
- **Autoplay:** nothing plays until `unlock()`. The controller calls it when the main menu
  opens (it succeeds straight away if the page already had a gesture, or if the browser
  allows autoplay) and on every LEFT/RIGHT input (`handleButtonPress`). While the browser
  keeps the context suspended, every call retries `resume()`, so the first real press
  always gets sound going; `outputState()` reports `"running"`, `"suspended"` (blocked,
  waiting for a gesture) or `"unavailable"`. A `playMusic` before unlock is remembered and
  started on unlock. Audio that fails to load or a browser without Web Audio only logs a
  warning once; every call is a silent no-op and the game runs normally.
- **Volumes:** `MASTER_GAIN` 0.9, `MUSIC_GAIN` 0.5, `SFX_GAIN` 0.8 (music under effects).
- **Music toggle:** `setMusicEnabled(on)` / `isMusicEnabled()` is the global music on/off
  for the whole session. It ramps the **music bus only** (`MUSIC_TOGGLE_FADE_MS`, 150 ms);
  sound effects are unaffected and the tracks keep running underneath, so turning music
  back on resumes the current scene's track in place, never restarting it. It composes
  with ducking/suppression (`level = on ? MUSIC_GAIN × factor : 0`). `index.ts` restores it
  from `localStorage` (`MUSIC_SETTING_KEY`, `"on"`/`"off"`, wrapped in try/catch) and saves
  every change through `onMusicEnabledChange`. The main menu's LEFT button drives it.
- **Ending silence:** `stopMusic()` fades out and stops every music source on the clock,
  including a no-drums loop that was only scheduled, clears the pending track and cancels
  an in-flight start. `showEnding()` calls it and then `playSfx("victory")` once, so after
  the sting nothing plays until Replay returns to the menu (`playMusic("menu")`). Nothing
  else in the engine restarts music on its own: there is no `ended` handler or timer that
  re-schedules a track.
- `GAMES_WITH_OWN_AUDIO` silences the music bus while a game that plays audio outside this
  engine runs (`setMusicSuppressed(true)`) and restores it afterwards without restarting
  the stage track. It is empty now: G4's music comes from the engine.
- `stopMusic()` / `resetRun()` fade everything out; the next `playMusic("g4")` plays the
  intro again. Call `resetRun()` when a new playthrough starts (today a new run is a page
  reload, which resets audio anyway).

## The G4 handoff and loop constants (130 BPM)

```
one beat = 60 / 130 = 0.4615 s
one bar  = 4 beats  = 1.8462 s
4 bars   = 7.3846 s
```

Both C1 files are 7.44 s long; measured with ffmpeg they carry ~22 ms of leading and
~31 ms of trailing encoder silence (`c1.mp3` starts on a hit, so only its tail is
silent). `detectEdgeSilence` finds the first and last sample above `SILENCE_THRESHOLD`
(0.004 ≈ −48 dB) in the decoded buffer, then `computeLoopPoints` sets:

- `loopStart` = leading silence (+ `C1_LOOP_START_OFFSET_MS`)
- `loopEnd` = `loopStart` + `C1_BARS` × bar (+ `C1_LOOP_END_OFFSET_MS`), clamped to the
  buffer length

For stage C1 the `c1` source simply loops between those whole-bar points. For `g4` the
intro source starts at `t0` from its `loopStart` and is stopped at
`t0 + (loopEnd − loopStart)` = exactly 4 bars later; the no-drums source is scheduled with
`start(thatSameTime, itsLoopStart)` on the AudioContext clock, so it begins on the sample
the intro ends, with no `ended` event or timer involved. It then loops between its own
whole-bar points. Both keys point at the same `c1.mp3`, which is fetched and decoded once.
Constants to tune by ear, all in `engine.ts`: `C1_BPM` (130), `C1_BARS` (4),
`C1_LOOP_START_OFFSET_MS` (0), `C1_LOOP_END_OFFSET_MS` (0), `SILENCE_THRESHOLD`. Tracks
without a known BPM (`c2`–`c4`, `menu`, `boss`) loop from the first to the last audible
sample.

### The beat clock

`audio.getBeatClock()` returns the number of beats (fractional) since the first downbeat of
the track that is currently playing, or `null` when nothing is playing, before unlock, or
when the track has no known BPM. It is computed on the AudioContext clock as
`(currentTime − outputLatency − t0) / (60 / bpm)`, where `t0` is the context time at which
the voice's `loopStart` sample (the first downbeat after silence trimming) was scheduled,
and `outputLatency` is the context's reported output latency when the browser provides it.
So beat 0 is the first downbeat of `c1.mp3`, beat 16 is the exact handoff sample, and the
count keeps running through the no-drums loop on the same grid: the handoff and the loop
are both whole bars. A retry does not change `t0` (the track is not restarted), and during
a crossfade the clock follows the incoming track. G4 feeds this value to its pure logic
every frame and on every press (`src/minigames/g4-rhythm/README.md`); it never imports
audio into its logic. For stage C1 the value is also defined (the `c1` loop is 130 BPM)
but nothing reads it.

## Controller hooks (`src/main.ts`, marked `// [audio]`)

1. `import { audio, trackForMinigame, trackForScene, GAMES_WITH_OWN_AUDIO, MINIGAME_TRACKS, MUSIC_DUCK_FOR_VICTORY } from './audio'`
2. `showMainMenu()`: `audio.playMusic('menu'); audio.unlock()` as soon as the menu opens;
   the menu's LEFT button calls `audio.setMusicEnabled()` (initial value from
   `audio.isMusicEnabled()`), and the scene polls `audio.outputState()` so that, while the
   browser still blocks audio, the first LEFT press turns the music on instead of off.
   RIGHT starts the run; `startGame()`'s `playMusic` crossfades out of the menu track.
3. `startGame()`: `audio.playMusic(trackForMinigame(gameId, E-game ? end : stage, MINIGAME_TRACKS))`
   (the stage track, or `g4` for G4) and `audio.setMusicSuppressed(GAMES_WITH_OWN_AUDIO.has(gameId))`
4. `handleGameComplete()` (stages): `audio.playMusic(trackForScene(stage))`, which crossfades
   out of `g4` after G4 and is a no-op after any other game
5. `showEnding()`: `audio.stopMusic(); audio.playSfx('victory')`, then silence; Replay
   (either button, after the sting) calls `showMainMenu()`
6. `handleButtonPress()`: `audio.unlock()` (every LEFT/RIGHT input; retries while blocked)
7. `init()`: `void audio.preload()`

## Hooking up later

- **Main menu:** wired (hook 2), including Replay from the ending (hook 5).
- **Boss fight:** `creepy sounds.mp3` is the only boss file present (there is no audio in
  `assets/scenes/`). At 26 s of continuous texture it is an ambience, so it is registered
  as the looping music key `boss`; there is no separate stinger file. When the boss is
  wired after the PIN door: `audio.playMusic("boss")` on entering the tunnel (crossfades
  from `c4`), `audio.playMusic(trackForScene({ kind: "end" }))` or `stopMusic()` on
  escape.
- **Game over**: `game over music.mp3` (69.1 s) plays when a minigame fails, looping until
  the game restarts.

## Tests

```sh
./chicken-cross/node_modules/.bin/vitest run src/audio
```

The root project has no test runner, so the suite runs under the Vitest installed in
`chicken-cross/`; `vitest-shim.d.ts` keeps the root `tsc` green (delete it when Vitest is
a root dependency). The fake backend records every source start/stop time and gain ramp
on a fake clock. Covered: the scene → track map (menu, C1–C4, end stage, hub rule, boss)
and the G4 override; silence detection and whole-bar loop points; nothing plays before
unlock and the pending track starts on unlock; stage C1 with a non-G4 game loops `c1` and
never schedules the no-drums track; G4 in any stage plays the intro once with the
no-drums loop scheduled at the intro's exact end, a G4 retry never restarts it or replays
the intro, and leaving G4 crossfades back to the stage track; the beat clock (null without
music or BPM, counts from the intro's first downbeat and across the handoff, unchanged by
a retry, output-latency corrected, follows the incoming track); the same track is never
restarted; C4 → end stage does not restart; crossfade ramps and exactly one active track
afterwards; reset then G4 plays the intro again; ducking; one-shots; failed loads and a
missing Web Audio implementation never throw.

Also covered: the menu track loops and `outputState()`; with autoplay blocked a later
`unlock()` (the first press) resumes the context without restarting the track; a backend
without audio reports `unavailable`; menu → first stage crossfades with no overlap after;
the music toggle (music bus only, short fade, no restart, composes with ducking, persists
across scene changes, restored from and reported to storage); the ending stops music and
ambience including a scheduled loop, plays the sting once and starts or schedules nothing
over a long simulated period; Replay then starts the menu track again.

The G4 and main-menu tests live next to their scenes:

```sh
./chicken-cross/node_modules/.bin/vitest run src/minigames/g4-rhythm src/scenes/main-menu
```
