// Game Over scene - renders on canvas like the minigames for visual consistency

import { PALETTE } from '../util/palette';

const WORLD_WIDTH = 320;
const WORLD_HEIGHT = 420;
const FONT = '"ui-monospace", Menlo, Consolas, "Courier New", monospace';

const C = {
  letterbox: PALETTE.letterbox,
  bg0: PALETTE.bg0,
  bg1: PALETTE.bg1,
  grid: PALETTE.grid,
  panel: PALETTE.panel,
  panelEdge: PALETTE.panelEdge,
  panelInner: '#0e1613',
  danger: PALETTE.danger,
  dangerDim: 'rgba(255, 107, 87, 0.35)',
  text: PALETTE.text,
  textDim: PALETTE.textDim,
  textBright: PALETTE.textBright,
  accent: PALETTE.green,
  scanline: PALETTE.scanline,
} as const;

export interface GameOverState {
  timeMs: number;
  selectedOption: 'restart' | 'menu';
}

export function createGameOverState(): GameOverState {
  return {
    timeMs: 0,
    selectedOption: 'restart',
  };
}

export function drawGameOver(
  ctx: CanvasRenderingContext2D,
  state: GameOverState,
  canvasW: number,
  canvasH: number,
): void {
  const scale = Math.min(canvasW / WORLD_WIDTH, canvasH / WORLD_HEIGHT);
  const offX = (canvasW - WORLD_WIDTH * scale) / 2;
  const offY = (canvasH - WORLD_HEIGHT * scale) / 2;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = C.letterbox;
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.setTransform(scale, 0, 0, scale, offX, offY);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  ctx.clip();

  drawBackground(ctx, state);
  drawContent(ctx, state);
  drawCrt(ctx, scale);

  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, _state: GameOverState): void {
  // Dark gradient background
  const g = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  g.addColorStop(0, C.bg0);
  g.addColorStop(1, C.bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // Subtle grid
  const cell = 40;
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= WORLD_WIDTH; x += cell) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD_HEIGHT);
  }
  for (let y = 0; y <= WORLD_HEIGHT; y += cell) {
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_WIDTH, y);
  }
  ctx.stroke();

  // Red danger overlay
  ctx.fillStyle = 'rgba(255, 107, 87, 0.05)';
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
}

function drawContent(ctx: CanvasRenderingContext2D, state: GameOverState): void {
  const cx = WORLD_WIDTH / 2;
  const cy = WORLD_HEIGHT / 2 - 40;
  const blink = Math.sin(state.timeMs / 300) > 0;

  // Main card
  drawCard(ctx, cx, cy, 280, 200);

  // Title with glow
  ctx.save();
  ctx.shadowColor = C.danger;
  ctx.shadowBlur = 20;
  ctx.fillStyle = C.danger;
  ctx.font = `bold 28px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GAME OVER', cx, cy - 50);
  ctx.restore();

  // Message
  ctx.fillStyle = C.textDim;
  ctx.font = `12px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('The signal has been lost.', cx, cy - 15);

  // Options
  const optionY = cy + 30;
  const optionSpacing = 40;

  // Restart option
  const restartSelected = state.selectedOption === 'restart';
  drawOption(ctx, cx, optionY, 'RESTART', 'A', restartSelected, blink);

  // Menu option
  const menuSelected = state.selectedOption === 'menu';
  drawOption(ctx, cx, optionY + optionSpacing, 'MAIN MENU', 'D', menuSelected, blink);
}

function drawOption(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  label: string,
  key: string,
  selected: boolean,
  blink: boolean,
): void {
  const width = 200;
  const height = 32;

  // Background
  if (selected) {
    ctx.fillStyle = 'rgba(92, 255, 157, 0.1)';
    ctx.fillRect(cx - width / 2, y - height / 2, width, height);
    ctx.strokeStyle = C.accent;
  } else {
    ctx.strokeStyle = C.textDim;
  }
  ctx.lineWidth = selected ? 2 : 1;
  ctx.strokeRect(cx - width / 2, y - height / 2, width, height);

  // Label
  ctx.fillStyle = selected ? C.accent : C.textDim;
  ctx.font = `bold 12px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, y);

  // Key hint
  if (blink || !selected) {
    ctx.fillStyle = selected ? C.textBright : C.textDim;
    ctx.font = `10px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(`[${key}]`, cx + width / 2 - 10, y);
  }
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
): void {
  // Outer panel
  ctx.fillStyle = C.panel;
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);

  // Border
  ctx.strokeStyle = C.panelEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - w / 2 + 1, cy - h / 2 + 1, w - 2, h - 2);

  // Inner fill
  ctx.fillStyle = C.panelInner;
  ctx.fillRect(cx - w / 2 + 5, cy - h / 2 + 5, w - 10, h - 10);

  // Danger accent at top
  ctx.fillStyle = C.danger;
  ctx.fillRect(cx - w / 2 + 5, cy - h / 2 + 5, w - 10, 3);
}

function drawCrt(ctx: CanvasRenderingContext2D, scale: number): void {
  // Scanlines
  const step = Math.max(2, 3 / scale);
  ctx.fillStyle = C.scanline;
  for (let y = 0; y < WORLD_HEIGHT; y += step * 2) {
    ctx.fillRect(0, y, WORLD_WIDTH, step * 0.6);
  }

  // Vignette
  const g = ctx.createRadialGradient(
    WORLD_WIDTH / 2,
    WORLD_HEIGHT / 2,
    WORLD_WIDTH * 0.3,
    WORLD_WIDTH / 2,
    WORLD_HEIGHT / 2,
    WORLD_WIDTH * 0.9,
  );
  g.addColorStop(0, 'transparent');
  g.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
}
