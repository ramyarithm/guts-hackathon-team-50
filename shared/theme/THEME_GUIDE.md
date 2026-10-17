# DEAD SIGNAL — shared bunker theme

The theme is just CSS. It contains the colours, terminal layout, buttons, CRT screen effect, hazard striping, and status indicators used throughout the game.

## Use the theme in another mini-game

Include the stylesheet in your HTML `<head>`:

```html
<link rel="stylesheet" href="../../shared/theme/dead-signal-theme.css">
```

That path assumes your game is located in `games/your-game/index.html`. Change the relative path if you put your game somewhere else.

Wrap your game in the standard layout:

```html
<body class="ds-app">
  <main class="ds-shell">
    <header class="ds-topbar">
      <h1 class="ds-brand">DEAD <span>SIGNAL</span></h1>
      <div class="ds-live">LOCKDOWN ACTIVE</div>
    </header>
    <section class="ds-panel">
      <div class="ds-hazard"></div>
      <div class="ds-screen">
        <div class="ds-screen-head">TERMINAL / SYSTEM FAULT</div>
        <div class="ds-screen-body">
          <!-- Put your puzzle canvas or HTML here. -->
        </div>
      </div>
    </section>
  </main>
</body>
```

Open `theme-preview.html` to see a working layout.

## Colours

| Colour | CSS variable | Use |
| --- | --- | --- |
| Dark green | `--ds-screen` | terminal display |
| Red | `--ds-red` | danger / A button |
| Blue | `--ds-blue` | second control / D button |
| Amber | `--ds-amber` | warning / timing |
| Green | `--ds-green` | success |
| Light grey | `--ds-text` | text |

## Reusable classes

- Layout: `ds-app`, `ds-shell`, `ds-topbar`, `ds-panel`, `ds-screen`, `ds-screen-head`, `ds-screen-body`
- Branding: `ds-brand`, `ds-eyebrow`, `ds-live`, `ds-hazard`
- Controls: `ds-controls`, `ds-button`, `ds-button--red`, `ds-button--blue`
- Progress: `ds-stats`, `ds-stat`, `ds-stat-label`, `ds-stat-value`
- Messages: `ds-message`, `ds-message--success`, `ds-message--danger`

Try to keep the same two-button controls and colours across puzzles. Only the game rules and drawings need to change.

## PIN digits

Each finished puzzle should produce exactly one digit. The parent game should collect the digits and decide the final escape PIN; the theme itself has no puzzle logic.
