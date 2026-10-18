/**
 * Shared color palette for all minigames.
 *
 * Use these colors to maintain visual consistency across the game.
 * All minigames should use these values for a unified bunker terminal aesthetic.
 */

export const PALETTE = {
  // Backgrounds - dark teal bunker gradient
  bg0: '#0a1411', // Primary background (top of gradient)
  bg1: '#060b0a', // Secondary background (bottom of gradient)
  bgAlt: '#0c1512', // Alternate background (G2, E1 walls)

  // Letterbox (black bars outside game area)
  letterbox: '#04070a',

  // Panel/UI element backgrounds
  panel: '#182420',
  panelEdge: '#2f453b',
  panelInner: '#0e1613',

  // Borders
  border: '#1a2f28',
  borderLight: '#2a4a3a',

  // Text - green-tinted white
  text: '#b8f5cf', // Primary text (updated to match minigames)
  textDim: 'rgba(184, 245, 207, 0.6)',
  textBright: '#e0f8e8',

  // Accent (green) - primary interactive color
  green: '#5cff9d',
  greenDim: 'rgba(92, 255, 157, 0.35)',
  greenGlow: 'rgba(92, 255, 157, 0.12)',

  // Danger (red) - errors, damage
  danger: '#ff6b57',
  dangerDim: 'rgba(255, 107, 87, 0.3)',

  // Warning (amber) - caution, timers
  amber: '#ffb347',
  amberDim: 'rgba(255, 179, 71, 0.35)',

  // Secondary accent colors
  cyan: '#76d5ed',
  teal: '#4fd1c5',

  // CRT effects
  scanline: 'rgba(0, 0, 0, 0.18)',
  grid: 'rgba(72, 214, 128, 0.07)',
  flash: '#eafff2',

  // Legacy aliases for compatibility
  accent: '#5cff9d',
  accentDim: 'rgba(92, 255, 157, 0.35)',
  warning: '#ffb347',
} as const;

export type PaletteColor = (typeof PALETTE)[keyof typeof PALETTE];

/**
 * Standard CRT effect function for minigames.
 * Call at the end of drawFrame with the scale factor.
 */
export function drawCrt(
  ctx: CanvasRenderingContext2D,
  worldWidth: number,
  worldHeight: number,
  scale: number,
): void {
  // Scanlines: one dark line every ~3 device pixels, expressed in world units
  const step = Math.max(2, 3 / scale);
  ctx.fillStyle = PALETTE.scanline;
  for (let y = 0; y < worldHeight; y += step * 2) {
    ctx.fillRect(0, y, worldWidth, step * 0.6);
  }

  // Vignette: darken the edges
  const g = ctx.createRadialGradient(
    worldWidth / 2,
    worldHeight / 2,
    worldHeight * 0.3,
    worldWidth / 2,
    worldHeight / 2,
    worldHeight * 0.75,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, worldWidth, worldHeight);
}
