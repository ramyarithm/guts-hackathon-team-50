# G4 — Rhythm Game

One-button rhythm game: press LEFT on the beat. RIGHT is inactive. `inputCount: 1`.

| File | Role |
| --- | --- |
| `logic.ts` | Pure state machine and timing. No DOM, no audio. |
| `render.ts` | Canvas drawing: beat pulse, tracker bar, hit ratings, HUD. |
| `index.ts` | Adapter: canvas, frame loop, button input, and the bridge to the audio engine's beat clock. |
| `logic.test.ts` | Timing tests (`./chicken-cross/node_modules/.bin/vitest run src/minigames/g4-rhythm`). |

## Phases, labels and contract

`READY` (Start) → `INTRO` (Listen...) → `PLAYING` (Beat!) → `SUCCESS` (—) or `FAILED` (Retry).
`onComplete` fires once, 1 s into `SUCCESS`; `onFail` fires 1 s into `FAILED` and the
controller restarts the game. Unchanged.

## Music

G4 plays no audio of its own any more. The controller plays G4's track through the shared
audio engine when the game starts, whichever stage it is in: `c1.mp3` (130 BPM, with
drums) once as an intro, then `c1(no drums).mp3` looping seamlessly. When G4 completes,
the controller crossfades back to the stage's normal track. A retry restarts the game,
not the music: the no-drums loop keeps going and the intro is not replayed. See
`src/audio/README.md`.

## Tempo and the beat grid (130 BPM)

```
BPM            = 130        one beat = 60000 / 130 ≈ 461.5 ms
BEATS_PER_BAR  = 4          one bar  ≈ 1846 ms
INTRO_BEATS    = 12         minimum listen-in after Start (3 bars, ≈ 5.5 s)
GAME_BEATS     = 64         cues to tap once PLAYING starts (16 bars, ≈ 29.5 s)
AUDIO_LATENCY_OFFSET_MS = 0 manual calibration, see below
```

All timing is measured on a clock in beats, `state.clockBeat`:

- **Music clock.** Each frame and on each press the adapter passes
  `audio.getBeatClock()` (beats since the first downbeat of `c1.mp3`, on the AudioContext
  clock, corrected for the context's reported output latency) into `tick()` / `press()`.
  Game time (`state.timeMs`) is derived from it, so cues and hit judgement cannot drift
  from the music. The engine's intro → no-drums handoff lands on beat 16, on the same
  grid, so nothing changes for the game at the handoff.
- **Fallback.** If there is no beat clock (audio unavailable, not yet unlocked, or no music
  playing), the logic runs its own 130 BPM clock from simulation time. Rules, windows and
  lengths are identical; there is just no sound. If the music clock appears during the
  listen-in (the Start press is also the press that unlocks audio in a fresh run), game
  time stays continuous and the chart is re-laid on the music's bars.
- **Alignment.** When Start is pressed, `startBeat` is the current clock beat. PLAYING
  begins on the first bar line at least `INTRO_BEATS` later, and from there one cue per
  beat for `GAME_BEATS`. The listen-in therefore lasts 12–15 beats depending on where in
  the bar Start was pressed. A retry does the same on the clock that is already running,
  so the pattern restarts on the next bar of the music that is still playing.
- **Hit windows** are unchanged: PERFECT ±50 ms, GREAT ±100 ms, GOOD ±150 ms, OK ±200 ms,
  MISS beyond that; a missed cue counts as SKIP after a 1 s grace period.
- **Calibration.** `AUDIO_LATENCY_OFFSET_MS` is subtracted from the music clock by the
  adapter. Raise it if hits that sound on-beat are judged late; the engine already removes
  `AudioContext.outputLatency` where the browser reports it.
