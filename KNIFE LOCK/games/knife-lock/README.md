# Knife Lock

A two-button challenge for the DEAD SIGNAL bunker game.

Open `index.html` in your browser. No install or server is needed.

## Controls

- `A` or red on-screen button: red knife.
- `D` or blue on-screen button: blue knife.
- Press either button on the title screen to start or after a result to retry.

## Rules

- Throw when a red or blue contact reaches the amber marker at the bottom.
- Match the colour and land 8 knives to win.
- Three mistakes end the round.
- Every mistake makes the wheel much faster.
- Winning reveals just one PIN digit.

## Editing

- `index.html`: screen text and buttons.
- `game.js`: gameplay and canvas drawing.
- `../../shared/theme/dead-signal-theme.css`: reusable shared visual theme.
- Open `game.js` and change the `rules` object at the top to adjust difficulty.

## Connect to the full game

On success, Knife Lock sends a browser event:

```js
document.addEventListener('dead-signal:digit-unlocked', event => {
  const { gameId, digit } = event.detail;
  console.log(gameId, digit);
});
```

By default the digit is random. If the main game assigns a particular digit, open the mini-game with `index.html?digit=7` (replace `7` with the required digit). The final PIN should be assembled by the main game rather than by this puzzle.
