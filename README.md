# Please Hold

A single player browser escape game built by **Team 50** for the **GUTS Hackathon at the University of Glasgow**.

You are a government telephone engineer sent to repair an underground communications bunker. When the security doors lock behind you, restoring the damaged systems reveals why you were really sent there. Recover the exit code, unlock the door and survive the tunnel with the evidence.

## How it plays

One player uses just two controls, **LEFT** and **RIGHT**. Each scene displays their current functions; some minigames use only one button.

Each run selects four distinct minigames using a seed. The opening stage uses one button, followed by three stages using two buttons. Completing each stage reveals a PIN digit and another part of the story. Enter the recovered code through a vault lock or Morse pad, then face the tunnel escape.

The project includes eight stage minigames, two PIN entry variants, a tunnel boss, story dialogue, music and pixel art scenes.

## Run locally

Install Node.js and npm, then run:

```bash
git clone https://github.com/ramyarithm/guts-hackathon-team-50.git
cd guts-hackathon-team-50
npm install
npm run dev
```

Open the local address printed by Vite in your browser.

## Controls

| Action | Keyboard | On screen |
| --- | --- | --- |
| LEFT | A or left arrow | Left button |
| RIGHT | D or right arrow | Right button |

Read the labels before each challenge because the actions change between games. Audio is used for music, atmosphere and the rhythm challenge.

## Build and checks

```bash
npm run build
npm run preview
```

The build command checks TypeScript and creates the production files in `dist`. Preview serves that build locally.

Additional commands:

```bash
npm run lint
npm run format:check
```

## Project structure

| Location | Contents |
| --- | --- |
| `src/main.ts` | Main game flow and shared state |
| `src/minigames/` | Stage games, PIN games and tunnel boss |
| `src/dialogue/` | Story playback and subtitles |
| `src/audio/` | Music and sound playback |
| `src/scenes/` | Menu and viewport layout |
| `assets/` | Dialogue data, music and scene artwork |
| `docs/` | Story, technical specification and project notes |

## Team development

Read [AGENTS.md](AGENTS.md) and the [technical specification](docs/TECH_SPEC.md) before changing the shared flow. The [story](docs/STORY.md) is maintained separately from technical requirements.

For minigame integration, see [Adding games](src/minigames/ADDING_GAMES.md). Work on a separate branch and open a pull request with a description and instructions for trying the change.

## Current status

This is a hackathon prototype. See [TODO](todo.md) for remaining work and the [QA summary](docs/QA_SUMMARY.md) for findings and the revision they apply to. Those historical checks do not certify later commits.
