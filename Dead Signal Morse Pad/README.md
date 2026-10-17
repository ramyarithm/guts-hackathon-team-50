# Dead Signal: Morse door keypad

Open index.html in a browser. No installation, libraries, or build step.

- Left button / A / left arrow: dash.
- Right button / D / right arrow: dot.
- Five symbols automatically enter one number.
- Hold either input for 700 ms to undo a symbol (including the previous digit).
- The complete four-digit PIN is checked after the fourth number.
- Three failed attempts cause a lockout. Either button retries the keypad.

Demo PIN: 7319. Morse: `--... ...-- .---- ----.`

## Files

- index.html: keypad markup.
- dead-signal-theme.css: original team theme, unchanged.
- morse-pad.css: keypad layout and door animation.
- morse-pad.js: input, validation, and door opening.

## Connect to the main game

Replace `const doorPin = '7319'` with your collected PIN, kept as a four-character string so leading zeros work. The recovered-PIN display updates automatically. Keep this display if you want players to focus on Morse rather than remembering numbers.

Listen for the event to start the tunnel:

```js
document.addEventListener('door-unlocked', () => {
  // Switch to your tunnel scene here.
});
```

When merging into an existing page, reuse the shared theme once, copy the `door-pad` element, and load morse-pad.css and morse-pad.js. The keyboard listeners assume this keypad is the active screen; remove or disable them when leaving that screen. This is a browser game puzzle, not a secure access system.
