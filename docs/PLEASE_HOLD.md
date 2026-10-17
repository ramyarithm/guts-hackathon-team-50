# Please Hold
## Team 50 — story, scope and integration guide

> A government telephone engineer enters an underground bunker to fix a communications fault. The door locks behind them. Four repairs reveal four PIN digits—and why they were sent here.

**Required game:** intro → four challenges → PIN door → escape ending.  
**Optional extension:** tunnel monster encounter after the door.  
**Controls:** exactly two gameplay buttons throughout; always display their current functions.

## Randomised minigame pool

Build **up to seven minigames** (four to seven ready games for the full prototype). At the start of each new run, shuffle the ready pool and select **four distinct games without replacement**. Assign them to the four narrative stages below. A new run makes a fresh random selection/order; the same result can legitimately occur by chance. Retries and scene changes never reshuffle the current run.

If only four games are ready, use all four in shuffled order. Unfinished games are excluded. If fewer than four are ready, show a clear development message rather than silently repeating games or producing an unwinnable run; debug placeholders may be used only in development. The team can ship with fewer than seven games once four are ready.

The **minigame identity is independent of the narrative stage**: any ready minigame can serve any stage. Story reveals and digits are awarded by stage, so random gameplay never breaks the story. The four-digit prototype PIN remains 7319; randomisation affects minigames, not the PIN.

## Claim a task

Edit the Owner and Status columns when claiming work. Puzzle mechanics and solutions belong to each challenge's developer; none are prescribed here.

| ID | Task | Owner | Status | Required output |
| --- | --- | --- | --- | --- |
| G1 | Minigame placeholder 1 — design open | Unclaimed | Not started | Two-button adapter; completion event; eligible when ready |
| G2 | Minigame placeholder 2 — design open | Unclaimed | Not started | Two-button adapter; completion event; eligible when ready |
| G3 | Minigame placeholder 3 — design open | Unclaimed | Not started | Two-button adapter; completion event; eligible when ready |
| G4 | Minigame placeholder 4 — design open | Unclaimed | Not started | Two-button adapter; completion event; eligible when ready |
| G5 | Minigame placeholder 5 — design open | Unclaimed | Not started | Two-button adapter; completion event; eligible when ready |
| G6 | Minigame placeholder 6 — design open | Unclaimed | Not started | Two-button adapter; completion event; eligible when ready |
| G7 | Minigame placeholder 7 — design open | Unclaimed | Not started | Two-button adapter; completion event; eligible when ready |
| CORE | Main scene, shared state, intro, PIN door and ending | Unclaimed | Not started | Complete playable flow joining all four slots |
| STRETCH | Tunnel monster | Unclaimed | Optional / deferred | Two-button encounter; only after core works |

## 1. Premise and intro — required

You are a government telephone engineer sent to repair a communications fault in an underground bunker. Shortly after you arrive, the security door locks and your supervisor calls:

> “Complete the repairs. Follow procedure. Do not access stored recordings.”

As you investigate, you discover the phones were deliberately sabotaged—and you were sent here because you know too much.

Show the locked door, the four story repair stations and the two current button functions. Explain that each repaired system reveals one fragment of the exit code. Keep narrative available as readable text; recorded dialogue can be implemented as text for the prototype.

## 2. Shared flow — required

1. Create and retain a random four-game run plan from the ready pool, then show the intro and supervisor call.
2. Main bunker scene: select one of four repair stations.
3. Run the selected minigame assigned to that narrative stage in this run.
4. On its first successful completion, save completion, reveal its assigned PIN digit and unlock its story.
5. Return to the main scene; completed stations remain completed. Repeat for the remaining stations.
6. After all four are complete, enable PIN entry at the security door.
7. Correct PIN opens the door into the escape tunnel.
8. With the optional encounter disabled, reaching the tunnel completes the game immediately.

For the prototype, unlock narrative stages in C1 → C2 → C3 → C4 order so the story is revealed coherently. Players can revisit completed story reveals without replaying challenges. This is a shared-flow default, not a prescription for puzzle mechanics.

### Persistent progress display

Show four labelled positions throughout the bunker and PIN sequence:

| Position | Earned from | Prototype digit |
| --- | --- | --- |
| 1 | C1 — Minister's Phone | 7 |
| 2 | C2 — Surveillance Phone | 3 |
| 3 | C3 — Engineer's Phone | 1 |
| 4 | C4 — Emergency Terminal | 9 |

An unearned position displays “?”. Digits occupy their assigned position, never completion order. Players should not need to memorise digits. Retain earned digits and completion flags when entering, leaving or returning to scenes; a failed attempt must not erase progress.

## 3. Four narrative stages — required

C1–C4 are fixed story stages, **not four fixed minigames**. Each receives one of G1–G7 selected for this run. All seven minigame slots have open mechanics and solutions; owners should make their game reusable at any stage.

### C1 — The Minister's Phone
**RANDOM MINIGAME SLOT — run the game assigned to this stage in the run plan. Mechanics remain open.**

Repair the first phone to recover an interrupted call. The recording reveals that the lockdown was authorised before you entered the bunker. Your arrival was expected.

- Story reveal: the trap was planned before your arrival.
- Reward: PIN position **1**, digit **7** from shared configuration.
- Shared controller supplies this stage's title and reveal; the assigned game supplies labelled two-button gameplay and a reliable success signal.
- Completion unlocks C2.

### C2 — The Surveillance Phone
**RANDOM MINIGAME SLOT — run the game assigned to this stage in the run plan. Mechanics remain open.**

Restore a surveillance line and uncover recordings showing that the bunker has been used to secretly monitor civilians. Your previous maintenance report flagged the suspicious system, making you a target.

- Story reveal: you exposed the surveillance system in a maintenance report.
- Reward: PIN position **2**, digit **3** from shared configuration.
- Shared controller supplies this stage's title and reveal; the assigned game supplies labelled two-button gameplay and a reliable success signal.
- Completion unlocks C3.

### C3 — The Engineer's Phone
**RANDOM MINIGAME SLOT — run the game assigned to this stage in the run plan. Mechanics remain open.**

Recover a message from a missing colleague:

> “They sent me down here too. Don’t trust the supervisor. The exit code is split across four systems.”

You also discover that your supervisor ordered your access records erased.

- Story reveal: a colleague suffered the same trap; the supervisor is covering their tracks.
- Reward: PIN position **3**, digit **1** from shared configuration.
- Shared controller supplies this stage's title and reveal; the assigned game supplies labelled two-button gameplay and a reliable success signal.
- Completion unlocks C4.

### C4 — The Emergency Terminal
**RANDOM MINIGAME SLOT — run the game assigned to this stage in the run plan. Mechanics remain open.**

Restore the bunker's emergency communications terminal. A final log confirms that the supervisor sabotaged the equipment to trap you and destroy the evidence. Your colleague left the last code fragment here before disappearing.

- Story reveal: direct confirmation of the supervisor's sabotage and motive.
- Reward: PIN position **4**, digit **9** from shared configuration.
- Shared controller supplies this stage's title and reveal; the assigned game supplies labelled two-button gameplay and a reliable success signal.
- Completion enables the PIN door.

## 4. Two-button controls — required

Every gameplay action must be reachable with only LEFT and RIGHT. Each scene displays what those buttons currently do. Do not introduce a third confirm, back, continue or attack input.

Suggested shared navigation defaults:

| Scene | LEFT | RIGHT |
| --- | --- | --- |
| Intro / story reveal | Previous text page, if any | Next page / continue |
| Bunker station selection | Cycle available stations and completed reveals; include the door when unlocked | Open selection |
| Minigame | Defined and labelled by its owner | Defined and labelled by its owner |
| PIN entry | Cycle current digit 0–9, wrapping to 0 | Confirm digit and advance |
| Ending | Replay / restart choice | Confirm choice |

Minigames automatically return to the story reveal after success, then to the bunker through the same two-button UI. If an owner adds retry or exit, it must also use these two buttons and keep the current labels clear.

## 5. PIN door — required

- Keep the door unavailable until all four challenge IDs are complete.
- Use **7319** for the prototype, derived from the shared configuration below.
- Start with position 1 selected and its entry value at 0.
- LEFT increases the current entry digit by one, wrapping 9 → 0.
- RIGHT confirms that digit and advances; confirming position 4 submits the full four-digit entry.
- Display the active entry position and all collected digit labels.
- An incorrect entry shows clear feedback, resets entry to position 1 with all entry digits at 0, and permits another attempt.
- Incorrect entry never clears challenge progress, collected digits or story reveals.
- The correct entry opens the security door and transitions to the tunnel.

## 6. Core ending — required

For the required version, reaching the tunnel means you escape with the recovered evidence. No further challenge is needed.

Display:

> “You are out. Now make sure the truth gets out too.”

The required version must be complete and demonstrable with the monster feature disabled.

## 7. Simple integration contract — required

This is a language-neutral interface illustrated with JavaScript-shaped pseudocode. Adapt the syntax to the team's chosen stack; agree changes before merging. The shared controller owns rewards, narrative and progression. Minigames own their internal mechanics.

### Single configuration source

Create one shared configuration module during implementation. The values below are its specification, not a second runtime source:

```js
GAME_CONFIG = {
  stageOrder: ["C1", "C2", "C3", "C4"],
  gamesPerRun: 4,
  minigamePool: [ /* registry entries for G1–G7: id, ready, adapter */ ],
  pinDigits: ["7", "3", "1", "9"],
  monsterEnabled: false
};
// Derive the expected PIN by joining pinDigits.
// Derive each reward from the stage's index in stageOrder.
// Never duplicate the PIN in minigames or door logic.
```

### Shared state

```js
progress = {
  runId: uniqueRunId(),
  selectedGameIds: shuffle(readyPoolIds).slice(0, GAME_CONFIG.gamesPerRun),
  completed: { C1: false, C2: false, C3: false, C4: false },
  storyUnlocked: { C1: false, C2: false, C3: false, C4: false }
};
// Pair selectedGameIds[i] with stageOrder[i]; keep this mapping for the entire run.
// Choose only after validating at least four distinct games are ready.
// Collected digits are derived from completed + GAME_CONFIG.
// Shared state survives scene changes for the whole playthrough.
// Saving across browser reloads is optional; scene persistence is required.
```

### Minigame interface

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

- Each owner exports an adapter for their G1–G7 minigame ID. A game must work at any narrative stage and must not hard-code a story reveal, PIN digit or stage.
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

### Placeholder handoff

The seven independent minigame placeholders are **G1, G2, G3, G4, G5, G6 and G7**. Each has no prescribed mechanics or solution. Implement four to seven as time allows; mark registry entries ready only when their adapters work. C1–C4 remain narrative slots populated from that ready pool.

A development placeholder displays “Minigame not implemented yet” plus current control labels. For integration testing only, RIGHT may simulate completion and LEFT may return to the bunker. Clearly mark this debug bypass and disable it in the judged build. Never select an unfinished placeholder in a production run.

Owners should share their adapter name, control labels, entry/exit behaviour and completion signal with the core integrator before merging. They must not modify another slot or the central configuration to make their puzzle work.

## 8. Tunnel Monster — OPTIONAL STRETCH GOAL

Only begin this after the full required game works.

If enabled, opening the door leads to a monster encounter in the escape tunnel. Earlier recordings should include brief hints of something moving beneath the bunker to prepare the reveal. Add those hints only when this extension is included; do not make the core story depend on them.

- Same two gameplay buttons, with current functions displayed.
- Encounter mechanics, monster design and win condition remain open for the team.
- Defeating or escaping the monster leads to the surface and the final ending.
- Retry behaviour must preserve all four repairs, digits and evidence.
- With `monsterEnabled: false`, skip this scene and trigger the core ending at the tunnel.
- No monster assets, encounter logic or extra scene may be required for the core version to run.

## 9. Integration acceptance checklist

- [ ] Intro establishes the engineer, locked bunker and supervisor's warning.
- [ ] G1–G7 have clear ownership/status; only ready games are eligible.
- [ ] Each new run selects four distinct games from the four-to-seven ready pool.
- [ ] Selection/order is randomised once per new run, never during retries or scene changes.
- [ ] Fewer than four ready games produces a clear development message.
- [ ] Every selected game can work at any stage without hard-coded rewards.
- [ ] Each implemented challenge uses exactly two labelled gameplay inputs.
- [ ] Completing C1/C2/C3/C4 reveals its own story and positions 1/2/3/4 respectively.
- [ ] Collected digits stay visible and labelled; unearned positions show “?”.
- [ ] Duplicate, stale-run and wrong-stage/game completion callbacks do not award rewards.
- [ ] Revisiting a completed station preserves completion.
- [ ] Leaving and returning to scenes preserves progress.
- [ ] Door remains locked until all four challenges are complete.
- [ ] PIN entry uses LEFT to cycle and RIGHT to confirm.
- [ ] Wrong PIN resets entry only and allows retry.
- [ ] Correct PIN opens the tunnel and shows the core ending with stretch disabled.
- [ ] Changing the central digit configuration changes both rewards and door validation.
- [ ] Optional monster content is gated and cannot block the required ending.
- [ ] Debug completion bypasses are disabled before the judged demo.
