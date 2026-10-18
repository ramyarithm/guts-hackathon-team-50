/**
 * Shared color palette for all minigames.
 * 
 * Use these colors to maintain visual consistency across the game.
 * Colors match the CSS variables in style.css.
 */

export const PALETTE = {
  // Backgrounds (dark to light)
  bgDark: '#04080a',
  bgPanel: '#0a1210',
  bgPanelLight: '#0f1a16',
  
  // Borders
  border: '#1a2f28',
  borderLight: '#2a4a3a',
  
  // Text
  text: '#8fa89a',
  textDim: '#5a6a62',
  textBright: '#c8e6d0',
  
  // Accent (green)
  accent: '#5cff9d',
  accentDim: 'rgba(92, 255, 157, 0.3)',
  accentGlow: 'rgba(92, 255, 157, 0.08)',
  
  // Danger (red)
  danger: '#ff6b57',
  dangerDim: 'rgba(255, 107, 87, 0.3)',
  
  // Warning (amber/yellow)
  warning: '#ffb347',
  warningDim: 'rgba(255, 179, 71, 0.3)',
  
  // Secondary colors
  cyan: '#76d5ed',
  teal: '#4fd1c5',
  
  // UI elements
  letterbox: '#04070a',
  panelEdge: '#2f453b',
  panelInner: '#0e1613',
} as const;

export type PaletteColor = typeof PALETTE[keyof typeof PALETTE];
