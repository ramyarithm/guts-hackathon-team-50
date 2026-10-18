# Dialogue (DEAD SIGNAL)

The visual-novel layer for `assets/Dialogue/dialogue.json`. The JSON is imported as is
(never edited here) and validated at load; a malformed section or line logs a warning and
is skipped. All text is rendered with `textContent`.

| File | Role |
| --- | --- |
| `script.ts` | Load and validate the JSON: `loadScript`, `getSection`, `tunnelLine`, `TUNNEL_TRIGGERS`. |
| `player.ts` | Pure player: items (lines, digit card), typewriter with delivery pauses, two-button rules. |
| `flow.ts` | Which lines play at each moment (`meta.dialogue_flow`). Pure; digits come from the controller. |
| `subtitles.ts` | Pure queue for the tunnel subtitles (once per trigger, queued, auto-hide). |
| `index.ts` | DOM: the dialogue scene (phone screen) and the tunnel subtitle overlay; the loaded `script`. |
| `*.test.ts` | `./chicken-cross/node_modules/.bin/vitest run src/dialogue` |

## Flow (controller `src/main.ts`, in the JSON's listed order, never shuffled)

| Moment | Section |
| --- | --- |
| Start on the main menu, before the first station | `stages.intro` |
| A minigame succeeds (after it signals completion and is disposed) | `minigame_reactions[gameId].lines`, then the completed stage's `c1_complete` … `c4_complete` (by completion order, never by game), then the **digit card** |
| After the digit card | the next bunker background and station (existing progression), or the door after C4 |
| The door, before the lock appears | `stages.pin_entry` |
| Correct PIN, after the vault opens | `stages.pin_success`, then the door frames and the tunnel |
| Tunnel | `stages.tunnel` as subtitles, by event (below) |
| The surface | `stages.ending` (replaces the old "ESCAPED!" card), then Replay |

`stages.pin_wrong` is not wired: a wrong PIN is instant game over. A game without a
reaction entry goes straight to the story. `itemsForStageStory` builds a stage's story and
digit card again for revisiting a station (no reaction, nothing awarded); there is no hub
scene yet to call it from.

## The box

At the bottom of the phone screen, translucent with scanlines, sized by the shared layout.

| Speaker | Plate | Text |
| --- | --- | --- |
| `ENGINEER` | amber "ENGINEER" | normal |
| `SUPERVISOR` | green "◉ CONTROL — INTERCOM" | faint static flicker, green glow |
| `COLLEAGUE_RECORDING` | grey "▮▮▯ ARCHIVED RECORDING" | italic, desaturated |
| `SYSTEM` | none | centred, larger, slow fade-in |

Typewriter at `CHARS_PER_SECOND` (45) with `ELLIPSIS_PAUSE_MS` (400) after "…" / "..."
and `FULL_STOP_PAUSE_MS` (180) after ". ? !". A "▶" pulses once the line is fully shown.

## Controls

| State | LEFT | RIGHT |
| --- | --- | --- |
| Line typing | Back | Skip (finish instantly) |
| Line shown | Back | Next, or Continue on the last item |
| Digit card | Back (to the last story line) | Continue |

Back shows the previous line in full and never leaves the section; on the first line it
does nothing. A second RIGHT press inside `DOUBLE_PRESS_GUARD_MS` (160) is ignored.

## Digit card

"DIGIT RECOVERED", the position, the digit and the four slots ("?" for unearned), all
passed in by the controller from its run state, so it always matches the progress display.

## Tunnel events

The boss fight (`src/minigames/boss-tunnel`) takes an optional `onEvent(name)` and emits
each once per attempt: `tunnel_enter` (on start), `monster_first_detected` (the light first
shows the tunnel), `monster_reacts_to_flashlight` (the light has been on half its limit),
`light_mechanic_revealed` (the light goes off again, or the first move). Subtitles show
over the boss canvas for `SUBTITLE_HOLD_MS` (3500), queue if two fire close together, take
no input and never pause the game.
