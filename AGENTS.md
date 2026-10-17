# AGENTS.md

## Read these first

| File | What it holds |
| --- | --- |
| `docs/STORY.md` | Narrative only — premise, C1–C4 stage beats, dialogue, ending |
| `docs/TECH_SPEC.md` | Everything technical — config, run plan, adapter contract, controls, acceptance checklist |
| `docs/PLAN.md` | Generic hackathon planning template, largely unfilled |

`STORY.md` and `TECH_SPEC.md` are a deliberate split: **story content goes in one, technical requirements in the other.** Do not merge them back, and do not duplicate content across them. If you need to change the narrative, edit `STORY.md`; if you change mechanics, config, controls or the integration contract, edit `TECH_SPEC.md`.

## Project state

There is **no implementation yet**. `src/` contains only `.gitkeep` and `assets/` only `.gitkeep`. There is no `package.json`, no `tsconfig.json`, no test runner, and no build, lint or format configuration.

Consequences:

- Do not report build, test or typecheck results. Nothing is wired up to run.
- Do not assume a project layout, entry point or module exists.
- Do not invent npm scripts. If you need one, create the config that provides it, then document it here.

Intended stack is **Node / TypeScript** (team-confirmed). `.gitignore` also carries Python entries (`__pycache__/`, `*.py[cod]`, `.venv/`, `venv/`) — that is boilerplate, not an indication that Python is used.

Update this section once the scaffold lands.

## Environment variables

`.gitignore` ignores `.env` and `.env.*` but explicitly un-ignores `.env.example`:

```
.env
.env.*
!.env.example
```

- `.env` and any `.env.*` variant are gitignored — never commit real secrets or local values.
- `.env.example` is meant to be committed and is the template documenting expected variables.
- When adding a required env var, add it to `.env.example` with a safe placeholder value.

## Conventions that are easy to get wrong

**Digit values live in exactly one place.** `GAME_CONFIG.pinDigits` in `TECH_SPEC.md` is the only source of digit values. Narrative refers to PIN positions 1–4 and never states a digit. Never hard-code the PIN in minigame or door logic — `TECH_SPEC.md` requires that changing `pinDigits` changes both rewards and door validation.

**Minigames must not know their stage.** Any ready minigame can serve any of C1–C4, because rewards are awarded by stage, not by game. A game must not hard-code a story reveal, PIN digit or stage ID. The single exception is C1, which always draws a one-button game to introduce the controls.

**Two hardware buttons, but games bind one or both.** There are exactly two buttons, LEFT and RIGHT, and no third input is ever allowed. Each game declares `inputCount: 1 | 2` in its registry entry. A one-button game must display the unused button as visibly inactive — not blank, not silently ignored.

**Never use `Math.random()` for run randomness.** All selection comes from a seeded PRNG stored in shared state. The same seed with an unchanged ready pool must produce an identical selection. Note that adding a game to the pool can legitimately change what a given seed resolves to.

**At least one slot must be a one-button game before anyone can playtest.** A run is invalid with zero ready one-button games, because the opening level always uses one button. If this is your PR, check the task table before starting.

**`inputCount` must be declared at registration, not discovered at runtime.** Selection partitions the pool by this field, so it has to be correct before the game is marked ready.

**Completion is guarded on three conditions.** `completeStage` rejects stale `runId`, a stage/game pair that was not assigned in this run, and an already-completed stage. Callbacks are bound to run, stage and game — keep them that way.

**Debug affordances must not ship.** The seed dev hook and the unfinished-minigame completion bypass both have to be disabled before the judged demo (`TECH_SPEC.md` acceptance checklist).

**The boss is fixed, not random.** It is its own config entry with its own adapter. It is never drawn from the G1–G7 pool and must not affect the four-stage selection.

## Working on a minigame

Claim G1–G7 in the task table at the top of `TECH_SPEC.md` by editing Owner and Status. Implement only your own slot.

Declare your `inputCount` in your registry entry. A one-button game is particularly valuable right now — the run is invalid without one, so nobody can playtest until at least one exists.

Do not modify another slot or the central configuration to make your puzzle work. Before merging, share your adapter name, declared `inputCount`, control labels, entry/exit behaviour and completion signal with the core integrator.

## Before opening a PR

The pull request template asks for what changed and how to try it. There is no test suite yet, so verify the interaction manually and state the steps in "How to try it" so a teammate can reproduce it on their machine — `docs/PLAN.md` lists "test on another teammate's machine" as an MVP goal.
