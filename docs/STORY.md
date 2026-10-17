# Story

Team 50 — narrative reference.

> A government telephone engineer enters an underground bunker to fix a communications fault. The door locks behind them. Four repairs reveal four PIN digits—and why they were sent here.

This file is **narrative only**. Gameplay mechanics, controls, the integration contract, digit values and the acceptance checklist live in [TECH_SPEC.md](TECH_SPEC.md). Neither file should duplicate the other: story content belongs here, technical requirements belong there.

## Premise and intro

You are a government telephone engineer sent to repair a communications fault in an underground bunker. Shortly after you arrive, the security door locks and your supervisor calls:

> “Complete the repairs. Follow procedure. Do not access stored recordings.”

As you investigate, you discover the phones were deliberately sabotaged—and you were sent here because you know too much.

The player is told the exit code is split across four systems, one fragment per repaired system. Keep narrative available as readable text; recorded dialogue can be implemented as text for the prototype.

## The four narrative stages

C1–C4 are fixed **story stages**. They are not fixed minigames — each stage runs whichever game the run plan assigns to it. The randomisation rule is specified in [TECH_SPEC.md](TECH_SPEC.md); the narrative consequences are not randomised.

Each stage ends by awarding one PIN **position**. Digit values are configuration, not story, and are defined once in the technical spec. Never hard-code a digit in narrative copy.

### C1 — The Minister's Phone
**PIN position 1.** Unlocks C2.

Repair the first phone to recover an interrupted call. The recording reveals that the lockdown was authorised before you entered the bunker. Your arrival was expected.

- Story reveal: the trap was planned before your arrival.

### C2 — The Surveillance Phone
**PIN position 2.** Unlocks C3.

Restore a surveillance line and uncover recordings showing that the bunker has been used to secretly monitor civilians. Your previous maintenance report flagged the suspicious system, making you a target.

- Story reveal: you exposed the surveillance system in a maintenance report.

### C3 — The Engineer's Phone
**PIN position 3.** Unlocks C4.

Recover a message from a missing colleague:

> “They sent me down here too. Don’t trust the supervisor. The exit code is split across four systems.”

You also discover that your supervisor ordered your access records erased.

- Story reveal: a colleague suffered the same trap; the supervisor is covering their tracks.

### C4 — The Emergency Terminal
**PIN position 4.** Unlocks the security door.

Restore the bunker's emergency communications terminal. A final log confirms that the supervisor sabotaged the equipment to trap you and destroy the evidence. Your colleague left the last code fragment here before disappearing.

- Story reveal: direct confirmation of the supervisor's sabotage and motive.

## The boss

> **Placeholder — no narrative beat written yet.**

After the PIN door opens, the engineer faces the boss: a fixed, more difficult level in the escape tunnel. It is not one of the four random minigames and is not a literal creature — it is a harder challenge the player must clear to escape.

The team owns what this encounter actually is. Gating, retry behaviour and button requirements are specified in [TECH_SPEC.md](TECH_SPEC.md).

## The opening level

The first level is always a **one-button game** — a flappy-bird style game, a cross-the-road game, or a rhythm game. It introduces the controls and gets the player started before the harder two-button levels.

Which game appears is random per run. The opening level is always easy enough to complete on a first attempt, regardless of which game is drawn.

## Core ending

Clearing the boss means the engineer escapes with the recovered evidence. Display:

> “You are out. Now make sure the truth gets out too.”