// Canvas drawing for G3. Reads GameState, never mutates it. All art is canvas primitives,
// in the same bunker CRT palette as G1 (dark teal, green signal, amber hazard).

import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BOARD_X,
  BOARD_Y,
  CELL,
  COLS,
  HOVER_TIMEOUT_MS,
  OVERFLOW_LOCKOUT_MS,
  PIECE_ROTATIONS,
  ROWS,
  TARGET_LINES,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  ghostY,
  pieceCells,
  type ActivePiece,
  type GameState,
  type PieceKind,
} from './logic';

const FONT = '"ui-monospace", Menlo, Consolas, "Courier New", monospace';

const C = {
  letterbox: '#04070a',
  bg0: '#0a1411',
  bg1: '#060b0a',
  grid: 'rgba(72, 214, 128, 0.07)',
  panel: '#182420',
  panelEdge: '#2f453b',
  panelInner: '#0e1613',
  well: '#070d0b',
  wellGrid: 'rgba(92, 255, 157, 0.06)',
  amber: '#ffb347',
  amberDim: 'rgba(255, 179, 71, 0.35)',
  green: '#5cff9d',
  greenDim: 'rgba(92, 255, 157, 0.35)',
  text: '#b8f5cf',
  textDim: 'rgba(184, 245, 207, 0.6)',
  danger: '#ff6b57',
  flash: '#eafff2',
  scanline: 'rgba(0, 0, 0, 0.18)',
} as const;

/** One colour per block kind, all drawn from the shared green/amber palette. */
const PIECE_COLORS: Record<PieceKind, string> = {
  I: '#5cff9d',
  O: '#ffb347',
  T: '#4fd1c5',
  S: '#b4ff5c',
  Z: '#ff6b57',
  J: '#ffe08a',
  L: '#c98a1a',
};

/** Draw one frame. `canvasW`/`canvasH` are device pixels of the backing store. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
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

  drawBackground(ctx);
  drawWell(ctx);
  drawLockedCells(ctx, state);
  if (state.active && (state.phase === 'ORIENT' || state.phase === 'FALLING')) {
    drawGhost(ctx, state, state.active);
    drawActive(ctx, state, state.active);
  }
  drawClearingRows(ctx, state);
  drawWellFrame(ctx);
  drawNextPanel(ctx, state);
  drawReleasePanel(ctx, state);
  drawHud(ctx, state);
  drawHint(ctx, state);
  drawOverlay(ctx, state);
  drawCrt(ctx, scale);

  ctx.restore();
}

// ---- Scenery ------------------------------------------------------------------

function drawBackground(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  g.addColorStop(0, C.bg0);
  g.addColorStop(1, C.bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // Static bunker-wall grid behind the memory rack.
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
}

function drawWell(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = C.well;
  ctx.fillRect(BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT);

  // Faint cell grid inside the well.
  ctx.strokeStyle = C.wellGrid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < COLS; c++) {
    const x = BOARD_X + c * CELL + 0.5;
    ctx.moveTo(x, BOARD_Y);
    ctx.lineTo(x, BOARD_Y + BOARD_HEIGHT);
  }
  for (let r = 1; r < ROWS; r++) {
    const y = BOARD_Y + r * CELL + 0.5;
    ctx.moveTo(BOARD_X, y);
    ctx.lineTo(BOARD_X + BOARD_WIDTH, y);
  }
  ctx.stroke();
}

function drawWellFrame(ctx: CanvasRenderingContext2D): void {
  // Rack rails on either side of the well, in the same metalwork as G1's pylons.
  const rail = 6;
  ctx.fillStyle = C.panel;
  ctx.fillRect(BOARD_X - rail, BOARD_Y - 2, rail, BOARD_HEIGHT + rail + 2);
  ctx.fillRect(BOARD_X + BOARD_WIDTH, BOARD_Y - 2, rail, BOARD_HEIGHT + rail + 2);
  ctx.fillRect(BOARD_X - rail, BOARD_Y + BOARD_HEIGHT, BOARD_WIDTH + rail * 2, rail);
  ctx.fillStyle = C.panelEdge;
  ctx.fillRect(BOARD_X - 1, BOARD_Y, 1, BOARD_HEIGHT);
  ctx.fillRect(BOARD_X + BOARD_WIDTH, BOARD_Y, 1, BOARD_HEIGHT);
  ctx.fillRect(BOARD_X - rail, BOARD_Y + BOARD_HEIGHT, BOARD_WIDTH + rail * 2, 1);
  // Overflow line: a hazard-amber mark along the open top of the well.
  ctx.fillStyle = C.amberDim;
  ctx.fillRect(BOARD_X, BOARD_Y - 2, BOARD_WIDTH, 2);
}

// ---- Blocks -------------------------------------------------------------------

function cellOrigin(col: number, row: number): { px: number; py: number } {
  return { px: BOARD_X + col * CELL, py: BOARD_Y + row * CELL };
}

function drawBlockCell(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  color: string,
  size: number,
  alpha = 1,
): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
  // Bevel: light top edge, dark bottom edge.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.fillRect(px + 1, py + 1, size - 2, Math.max(1, size * 0.12));
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(
    px + 1,
    py + size - 1 - Math.max(1, size * 0.12),
    size - 2,
    Math.max(1, size * 0.12),
  );
  ctx.globalAlpha = 1;
}

function drawLockedCells(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const kind = state.board[r][c];
      if (!kind) continue;
      const { px, py } = cellOrigin(c, r);
      drawBlockCell(ctx, px, py, PIECE_COLORS[kind], CELL, 0.82);
    }
  }
}

function drawGhost(ctx: CanvasRenderingContext2D, state: GameState, piece: ActivePiece): void {
  const landingY = ghostY(state, piece);
  if (landingY === piece.y) return;
  const color = PIECE_COLORS[piece.kind];
  for (const cell of pieceCells({ ...piece, y: landingY })) {
    if (cell.y < 0) continue;
    const { px, py } = cellOrigin(cell.x, cell.y);
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = color;
    ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 2.5, py + 2.5, CELL - 5, CELL - 5);
    ctx.globalAlpha = 1;
  }
}

function drawActive(ctx: CanvasRenderingContext2D, state: GameState, piece: ActivePiece): void {
  const color = PIECE_COLORS[piece.kind];
  const hovering = state.phase === 'ORIENT';
  // A hovering block pulses so it reads as "waiting for you"; a falling block glows steadily.
  const pulse = hovering ? 0.5 + 0.5 * Math.sin(state.timeMs / 180) : 0;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 10 + pulse * 10;
  for (const cell of pieceCells(piece)) {
    if (cell.y < 0) continue;
    const { px, py } = cellOrigin(cell.x, cell.y);
    drawBlockCell(ctx, px, py, color, CELL);
  }
  ctx.restore();
}

function drawClearingRows(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.phase !== 'CLEARING') return;
  const on = Math.floor(state.phaseMs / 80) % 2 === 0;
  ctx.fillStyle = on ? C.flash : C.greenDim;
  for (const r of state.clearingRows) {
    const { px, py } = cellOrigin(0, r);
    ctx.fillRect(px, py + 1, BOARD_WIDTH, CELL - 2);
  }
}

// ---- Side panels ----------------------------------------------------------------

function drawPanelBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = C.panel;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = C.panelEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = C.panelInner;
  ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
}

function drawNextPanel(ctx: CanvasRenderingContext2D, state: GameState): void {
  const w = 48;
  const h = 64;
  const x = (BOARD_X - 6 - w) / 2;
  const y = BOARD_Y;
  drawPanelBox(ctx, x, y, w, h);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `bold 9px ${FONT}`;
  ctx.fillStyle = C.textDim;
  ctx.fillText('NEXT', x + w / 2, y + 8);

  const kind = state.queue[0];
  if (!kind || state.phase === 'READY') return;
  const mini = 9;
  const cells = PIECE_ROTATIONS[kind][0];
  const minX = Math.min(...cells.map((c) => c.x));
  const maxX = Math.max(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));
  const maxY = Math.max(...cells.map((c) => c.y));
  const shapeW = (maxX - minX + 1) * mini;
  const shapeH = (maxY - minY + 1) * mini;
  const ox = x + (w - shapeW) / 2 - minX * mini;
  const oy = y + 22 + (h - 22 - 8 - shapeH) / 2 - minY * mini;
  for (const c of cells) {
    drawBlockCell(ctx, ox + c.x * mini, oy + c.y * mini, PIECE_COLORS[kind], mini);
  }
}

function drawReleasePanel(ctx: CanvasRenderingContext2D, state: GameState): void {
  const w = 48;
  const h = 64;
  const x = BOARD_X + BOARD_WIDTH + 6 + (WORLD_WIDTH - (BOARD_X + BOARD_WIDTH + 6) - w) / 2;
  const y = BOARD_Y;
  drawPanelBox(ctx, x, y, w, h);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `bold 9px ${FONT}`;
  ctx.fillStyle = C.textDim;
  ctx.fillText('DROP', x + w / 2, y + 8);

  // Countdown bar: the hovering block is released when it drains.
  const barX = x + 12;
  const barY = y + 22;
  const barW = w - 24;
  const barH = h - 30;
  ctx.fillStyle = 'rgba(92,255,157,0.1)';
  ctx.fillRect(barX, barY, barW, barH);
  if (state.phase === 'ORIENT') {
    const remaining = Math.max(0, 1 - state.hoverMs / HOVER_TIMEOUT_MS);
    const fillH = barH * remaining;
    ctx.fillStyle = remaining < 0.25 ? C.amber : C.green;
    ctx.fillRect(barX, barY + barH - fillH, barW, fillH);
  } else if (state.phase === 'FALLING') {
    ctx.fillStyle = C.amberDim;
    ctx.fillRect(barX, barY, barW, barH);
  }
  ctx.strokeStyle = C.greenDim;
  ctx.lineWidth = 1;
  ctx.strokeRect(barX - 0.5, barY - 0.5, barW + 1, barH + 1);
}

// ---- Text ---------------------------------------------------------------------

function drawHud(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `bold 12px ${FONT}`;
  ctx.fillStyle = C.text;
  ctx.fillText(`ROWS FLUSHED  ${Math.min(state.lines, TARGET_LINES)}/${TARGET_LINES}`, 12, 16);

  // Segmented progress bar, one segment per row to flush.
  const barX = 12;
  const barY = 34;
  const barW = WORLD_WIDTH - 24;
  const segGap = 3;
  const segW = (barW - segGap * (TARGET_LINES - 1)) / TARGET_LINES;
  for (let i = 0; i < TARGET_LINES; i++) {
    const filled = i < state.lines;
    ctx.fillStyle = filled ? C.green : 'rgba(92,255,157,0.12)';
    ctx.fillRect(barX + i * (segW + segGap), barY, segW, 6);
  }
  ctx.strokeStyle = 'rgba(92,255,157,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX - 2.5, barY - 2.5, barW + 5, 11);
}

function drawHint(ctx: CanvasRenderingContext2D, state: GameState): void {
  const cx = WORLD_WIDTH / 2;
  const y = BOARD_Y + BOARD_HEIGHT + 22;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `11px ${FONT}`;

  switch (state.phase) {
    case 'ORIENT':
      ctx.fillStyle = C.text;
      ctx.fillText('LEFT rotates the block', cx, y);
      ctx.fillStyle = C.textDim;
      ctx.fillText('RIGHT releases it into the rack', cx, y + 16);
      break;
    case 'FALLING':
      ctx.fillStyle = C.text;
      ctx.fillText('Steer the block into place', cx, y);
      ctx.fillStyle = C.textDim;
      ctx.fillText('Fill a full row to flush it', cx, y + 16);
      break;
    case 'CLEARING': {
      const n = state.clearingRows.length;
      ctx.fillStyle = C.green;
      ctx.font = `bold 12px ${FONT}`;
      ctx.fillText(n > 1 ? `${n} ROWS FLUSHED` : 'ROW FLUSHED', cx, y + 6);
      break;
    }
    case 'READY':
    case 'OVERFLOW':
    case 'SUCCESS':
      break;
  }

  if (state.placed > 0 && state.phase !== 'READY') {
    ctx.font = `10px ${FONT}`;
    ctx.fillStyle = C.textDim;
    ctx.textAlign = 'right';
    ctx.fillText(`BLOCKS ${state.placed}`, WORLD_WIDTH - 12, 16);
  }
}

function drawOverlay(ctx: CanvasRenderingContext2D, state: GameState): void {
  const cx = WORLD_WIDTH / 2;
  const cy = BOARD_Y + BOARD_HEIGHT / 2;
  const blink = Math.sin(state.timeMs / 300) > 0;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  switch (state.phase) {
    case 'READY': {
      drawCard(ctx, cx, cy, 260, 104);
      ctx.fillStyle = C.text;
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText('DEFRAGMENT THE CORE', cx, cy - 30);
      ctx.fillStyle = C.textDim;
      ctx.font = `11px ${FONT}`;
      ctx.fillText('Pack the memory blocks into full rows.', cx, cy - 8);
      ctx.fillText(`Flush ${TARGET_LINES} rows to clear the buffer.`, cx, cy + 7);
      if (blink) {
        ctx.fillStyle = C.green;
        ctx.font = `bold 12px ${FONT}`;
        ctx.fillText('PRESS TO START', cx, cy + 30);
      }
      break;
    }
    case 'OVERFLOW': {
      ctx.fillStyle = 'rgba(255, 107, 87, 0.08)';
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      drawCard(ctx, cx, cy, 230, 80);
      ctx.fillStyle = C.danger;
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText('BUFFER OVERFLOW', cx, cy - 14);
      if (state.phaseMs >= OVERFLOW_LOCKOUT_MS && blink) {
        ctx.fillStyle = C.text;
        ctx.font = `bold 12px ${FONT}`;
        ctx.fillText('PRESS TO RETRY', cx, cy + 16);
      }
      break;
    }
    case 'SUCCESS': {
      ctx.fillStyle = 'rgba(92, 255, 157, 0.08)';
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      drawCard(ctx, cx, cy, 250, 80);
      ctx.save();
      ctx.shadowColor = C.green;
      ctx.shadowBlur = 16;
      ctx.fillStyle = C.green;
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText('CORE DEFRAGGED', cx, cy - 12);
      ctx.restore();
      ctx.fillStyle = C.textDim;
      ctx.font = `11px ${FONT}`;
      ctx.fillText('Buffer flushed. Carrier stable.', cx, cy + 16);
      break;
    }
    case 'ORIENT':
    case 'FALLING':
    case 'CLEARING':
      break;
  }
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = 'rgba(4, 10, 8, 0.86)';
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.strokeStyle = 'rgba(92,255,157,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - w / 2 + 0.5, cy - h / 2 + 0.5, w - 1, h - 1);
}

function drawCrt(ctx: CanvasRenderingContext2D, scale: number): void {
  // Scanlines: one dark line every ~3 device pixels, expressed in world units.
  const step = Math.max(2, 3 / scale);
  ctx.fillStyle = C.scanline;
  for (let y = 0; y < WORLD_HEIGHT; y += step * 2) {
    ctx.fillRect(0, y, WORLD_WIDTH, step * 0.6);
  }
  // Vignette.
  const g = ctx.createRadialGradient(
    WORLD_WIDTH / 2,
    WORLD_HEIGHT / 2,
    WORLD_HEIGHT * 0.3,
    WORLD_WIDTH / 2,
    WORLD_HEIGHT / 2,
    WORLD_HEIGHT * 0.75,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
}
