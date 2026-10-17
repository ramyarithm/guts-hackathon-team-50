# Please Hold

GUTS Hackathon — Team 50, University of Glasgow.

A two-button narrative escape game: each new run randomly selects four distinct minigames from a pool of up to seven, always opening with a one-button game. Complete them to recover four PIN digits, then clear the boss to escape with the evidence.

## Start here

To claim a game and build independently, read the [technical specification](docs/TECH_SPEC.md). Narrative lives separately in [STORY.md](docs/STORY.md) — you do not need it to implement your minigame.

Build four to seven games as time allows. Gameplay selection and order change per run; four fixed story stages keep the narrative coherent. The required flow is intro → four random minigames with story reveals → PIN door → boss → escape ending. Each run always opens with a one-button game to introduce the controls. Minigame mechanics are open for each owner, but each must declare whether it uses one button or two.
