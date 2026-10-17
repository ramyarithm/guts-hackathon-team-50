# DEAD SIGNAL — Team 50

Shared bunker interface and one playable mini-game, built with plain HTML, CSS and JavaScript. No frameworks, packages, build scripts or accounts are needed.

## Open the project

1. Extract the ZIP.
2. Open the folder in VS Code using **File > Open Folder**.
3. Double-click `games/knife-lock/index.html` in Finder to play it in Safari or Chrome.
4. Double-click `shared/theme/theme-preview.html` to see the shared design separately.

## Folder structure

```text
DEAD-SIGNAL-Team50/
  README.md
  shared/
    theme/
      dead-signal-theme.css   Shared colours and terminal styling
      theme-preview.html      Standalone theme preview
      THEME_GUIDE.md          How other mini-games use the theme
  games/
    knife-lock/
      index.html              Game screen and buttons
      game.js                 Gameplay and circle drawing
      README.md               Controls, rules and integration
```

## Add to GitHub from VS Code

1. Open your Team 50 repository in VS Code.
2. Copy the `shared` and `games` folders into the repository, preserving their names.
3. Open Source Control, stage the new files, and commit with a clear message.
4. Push or publish a branch and open a pull request if your team uses reviews.

Upload **`shared/theme` first** if you only want to share the theme. The other teammates can then add their own game folders under `games/`.

## Important

Keep the relative stylesheet path in `games/knife-lock/index.html` unchanged while using this folder structure:

```html
<link rel="stylesheet" href="../../shared/theme/dead-signal-theme.css">
```

The game uses only two actions: `A` and `D`. Its starting, retrying, and knife throws all use those controls. The main game should save recovered PIN digits rather than using unrelated random values in every puzzle.
