# UI Uniformity Plan

This document outlines the visual inconsistencies across minigames and provides a plan to create a unified bunker terminal aesthetic.

## Executive Summary

Most minigames (9 of 11) already share core colors. The main issues are:
1. **G4 Rhythm** - Complete visual outlier (pink theme instead of teal/green)
2. **Inconsistent CRT effects** - Some games have full scanlines+vignette, others have none
3. **Letterbox color variation** - Split between `#04070a` and pure black `#000`
4. **Shared palette text color** - Darker than what minigames actually use

## Current State Analysis

### Color Palette Comparison

| Minigame | Background | Accent | Danger | Amber | Text | Letterbox | CRT |
|----------|------------|--------|--------|-------|------|-----------|-----|
| **G1 Signal Relay** | ✓ `#0a1411` | ✓ `#5cff9d` | ✓ `#ff6b57` | ✓ `#ffb347` | ✓ `#b8f5cf` | ✓ `#04070a` | Full |
| **G2 Lane Crossing** | ~ `#0c1512` | ✓ | ✓ | ✓ | ✓ | ✓ | Full |
| **G3 Tetris** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Full |
| **G4 Rhythm** | ✗ `#0a0a12` | ✗ Pink `#ff6b9d` | ✓ | ✗ | ✗ Gray `#e0e0e0` | ✗ `#000` | None |
| **G5 Circuit Sync** | ~ `#081311` | ✓ | ✓ | N/A | ~ `#9fc3b3` | ✗ `#000` | Scanlines only |
| **G6 Pressure Valves** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Full |
| **G7 Signal Lock** | ✓ | ✓ | ✓ | N/A | ✓ | ✓ | None |
| **G8 Shelf Shuffle** | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ `#000` | None |
| **E1 Vault Lock** | ~ `#0c1512` | ✓ | ✓ | ✓ | ✓ | ✓ | Full |
| **E2 Morse Pad** | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ `#000` | Scanlines only |
| **Boss Tunnel** | ✓ Palette | ✓ | ✓ | ✓ | ✓ | ✓ | Full |

Legend: ✓ = matches standard, ~ = close, ✗ = different

### CRT Effect Categories

**Full CRT (scanlines + vignette, scale-aware):**
- G1 Signal Relay
- G2 Lane Crossing
- G3 Tetris
- G6 Pressure Valves
- E1 Vault Lock
- Boss Tunnel

**Scanlines Only (no vignette, fixed 3px spacing):**
- G5 Circuit Sync
- E2 Morse Pad

**No CRT Effects:**
- G4 Rhythm
- G7 Signal Lock
- G8 Shelf Shuffle

### HUD Layout Analysis

Most games follow this layout:
- **Top bar (y=16-40)**: Title + progress counter, segmented progress bar
- **Middle**: Game-specific content
- **Bottom hints (y=458+)**: Control instructions

Common elements:
- Progress text: `bold 12px` monospace
- Progress bar: height 6px, segmented, y=34
- Hint text: `11px` monospace at bottom
- Overlay cards: semi-transparent panel with instructions

## Recommended Changes

### Phase 1: Update Shared Palette

Update `src/util/palette.ts` to match what minigames actually use:

```typescript
export const PALETTE = {
  // Backgrounds
  bgDark: '#04080a',
  bgPanel: '#0a1411',      // Was #0a1210
  bgPanelLight: '#0c1512',
  bgGradientEnd: '#060b0a',
  
  // Borders
  border: '#1a2f28',
  borderLight: '#2a4a3a',
  panelEdge: '#2f453b',
  panelInner: '#0e1613',
  
  // Text
  text: '#b8f5cf',          // Updated from #8fa89a to match minigames
  textDim: 'rgba(184, 245, 207, 0.6)',
  textBright: '#e0f8e8',
  
  // Accents
  accent: '#5cff9d',
  accentDim: 'rgba(92, 255, 157, 0.35)',
  accentGlow: 'rgba(92, 255, 157, 0.12)',
  
  // Status colors
  danger: '#ff6b57',
  dangerDim: 'rgba(255, 107, 87, 0.3)',
  amber: '#ffb347',
  amberDim: 'rgba(255, 179, 71, 0.35)',
  
  // Additional accent colors
  cyan: '#76d5ed',
  teal: '#4fd1c5',
  
  // CRT/Chrome
  letterbox: '#04070a',
  scanline: 'rgba(0, 0, 0, 0.18)',
  grid: 'rgba(72, 214, 128, 0.07)',
  flash: '#eafff2',
} as const;
```

### Phase 2: Convert G4 Rhythm to Bunker Theme

This is the biggest change. G4 needs to be converted from pink to green:

**Current G4 colors:**
```typescript
accent: "#ff6b9d",       // Pink → change to #5cff9d (green)
bgGradient1: "#0a0a12",  // Blue-tinted → change to #0a1411
bgGradient2: "#12121f",  // Blue-tinted → change to #060b0a
text: "#e0e0e0",         // Pure gray → change to #b8f5cf
ring: "rgba(255, 107, 157, 0.4)",  // Pink → change to green
```

**Changes needed in G4:**
1. Replace all pink accent colors with green `#5cff9d`
2. Change background gradient to teal (`#0a1411` → `#060b0a`)
3. Change grid color from pink to green `rgba(72, 214, 128, 0.07)`
4. Change text to green-tinted `#b8f5cf`
5. Add full CRT effects (scanlines + vignette)
6. Change letterbox to `#04070a`

### Phase 3: Add Missing CRT Effects

Add full CRT to games that are missing it:

**G7 Signal Lock** - Add drawCrt function:
```typescript
function drawCrt(ctx: CanvasRenderingContext2D, scale: number): void {
  const step = Math.max(2, 3 / scale);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  for (let y = 0; y < WORLD_HEIGHT; y += step * 2) {
    ctx.fillRect(0, y, WORLD_WIDTH, step * 0.6);
  }
  const g = ctx.createRadialGradient(
    WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_HEIGHT * 0.3,
    WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_HEIGHT * 0.75,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
}
```

**G8 Shelf Shuffle** - Add CRT effects (same as above)

**G5 Circuit Sync, E2 Morse Pad** - Add vignette to existing scanlines

### Phase 4: Standardize Letterbox Color

Update these files to use `#04070a` instead of `#000`:
- `g4-rhythm/render.ts`
- `g5-circuit-sync/render.ts`
- `g8-shelf-shuffle/render.ts`
- `e2-morse-pad/render.ts`

### Phase 5: Import Shared Palette

For each minigame, replace local color definitions with imports from the shared palette:

```typescript
import { PALETTE } from '../../util/palette';

// Then use PALETTE.accent instead of C.green, etc.
```

## Implementation Order

1. **Update palette.ts** - Fix text color, add missing entries
2. **G4 Rhythm recolor** - Biggest visual change, highest impact
3. **Add CRT to G7, G8** - Quick wins for visual consistency
4. **Add vignette to G5, E2** - Complete CRT coverage
5. **Fix letterbox colors** - Minor but noticeable
6. **Migrate to shared palette** - Can be done incrementally per game

## Visual Consistency Checklist

After implementation, verify each game has:

- [ ] Background gradient: `#0a1411` → `#060b0a`
- [ ] Letterbox: `#04070a`
- [ ] Primary accent: `#5cff9d` (green)
- [ ] Danger color: `#ff6b57` (red)
- [ ] Warning color: `#ffb347` (amber)
- [ ] Text color: `#b8f5cf` (green-tinted white)
- [ ] Grid pattern: `rgba(72, 214, 128, 0.07)` at 40px spacing (where applicable)
- [ ] CRT scanlines: scale-aware, `rgba(0, 0, 0, 0.18)`
- [ ] CRT vignette: radial gradient darkening edges

## Notes

- G2 Lane Crossing has a detailed corridor background instead of a grid - this is intentional and adds variety
- G7 Signal Lock is intentionally minimal - just add CRT, don't add grid
- Boss Tunnel already uses the shared palette - use it as a reference
- G4 being sound-dependent means it's already excluded when sound is off, but it should still match visually when included
