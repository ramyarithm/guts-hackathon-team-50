# E1 — Vault Door (the PIN door ending)

E1 is the **ending door**, not a stage minigame. Once all four stages are complete the
controller opens this scene and the player enters the four-digit code recovered from the
repairs on the vault dial. A correct code opens the vault and the controller continues to
the tunnel. **A wrong code ends the run**: this deliberately replaces the "wrong entry
resets and can be retried" rule in STORY.md §5. There is one attempt.

| File | Role |
| --- | --- |
| `logic.ts` | Pure state and rules: dial, positions, submit via `checkPin`, denied flash → failure, opening timer. No DOM, no PIN. |
| `render.ts` | Canvas drawing: wall, door leaf, 10-position dial, entry slots, status row (lamp, LOCKED/DENIED/OPEN, handle), denied shake, opening animation. |
| `index.ts` | Adapter: canvas, frame loop, button input, registry entry (`pool: false`). |
| `logic.test.ts`, `pool.test.ts` | Tests (`./chicken-cross/node_modules/.bin/vitest run src/minigames/e1-vault-lock`). |

## Controls (two buttons)

| State | LEFT | RIGHT |
| --- | --- | --- |
| ENTERING, positions 1–3 | Turn dial | Set digit |
| ENTERING, position 4 | Turn dial | Open vault |
| DENIED (run over) | — | — |
| OPENING | — | — |

- LEFT turns the dial one step: the current digit goes up by one and 9 wraps to 0, with an
  eased 80 ms rotation; one press is buffered during a rotation, further presses are
  dropped. Each step clicks (cosmetic).
- RIGHT sets the current digit and moves to the next position, which starts at 0. On
  position 4 it submits the full entry.
- Entry starts at position 1 with a value of 0. `setControlLabels` is called on every
  state or position change. Input only via `handleInput`.

## Interface with the controller

E1 **never stores or compares the PIN**. The controller passes:

```ts
adapter.startMinigame({
  ...sharedArgs,                       // gameId, stageId, runId, setControlLabels, onComplete, onFail, container
  checkPin: (entry: string) => boolean, // the controller validates against its PIN (runPlan.pinDigits)
});
```

- On submit, E1 calls `checkPin(entry)` once with the four entered digits as a string and
  shows the result. Changing the controller's PIN changes what opens the door, with no
  edits here. (The recovered digits are shown by the persistent progress display above
  the screen, so E1 no longer takes a `collectedDigits` argument.)
- `onComplete` fires exactly once, after a correct entry and the opening animation
  (`OPENING_MS`, 1.6 s: the handle spins, then the door swings open under "Vault open").
- `onFail` fires exactly once, after a wrong entry and the "ACCESS DENIED" flash
  (`DENIED_MS`, 0.5 s). Only one of `onComplete` / `onFail` ever fires, and no input is
  accepted after a submit either way.
- Without `checkPin` (e.g. started from the debug bar without a run) every entry is
  denied and a warning is logged.
- `dispose()` cleans up the canvas, observers and frame loop; calling it twice is safe.

## Flow

1. All four stages complete → the controller starts the PIN entry phase and shows the
   vault (`startGame('E1')` with the arguments above).
2. The player enters the four digits. The recovered digits are on the progress display
   above the screen; the four **entry slots** under the dial show the entry with the
   active position highlighted (entered digits, the live digit, then `_`).
3. Correct: green lamp, handle spins, door swings open, "Vault open", then `onComplete` →
   the controller plays the door frames and continues to the tunnel.
4. Wrong: red flash and shake, "ACCESS DENIED", then `onFail` → the controller shows its
   usual Game Over screen (the same one used when the lives run out), with Restart and
   Main menu.

## Visuals

Bunker style shared with the other games: concrete wall, steel door leaf on a left hinge,
knurled dial with digits 0–9 (the current digit under the amber indicator), the entry
slots below it, and a status row along the bottom of the door: lamp at the left, the
status text (amber LOCKED / red DENIED / green OPEN) centred on the door, handle at the
right. CRT scanlines and vignette. The scene fills the
same play area as every other scene (`src/scenes/viewport.ts`).
