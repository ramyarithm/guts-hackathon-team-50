# Technical specification

Team 50 — gameplay, integration and scope requirements.

> Language-neutral interface, illustrated with JavaScript-shaped pseudocode. Adapt the syntax to the team's chosen stack; agree changes before merging. The shared controller owns rewards, narrative and progression. Minigames own their internal mechanics.

This file is **technical only**. Premise, stage narratives and dialogue live in [STORY.md](STORY.md).

**Required game:** intro → four random levels → PIN door → boss → escape ending.
**Controls:** two hardware buttons (LEFT and RIGHT); each game binds one or both, and must display what they currently do.

## Claim a task

Edit the Owner and Status columns when claiming work. Puzzle mechanics and solutions belong to each challenge's developer; none are prescribed here.

**Before anyone can playtest, at least one slot must be a one-button game.** A run is invalid with zero ready one-button games, because the opening level always uses one button. If everyone claims two-button games by default, nobody can run the game. Claim a one-button slot early. Suggested one-button designs: a flappy-bird style game, a cross-the-road game, or a rhythm game.

| ID | Task | Owner | Status | Required output |
| --- | --- | --- | --- | --- |
| G1 | Signal Relay — flappy-bird style pulse game | Implemented | Ready | 2-button adapter; completion event |
| G2 | Lane Crossing — frogger-style crossing | Implemented | Ready | 2-button adapter; completion event |
| G3 | Core Defrag — tetris-style block stacking | Implemented | Ready | 2-button adapter; completion event |
| G4 | Rhythm Game — tap to the beat | Implemented | Ready | 1-button adapter; completion event |
| G5 | Minigame placeholder 5 — design open | Unclaimed | Not started | Adapter with declared `inputCount`; completion event |
| G6 | Pressure Valves — balance two tanks | Implemented | Ready | 2-button adapter; completion event |
| G7 | Minigame placeholder 7 — design open | Unclaimed | Not started | Adapter with declared `inputCount`; completion event |
| G8 | Shelf Shuffle — seeded two-shelf matching puzzle | Codex / mk | Ready | 2-button adapter; 24 objects; eight matches; tested controller completion and cleanup |
| E1 | Ending minigame 1 — PIN entry variant | Unclaimed | Not started | PIN entry adapter; validates against pinDigits |
| E2 | Ending minigame 2 — PIN entry variant | Unclaimed | Not started | PIN entry adapter; validates against pinDigits |
| CORE | Main scene, shared state, intro, PIN door and ending | In progress | Partial | Run plan generation done; PIN entry phase placeholder |
| BOSS | Final difficult level after PIN entry | Unclaimed | Not started | Fixed adapter; never drawn from the random pool |

## 1. Seeded randomness

All run randomness comes from a **seeded PRNG**. Never call `Math.random()` for anything that affects a run.

- The seed lives in shared state and is generated once per run.
- **Same seed + same ready pool → identical selection.** This is a testable guarantee, not a convenience.
- Retries and scene changes **never** re-roll. Consume the seed only when building the run plan.
- Use a deterministic PRNG with an explicit seed, e.g. a small xorshift, mulberry32 or sfc32 implementation, not the platform's global RNG.

### Dev hook

The seed is internal; it is not displayed to players. Provide a development-only way to **read the current seed** and **force a specific seed**, so a run can be reproduced exactly while debugging or verifying the acceptance checklist. Guard it behind development mode and remove it, or make it inert, in the judged build.

### Known caveat

Reproducibility holds for a **fixed ready pool**. If a game is added to or removed from the pool, the same seed can resolve to a different selection. This is expected behaviour, not a bug — do not "fix" it by caching selections across pool changes.

## 2. Randomised level pool

Build **up to seven minigames** (four to seven ready games for the full prototype). At the start of each new run, select **four distinct games without replacement** and assign them to the four narrative stages.

- A new run makes a fresh random selection and order. The same result can legitimately occur by chance.
- Retries and scene changes **never** reshuffle the current run.
- Unfinished games are excluded from the pool.
- The team can ship with fewer than seven games once four are ready.

### The opening level is always one-button

Slot 1 (stage C1) **must** be a one-button game. It introduces the controls and gets the player started. The remaining three are drawn from the whole ready pool and may be one-button or two-button.

Selection is therefore constrained, not a plain shuffle:

```js
seededRunPlan(seed, readyGames, gamesPerRun = 4) {
  const rng = seededPrng(seed);
  const oneButton = shuffleWith(readyGames.filter(g => g.inputCount === 1), rng);
  const first = oneButton[0];                       // opening level: always one-button
  const rest = shuffleWith(
    readyGames.filter(g => g.id !== first.id), rng
  ).slice(0, gamesPerRun - 1);                      // slots 2–4: anything ready
  return [first, ...rest];
}
// Guard: bail with a development message if readyGames.length < 4
//   or if no ready game has inputCount === 1.
```

### Readiness guards

- Fewer than four ready games, **or** zero ready one-button games → show a clear development message rather than silently repeating games or producing an unwinnable run. Debug placeholders may be used only in development.
- If only four games are ready, use all four; slot 1 is still drawn from the one-button subset.
- The opening-level rule is the **one exception** to stage/game independence: C1 is always served by a one-button game. Every other stage accepts any ready game.

## 3. Single configuration source

Create one shared configuration module during implementation. The values below are its specification, not a second runtime source:

```js
GAME_CONFIG = {
  stageOrder: ["C1", "C2", "C3", "C4"],
  gamesPerRun: 4,
  seed: generateSeed(),        // once per run; dev hook may override
  minigamePool: [
    // registry entries for G1–G7:
    // { id: "G1", ready: false, inputCount: 1 | 2, adapter }
  ],
  boss: { id: "BOSS", ready: false, inputCount: 1 | 2, adapter },
  pinDigits: ["7", "3", "1", "9"]
};
// Derive the expected PIN by joining pinDigits.
// Derive each reward from the stage's index in stageOrder.
// Never duplicate the PIN in minigames or door logic.
```

`pinDigits` is the **only** place digit values exist. Narrative copy refers to PIN positions 1–4 and never states a digit. Changing this array must change both the rewards shown and the door's validation.

`inputCount` is declared per registry entry at registration time, not discovered at runtime. The selection algorithm partitions the pool by this field, so it must be correct before the game is marked ready.

The boss is a **fixed** entry, separate from `minigamePool`. It is never drawn by the random selection.

## 4. Shared state

```js
progress = {
  runId: uniqueRunId(),
  seed: GAME_CONFIG.seed,
  selectedGameIds: seededRunPlan(progress.seed, readyGames(), GAME_CONFIG.gamesPerRun),
  completed: { C1: false, C2: false, C3: false, C4: false },
  storyUnlocked: { C1: false, C2: false, C3: false, C4: false },
  bossComplete: false
};
// Pair selectedGameIds[i] with stageOrder[i]; keep this mapping for the entire run.
// selectedGameIds[0] is always a one-button game.
// Validate readiness before building the plan (see §2 readiness guards).
// Collected digits are derived from completed + GAME_CONFIG.
// Shared state survives scene changes for the whole playthrough.
// Saving across browser reloads is optional; scene persistence is required.
```

## 5. Shared flow

1. Create and retain a random four-game run plan from the ready pool, then show the intro scene.
2. Main scene: play stages in C1 → C2 → C3 → C4 order.
3. **C1**: Run a randomly selected **one-button game** (introduces controls).
4. **C2–C4**: Run randomly selected **two-button games** (no repeats within a run).
5. On each stage's first successful completion, save completion, reveal its assigned PIN digit.
6. After all four stages are complete, transition to the **PIN entry phase**.
7. Run an ending minigame (E1 or E2) where the player enters the collected 4-digit PIN.
8. Correct PIN entry triggers the escape ending (or boss, if implemented).

### Stage game selection

```js
generateRunPlan(seed, readyGames) {
  const rng = seededPrng(seed);
  const oneButton = shuffle(readyGames.filter(g => g.inputCount === 1), rng);
  const twoButton = shuffle(readyGames.filter(g => g.inputCount === 2), rng);
  
  return [
    oneButton[0].id,   // C1: always one-button
    twoButton[0].id,   // C2: two-button
    twoButton[1].id,   // C3: two-button
    twoButton[2].id,   // C4: two-button
  ];
}
// Guards: need at least 1 one-button game and 3 two-button games.
```

### Persistent progress display

Show four labelled positions throughout the main scene and PIN sequence:

| Position | Earned from | Prototype digit source |
| --- | --- | --- |
| 1 | C1 | `pinDigits[0]` |
| 2 | C2 | `pinDigits[1]` |
| 3 | C3 | `pinDigits[2]` |
| 4 | C4 | `pinDigits[3]` |

An unearned position displays “?”. Digits occupy their assigned position, never completion order. Players should not need to memorise digits. Retain earned digits and completion flags when entering, leaving or returning to scenes; a failed attempt must not erase progress.

## 6. Minigame interface

```js
startMinigame({
  gameId,          // G1–G7
  stageId,         // C1–C4, assigned by controller
  runId,           // identifies this playthrough
  setControlLabels, // ({ left: "...", right: "..." })
  onComplete       // () => controller callback bound to run, stage and game
});

handleInput(button); // button is exactly "LEFT" or "RIGHT"
dispose();           // remove listeners, timers and animations on scene exit
```

- Each owner exports an adapter for their G1–G7 minigame ID, plus its declared `inputCount`. A game must work at any narrative stage and must not hard-code a story reveal, PIN digit or stage.
- Publish only the current scene's input handler; prevent old handlers from consuming inputs.
- Report completion **once** per playthrough. A puzzle retry must not call completion until it succeeds.
- The controller validates the run ID and assigned stage/game pair, rejects inactive or stale callbacks, and ignores duplicate completion calls.
- On first completion, the controller marks that ID complete, unlocks its reveal, derives its digit from configuration and displays the reward.
- Completed challenges open their existing reveal when revisited; they never award another digit or reset.
- The controller alone decides when the door unlocks and when endings trigger.

### Controller behaviour

```js
completeStage(runId, stageId, gameId) {
  if (runId !== progress.runId) return;
  if (!isActiveAssignedPair(stageId, gameId)) return;
  if (progress.completed[stageId]) return;
  progress.completed[stageId] = true;
  progress.storyUnlocked[stageId] = true;
  showStoryAndReward(stageId, configuredDigitFor(stageId));
  // Door availability is derived from all four completed stage flags.
}
```

## 7. Button controls

There are **two hardware buttons**, LEFT and RIGHT. Every scene displays what they currently do. Do not introduce a third confirm, back, continue or attack input.

Each game declares `inputCount: 1 | 2` at registration:

- **Two-button game** binds both. Both labels are meaningful.
- **One-button game** binds one. The unused button must still be displayed and must be **visibly inactive** — disabled or greyed out, not blank and not silently ignored. Pressing it does nothing.

Shared scenes (intro, main scene, PIN entry, ending, boss) use both buttons regardless of any game's `inputCount`.

Suggested shared navigation defaults:

| Scene | LEFT | RIGHT |
| --- | --- | --- |
| Intro / story reveal | Previous text page, if any | Next page / continue |
| Main station selection | Cycle available stations and completed reveals; include the door when unlocked | Open selection |
| Minigame (inputCount 2) | Defined and labelled by its owner | Defined and labelled by its owner |
| Minigame (inputCount 1) | Defined and labelled by its owner | **Inactive** |
| Boss | Defined and labelled by its owner | Per the boss's declared `inputCount` |
| PIN entry | Cycle current digit 0–9, wrapping to 0 | Confirm digit and advance |
| Ending | Replay / restart choice | Confirm choice |

Minigames automatically return to the stage reveal after success, then to the main scene through the same button UI. If an owner adds retry or exit, it must also use these buttons and keep the current labels clear.

## 8. PIN door

- Keep the door unavailable until all four challenge IDs are complete.
- Use **7319** for the prototype, derived from `GAME_CONFIG.pinDigits` — do not hard-code it in door logic.
- Start with position 1 selected and its entry value at 0.
- LEFT increases the current entry digit by one, wrapping 9 → 0.
- RIGHT confirms that digit and advances; confirming position 4 submits the full four-digit entry.
- Display the active entry position and all collected digit labels.
- An incorrect entry shows clear feedback, resets entry to position 1 with all entry digits at 0, and permits another attempt.
- Incorrect entry never clears challenge progress, collected digits or story reveals.
- The correct entry opens the security door and transitions to the tunnel.

## 9. Placeholder handoff

The seven independent minigame placeholders are **G1, G2, G3, G4, G5, G6 and G7**. Each has no prescribed mechanics or solution. Implement four to seven as time allows; mark registry entries ready only when their adapters work. C1–C4 remain narrative slots populated from that ready pool.

A development placeholder displays “Minigame not implemented yet” plus current control labels. For integration testing only, RIGHT may simulate completion and LEFT may return to the main scene. Clearly mark this debug bypass and disable it in the judged build. Never select an unfinished placeholder in a production run.

Owners should share their adapter name, control labels, entry/exit behaviour and completion signal with the core integrator before merging. They must not modify another slot or the central configuration to make their puzzle work.

## 10. Ending Minigames (E1/E2)

After all four stages are complete, the player enters the **PIN entry phase** using one of two ending minigames: **E1** or **E2**. These are separate from the G1–G7 pool and are never drawn during stages C1–C4.

### Purpose

The ending minigames provide a final challenge where the player must enter the collected 4-digit PIN. Unlike the stage minigames which test reflexes or puzzle-solving, the ending minigames test the player's memory of the PIN they collected.

### Selection

- E1 and E2 are **not** part of the random selection pool.
- The controller chooses one (E1 or E2) after C4 completes.
- Both must be implemented before the ending is playable.

### Interface

Ending minigames use the same `MinigameAdapter` interface as stage minigames:

```js
startMinigame({
  gameId,          // "E1" or "E2"
  stageId,         // "PIN" (special stage for ending)
  runId,           // same run as stages
  setControlLabels,
  onComplete       // called when PIN is entered correctly
});
```

### Completion

- `onComplete` is called when the player successfully enters the correct PIN.
- Incorrect entries should provide feedback but allow retry.
- The ending minigame has access to `GAME_CONFIG.pinDigits` to validate entry.

### Design guidelines

- E1 and E2 should have **different mechanics** for entering the PIN.
- Both must use only LEFT and RIGHT buttons.
- The player should see the collected digits displayed somewhere during entry.
- Example mechanics:
  - **Dial-style**: LEFT/RIGHT cycle through digits, confirm each position
  - **Memory sequence**: Replay the digits in order with timing
  - **Pattern matching**: Select correct digits from moving options

## 11. Boss (Post-PIN)

The boss is a **fixed, more difficult level** reached after the PIN is entered correctly. It is not drawn from the random pool.

- Declared as its own config entry with its own adapter and its own declared `inputCount`.
- Never selected by `seededRunPlan`, and never affects the four-stage selection.
- Mechanics and win condition remain open for the team.
- Its button labels must be displayed like any other scene, with any unused button visibly inactive.
- Retry must preserve all four repairs, digits and story reveals.
- The core game cannot reach the ending without clearing it.
- **Design gap:** the boss has no narrative beat yet. Placeholder in [STORY.md](STORY.md) until the team writes it.

## 11. Integration acceptance checklist

- [ ] G1–G7 have clear ownership/status; only ready games are eligible.
- [ ] Each new run selects four distinct games from the four-to-seven ready pool.
- [ ] Slot 1 is always a one-button game; slots 2–4 may be either kind.
- [ ] Zero ready one-button games, or fewer than four ready, produces a clear development message.
- [ ] The same seed with an unchanged ready pool produces an identical selection.
- [ ] Randomness comes from a seeded PRNG; no `Math.random()` affects a run.
- [ ] Retries and scene changes never re-roll the selection.
- [ ] Every selected game can work at any stage without hard-coded rewards.
- [ ] Each game declares `inputCount` at registration, and it matches its actual controls.
- [ ] A one-button game displays its unused button as visibly inactive.
- [ ] No scene introduces a third input beyond LEFT and RIGHT.
- [ ] Completing C1/C2/C3/C4 awards positions 1/2/3/4 respectively.
- [ ] Collected digits stay visible and labelled; unearned positions show “?”.
- [ ] Duplicate, stale-run and wrong-stage/game completion callbacks do not award rewards.
- [ ] Revisiting a completed station preserves completion and does not re-award a digit.
- [ ] Leaving and returning to scenes preserves progress.
- [ ] Door remains locked until all four challenges are complete.
- [ ] PIN entry uses LEFT to cycle and RIGHT to confirm.
- [ ] Wrong PIN resets entry only and allows retry.
- [ ] Correct PIN opens the tunnel and leads to the boss.
- [ ] The boss is fixed, never drawn from the random pool, and retry preserves all progress.
- [ ] Clearing the boss shows the ending; the ending is unreachable without clearing it.
- [ ] Changing `GAME_CONFIG.pinDigits` changes both rewards and door validation.
- [ ] Seed dev hook and debug completion bypasses are disabled before the judged demo.

## 12. Open questions

- **Station selection vs. sequential unlock.** §5 describes selecting a station from four, but also specifies strict C1 → C2 → C3 → C4 unlock. Under strict sequential unlock only one station is selectable at a time, making selection trivial. This spec follows the sequential reading. Confirm before implementing, or change the unlock rule deliberately.
- **Boss narrative.** No story beat written yet. Placeholder only.
- **Boss button count.** Not decided; the boss owner declares `inputCount` when building it.
