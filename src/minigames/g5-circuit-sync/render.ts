// Canvas drawing for G5 (Circuit Sync). Reads GameState only.
// Bunker terminal style with spinning wheel and colored contacts.

import { CONTACT_COUNT, HITS_TO_WIN, WORLD_HEIGHT, WORLD_WIDTH, type GameState } from './logic';
import { PALETTE } from '../../util/palette';

const FONT = '"ui-monospace", Menlo, Consolas, "Courier New", monospace';
const TWO_PI = Math.PI * 2;

const C = {
  letterbox: PALETTE.letterbox,
  bg0: PALETTE.bg0,
  bg1: PALETTE.bg1,
  panel: PALETTE.panel,
  text: PALETTE.text,
  textBright: PALETTE.textBright,
  textDim: PALETTE.textDim,
  // Wheel - teal-tinted to match bunker
  wheelOuter: '#0a1411',
  wheelOuterStroke: PALETTE.panelEdge,
  wheelRim: '#4a6a5a',
  wheelGrad0: '#2a4a3a',
  wheelGrad1: '#1a3028',
  wheelGrad2: '#0e1a16',
  wheelLine: '#1a2f28',
  wheelLineAlt: 'rgba(92, 255, 157, 0.25)',
  wheelInnerRing: 'rgba(92, 255, 157, 0.2)',
  contactBg: '#0a1411',
  contactStroke: '#3a5a4a',
  red: PALETTE.danger,
  blue: PALETTE.cyan,
  centerOuter: '#0a1411',
  centerOuterStroke: PALETTE.panelEdge,
  centerInner: '#1a3028',
  connectorBody: '#8ab4a4',
  connectorLine: '#ffffff',
  connectorGrip: PALETTE.panel,
  connectorBase: '#1a2f28',
  flashGood: 'rgba(92, 255, 157, 0.08)',
  flashBad: 'rgba(255, 107, 87, 0.24)',
  success: PALETTE.green,
  danger: PALETTE.danger,
  scanline: PALETTE.scanline,
} as const;

const COLORS: [string, string] = [C.red, C.blue];

// Wheel positioning (scaled for 320x480)
const CORE = { x: WORLD_WIDTH / 2, y: 180, radius: 75 };

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

  // Apply shake
  if (state.shake > 0) {
    ctx.translate(
      Math.sin(state.timeMs / 20) * state.shake * 0.15,
      Math.cos(state.timeMs / 30) * state.shake * 0.08,
    );
  }

  drawBackground(ctx, state);
  drawWheel(ctx, state);
  drawSyncedConnectors(ctx, state);
  drawMarker(ctx);
  drawFlyingConnectors(ctx, state);
  drawHUD(ctx, state);
  drawFlash(ctx, state);
  drawCrt(ctx, scale);

  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, _state: GameState): void {
  // Dark bunker background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  grad.addColorStop(0, C.bg0);
  grad.addColorStop(1, C.bg1);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // Bunker wall grid (matching other games)
  const cell = 40;
  ctx.strokeStyle = PALETTE.grid;
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

function drawWheel(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { x, y, radius } = CORE;

  // Outer ring
  ctx.beginPath();
  ctx.arc(x, y, radius + 16, 0, TWO_PI);
  ctx.fillStyle = C.wheelOuter;
  ctx.fill();
  ctx.strokeStyle = C.wheelOuterStroke;
  ctx.lineWidth = 7;
  ctx.stroke();

  // Rim
  ctx.beginPath();
  ctx.arc(x, y, radius + 9, 0, TWO_PI);
  ctx.strokeStyle = C.wheelRim;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Bolts on outer ring
  for (let i = 0; i < 12; i++) {
    const a = (i * TWO_PI) / 12;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * (radius + 15), y + Math.sin(a) * (radius + 15), 2.5, 0, TWO_PI);
    ctx.fillStyle = C.wheelOuter;
    ctx.fill();
    ctx.strokeStyle = C.wheelRim;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Main wheel (rotates)
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(state.angle);

  // Wheel gradient
  const gradient = ctx.createRadialGradient(-20, -30, 5, 0, 0, radius);
  gradient.addColorStop(0, C.wheelGrad0);
  gradient.addColorStop(0.56, C.wheelGrad1);
  gradient.addColorStop(1, C.wheelGrad2);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TWO_PI);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = C.wheelRim;
  ctx.lineWidth = 4;
  ctx.stroke();

  // Radial lines
  for (let i = 0; i < 18; i++) {
    const a = (i * TWO_PI) / 18;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 20, Math.sin(a) * 20);
    ctx.lineTo(Math.cos(a) * (radius - 10), Math.sin(a) * (radius - 10));
    ctx.strokeStyle = i % 3 ? C.wheelLine : C.wheelLineAlt;
    ctx.lineWidth = i % 3 ? 1 : 2;
    ctx.stroke();
  }

  // Inner ring
  ctx.beginPath();
  ctx.arc(0, 0, radius - 16, 0, TWO_PI);
  ctx.strokeStyle = C.wheelInnerRing;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Contact points
  for (let i = 0; i < CONTACT_COUNT; i++) {
    const a = (i * TWO_PI) / CONTACT_COUNT;
    const cx = Math.cos(a) * radius;
    const cy = Math.sin(a) * radius;
    const color = COLORS[state.contactColors[i]];

    // Contact background
    ctx.beginPath();
    ctx.arc(cx, cy, 13, 0, TWO_PI);
    ctx.fillStyle = C.contactBg;
    ctx.fill();
    ctx.strokeStyle = C.contactStroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Glowing contact
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, TWO_PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();

    // Highlight
    ctx.beginPath();
    ctx.arc(cx - 2, cy - 2, 2, 0, TWO_PI);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fill();
  }

  // Center hub
  ctx.beginPath();
  ctx.arc(0, 0, 25, 0, TWO_PI);
  ctx.fillStyle = C.centerOuter;
  ctx.fill();
  ctx.strokeStyle = C.centerOuterStroke;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, TWO_PI);
  ctx.fillStyle = C.centerInner;
  ctx.fill();

  ctx.fillStyle = C.textBright;
  ctx.font = `bold 16px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('04', 0, 1);

  ctx.restore();
}

function drawSyncedConnectors(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const conn of state.syncedConnectors) {
    const a = state.angle + conn.localAngle;
    const x = CORE.x + Math.cos(a) * (CORE.radius + 18);
    const y = CORE.y + Math.sin(a) * (CORE.radius + 18);
    drawConnector(ctx, x, y, a - Math.PI / 2, COLORS[conn.type], 0.6);
  }
}

function drawMarker(ctx: CanvasRenderingContext2D): void {
  const { x, y, radius } = CORE;
  const markerY = y + radius + 8;

  // Triangle marker pointing up at the wheel
  ctx.save();
  ctx.shadowColor = C.success;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(x, markerY);
  ctx.lineTo(x - 8, markerY + 14);
  ctx.lineTo(x + 8, markerY + 14);
  ctx.closePath();
  ctx.fillStyle = C.success;
  ctx.fill();
  ctx.restore();

  // Label
  ctx.fillStyle = C.textDim;
  ctx.font = `10px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('MATCH COLOR', x, markerY + 28);
}

function drawFlyingConnectors(ctx: CanvasRenderingContext2D, state: GameState): void {
  const startY = 400;
  const endY = CORE.y + CORE.radius + 20;

  for (const conn of state.flyingConnectors) {
    const progress = Math.min(1, (state.timeMs - conn.startMs) / 210);
    const eased = 1 - Math.pow(1 - progress, 3);
    const y = startY - (startY - endY) * eased;
    const opacity = 1 - eased * 0.2;
    drawConnector(ctx, CORE.x, y, 0, COLORS[conn.type], 0.7, opacity);
  }
}

function drawConnector(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rotation: number,
  color: string,
  scale: number,
  opacity: number = 1,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  ctx.globalAlpha = opacity;

  // Connector body (pointed tip)
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(5, -10);
  ctx.lineTo(4, 0);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-5, -10);
  ctx.closePath();
  ctx.fillStyle = C.connectorBody;
  ctx.fill();

  // Center line
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(0, -3);
  ctx.strokeStyle = C.connectorLine;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Grip
  ctx.fillStyle = C.connectorGrip;
  ctx.fillRect(-7, -1, 14, 4);

  // Handle (colored)
  ctx.fillStyle = color;
  ctx.fillRect(-5, 3, 10, 16);

  // Base
  ctx.fillStyle = C.connectorBase;
  ctx.fillRect(-5, 17, 10, 3);

  ctx.restore();
}

function drawHUD(ctx: CanvasRenderingContext2D, state: GameState): void {
  // Title at top
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `bold 12px ${FONT}`;
  ctx.fillStyle = C.text;
  ctx.fillText(`SYNC  ${state.hits}/${HITS_TO_WIN}`, 12, 16);

  // Progress bar (segmented like other games)
  const barX = 12;
  const barY = 34;
  const barW = WORLD_WIDTH - 24;
  const segGap = 3;
  const segW = (barW - segGap * (HITS_TO_WIN - 1)) / HITS_TO_WIN;
  for (let i = 0; i < HITS_TO_WIN; i++) {
    const filled = i < state.hits;
    ctx.fillStyle = filled ? C.success : 'rgba(92,255,157,0.12)';
    ctx.fillRect(barX + i * (segW + segGap), barY, segW, 6);
  }
  ctx.strokeStyle = 'rgba(92,255,157,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX - 2.5, barY - 2.5, barW + 5, 11);

  // Stats panel at bottom with proper styling
  const panelY = 340;
  const panelH = 36;

  // Panel background with edge
  ctx.fillStyle = PALETTE.panelEdge;
  ctx.fillRect(10, panelY, WORLD_WIDTH - 20, panelH);
  ctx.fillStyle = C.panel;
  ctx.fillRect(12, panelY + 2, WORLD_WIDTH - 24, panelH - 4);

  ctx.font = `9px ${FONT}`;
  ctx.textBaseline = 'top';

  // Errors left
  ctx.textAlign = 'left';
  ctx.fillStyle = C.textDim;
  ctx.fillText('ERRORS LEFT', 18, panelY + 6);
  ctx.fillStyle = state.missesLeft <= 1 ? C.danger : C.textBright;
  ctx.font = `bold 14px ${FONT}`;
  ctx.fillText(`${state.missesLeft}`, 18, panelY + 18);

  // Speed
  ctx.textAlign = 'right';
  ctx.font = `9px ${FONT}`;
  ctx.fillStyle = C.textDim;
  ctx.fillText('SPEED', WORLD_WIDTH - 18, panelY + 6);
  ctx.fillStyle = C.textBright;
  ctx.font = `bold 14px ${FONT}`;
  const speedMult = state.phase === 'READY' ? '—' : `${(state.speed / 1.3).toFixed(1)}×`;
  ctx.fillText(speedMult, WORLD_WIDTH - 18, panelY + 18);

  // Message
  const msgY = 390;
  ctx.textAlign = 'center';
  ctx.font = `11px ${FONT}`;
  if (state.messageType === 'success') {
    ctx.fillStyle = C.success;
  } else if (state.messageType === 'danger') {
    ctx.fillStyle = C.danger;
  } else {
    ctx.fillStyle = C.textDim;
  }
  ctx.fillText(state.message, WORLD_WIDTH / 2, msgY);

  // Phase-specific overlays
  if (state.phase === 'SUCCESS') {
    drawOverlay(ctx, 'CIRCUIT RESTORED', 'ACCESS GRANTED', C.success);
  } else if (state.phase === 'FAILED') {
    drawOverlay(ctx, 'CIRCUIT OVERLOAD', 'REPAIR FAILED', C.danger);
  }
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  subtitle: string,
  title: string,
  color: string,
): void {
  // Dim background
  ctx.fillStyle = 'rgba(4, 8, 10, 0.85)';
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // Panel with bunker styling
  const cx = WORLD_WIDTH / 2;
  const cy = WORLD_HEIGHT / 2;
  const w = 240;
  const h = 90;

  ctx.fillStyle = C.panel;
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - w / 2 + 1, cy - h / 2 + 1, w - 2, h - 2);
  ctx.fillStyle = PALETTE.panelInner;
  ctx.fillRect(cx - w / 2 + 5, cy - h / 2 + 5, w - 10, h - 10);

  // Text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = `10px ${FONT}`;
  ctx.fillStyle = C.textDim;
  ctx.fillText(subtitle, cx, cy - 15);

  ctx.font = `bold 18px ${FONT}`;
  ctx.fillStyle = color;
  ctx.fillText(title, cx, cy + 12);
}

function drawFlash(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.flashUntilMs > state.timeMs && state.flashType) {
    ctx.fillStyle = state.flashType === 'good' ? C.flashGood : C.flashBad;
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }
}

function drawCrt(ctx: CanvasRenderingContext2D, scale: number): void {
  // Scanlines: one dark line every ~3 device pixels, expressed in world units.
  const step = Math.max(2, 3 / scale);
  ctx.fillStyle = C.scanline;
  for (let y = 0; y < WORLD_HEIGHT; y += step * 2) {
    ctx.fillRect(0, y, WORLD_WIDTH, step * 0.6);
  }
  // Vignette
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
