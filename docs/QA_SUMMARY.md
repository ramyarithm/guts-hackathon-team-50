# PLEASE HOLD QA summary

**18 October 2026** — tested commit `f6fc56b`. Historical results below apply to that revision; later changes have not been retested.

## Results

- Production build passed.
- Existing automated checks: **97 passed, 6 failed (103 total)**.
- Additional external rule simulations: **15 passed**; these are not full browser playthroughs.
- All ten minigames (G1–G8, E1, E2) opened and their controls were exercised at two screen sizes: 2560×1249 and 632×275.
- Browser wins verified for G6, G8, E1 and E2. The E2 debug-entry route continued through the door, tunnel boss and ending.
- No game code or assets were changed during testing.

## Issues found

| Issue | Details / location |
| --- | --- |
| Lives and stage progress clipped | Above the visible area at both tested sizes; reproduced in normal play. Check stage layout in `src/style.css:218–227`. |
| G6/E2 errors after winning | Completion disposes the game during `step()`, then rendering reads the cleared `game.state`. See `g6-pressure-valves/index.ts:49–50` and `e2-morse-pad/index.ts:28–29` under `src/minigames/`. Progression still continued. |
| Debug shortcut shows blank screen | With `?debug&seed=453` and music off, selecting G7 directly from the menu skips adapter startup. See `src/main.ts:368–379`. Switching to another game and back recovers it. |
| Five G8 adapter tests fail | Canvas mock lacks a usable `createRadialGradient()` result. Tests fail before lifecycle assertions; real-browser G8 victory worked. |
| One viewport test fails | Expects 705.6px height while also requiring ≤680px. Implementation returns 680px for the reserved header. See `src/scenes/viewport.test.ts:25`. |
| G1 randomness is not seeded | Adapter does not pass a seeded RNG; logic falls back to `Math.random()`. See `src/minigames/g1-signal-relay/index.ts:108`. Found by source inspection. |

## Still to verify

- One uninterrupted normal menu → four levels → PIN → boss → ending victory.
- Full browser victories for G1–G5 and G7; browser win/lose coverage is partial. Rule simulations or existing unit tests cover their core outcomes.
- G8 browser timeout and rapid retries; separate vault-route ending and browser boss-loss checks.
- Real portrait/mobile, touch and high-DPI devices. Portrait fitting was checked mathematically only.

**Status: not an all-clear.** Resolve the findings and finish the remaining browser coverage before marking QA complete. G1, G2, G3, G5, G6, G7 and E2 had no dedicated existing unit-test files in the audited source tree.
