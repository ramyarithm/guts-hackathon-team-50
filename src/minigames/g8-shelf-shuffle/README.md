# G8 — Shelf Shuffle

Two-button storage puzzle. LEFT places the current item on the left shelf; RIGHT
places it on the right. Three consecutive identical items on one shelf clear.
A shelf holds four items. Clear 24 items in eight matches within 40 seconds.
The clock starts on the first placement. A failed run shows its reason; either
button retries the same puzzle with a fresh timer. No future items are displayed.

## Integration

- Factory: `createG8Adapter`; entry: `g8Entry`; ID: `G8`; `inputCount: 2`.
- Auto-registration is imported by `src/minigames/index.ts`, already imported by
  the main controller. The controller's existing G8 debug button can select it.
- READY/PLAYING labels: **Left shelf / Right shelf**. FAILED: **Retry / Retry**.
  SUCCESS: both inactive. No keyboard or pointer listeners are installed here;
  the central controller routes all inputs.
- Accepts any `stageId` without reading it. Never awards a PIN or story reward.
- `onComplete()` fires once, after a 900 ms success display. Leaving cancels it.
- Restarting an adapter replaces its canvas, animation frame, and resize observer.
  `dispose()` is idempotent. No timers or per-game input listeners are created.
- The frame clock uses real elapsed time, including tab suspension. Instruction
  time is free; once playing, the clock continues through placement animations.

## Solvable seeded puzzles

FNV-1a hashes `runId`; mulberry32 supplies every gameplay random choice. Four
rounds each contain three copies of two distinct types, shuffled independently.
The first two rounds use a shuffled partition of all four types. Later pairs are
seeded and shuffled as well. Routing one type to each shelf clears every round
with at most three slots per shelf, proving a valid two-button solution for every
seed without requiring a preview. Sequence data is private to the game closure;
render state contains only the current item and already placed items.

Identical run IDs reproduce the sequence, including retries. A new run ID can
produce a different puzzle. There is no `Math.random()` and no stage dependence.
Overflow is checked before accepting a fifth object, even if that object would
otherwise make a match. Logical matches clear immediately; their ghosts flash
then dissolve into deterministic pixel particles. Brief placement lockouts
prevent input double-firing while preserving the full 40-second real-time limit.

## Verification

```
node --test src/minigames/g8-shelf-shuffle/logic.test.mjs src/minigames/g8-shelf-shuffle/adapter.test.mjs
npm run build
npm run dev
```

The tests prove 1,000 generated puzzles solvable; cover reproducibility, variety,
capacity, matching, all failure reasons, retry, timer boundaries, and exactly-once
completion. Adapter tests exercise the real registry, rendering, repeated starts,
cancellation, missing contexts, synchronous controller disposal and DOM cleanup
using a minimal canvas/DOM host. Use the existing G8 debug selector to playtest
with the phone buttons or the project's LEFT/RIGHT keyboard bindings.
