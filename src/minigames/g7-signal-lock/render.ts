// Canvas drawing for G7 "Signal Lock". Reads GameState, never mutates it. Deliberately
// sparse: a dial, a needle, the green target zone and a row of signal bars, plus the
// normal UI labels in the shared text style. Same bunker palette as G1 and G3.

import { SHAKE_MS, TARGET_BARS, WORLD_HEIGHT, WORLD_WIDTH, type GameState } from './logic';

const FONT = '"ui-monospace", Menlo, Consolas, "Courier New", monospace';

const C = {
  letterbox: '#04070a',
  bg0: '#0a1411',
  bg1: '#060b0a',
  dial: '#2f453b',
  dialDim: '#182420',
  tick: 'rgba(184, 245, 207, 0.35)',
  needle: '#b8f5cf',
  green: '#5cff9d',
  greenDim: 'rgba(92, 255, 157, 0.18)',
  barOff: 'rgba(92, 255, 157, 0.12)',
  text: '#b8f5cf',
  textDim: 'rgba(184, 245, 207, 0.6)',
  danger: '#ff6b57',
  scanline: 'rgba(0, 0, 0, 0.18)',
} as const;

// ---- Layout (world units) -------------------------------------------------------

const DIAL_CX = WORLD_WIDTH / 2;
const DIAL_CY = 236;
const DIAL_R = 118;
const BARS_BASE_Y = 330;
const BAR_W = 20;
const BAR_GAP = 10;

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

  const g = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  g.addColorStop(0, C.bg0);
  g.addColorStop(1, C.bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // The dial shakes briefly after a miss.
  const k = state.shakeMs > 0 ? state.shakeMs / SHAKE_MS : 0;
  const sx = k * Math.sin(state.timeMs / 14) * 5;
  const sy = k * Math.cos(state.timeMs / 19) * 3;

  ctx.save();
  ctx.translate(sx, sy);
  drawDial(ctx, state);
  drawZone(ctx, state);
  drawNeedle(ctx, state);
  ctx.restore();

  drawBars(ctx, state);
  drawText(ctx, state);
  drawCrt(ctx, scale);

  ctx.restore();
}

/** Dial angle for a needle position 0..1: left end of the arc to the right end. */
function angleFor(pos: number): number {
  return Math.PI + pos * Math.PI;
}

function drawDial(ctx: CanvasRenderingContext2D, state: GameState): void {
  // Arc.
  ctx.strokeStyle = C.dialDim;
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(DIAL_CX, DIAL_CY, DIAL_R, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = C.dial;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(DIAL_CX, DIAL_CY, DIAL_R + 7, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(DIAL_CX, DIAL_CY, DIAL_R - 7, Math.PI, Math.PI * 2);
  ctx.stroke();
  // Baseline.
  ctx.fillStyle = C.dial;
  ctx.fillRect(DIAL_CX - DIAL_R - 7, DIAL_CY, DIAL_R * 2 + 14, 2);
  // Ticks.
  ctx.strokeStyle = C.tick;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 20; i++) {
    const a = angleFor(i / 20);
    const major = i % 5 === 0;
    const r0 = DIAL_R - 7;
    const r1 = r0 - (major ? 10 : 5);
    ctx.beginPath();
    ctx.moveTo(DIAL_CX + Math.cos(a) * r0, DIAL_CY + Math.sin(a) * r0);
    ctx.lineTo(DIAL_CX + Math.cos(a) * r1, DIAL_CY + Math.sin(a) * r1);
    ctx.stroke();
  }
  // Hesitation: the dial's rim stutters very slightly when something interferes.
  if (state.stutterMs > 0) {
    ctx.strokeStyle = C.tick;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(
      DIAL_CX,
      DIAL_CY,
      DIAL_R + 7 + (Math.floor(state.timeMs / 16) % 2),
      Math.PI,
      Math.PI * 2,
    );
    ctx.stroke();
  }
}

function drawZone(ctx: CanvasRenderingContext2D, state: GameState): void {
  const a0 = angleFor(state.zone.start);
  const a1 = angleFor(state.zone.start + state.zone.width);
  const hit = state.phase === 'HOLD' && state.lastResult === 'HIT';
  const flash = hit && Math.floor(state.phaseMs / 70) % 2 === 0;
  // Band.
  ctx.strokeStyle = flash ? C.green : C.greenDim;
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(DIAL_CX, DIAL_CY, DIAL_R, a0, a1);
  ctx.stroke();
  // Bright edge on the inside of the band.
  ctx.strokeStyle = C.green;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(DIAL_CX, DIAL_CY, DIAL_R - 7, a0, a1);
  ctx.stroke();
  // End caps.
  ctx.lineWidth = 2;
  for (const a of [a0, a1]) {
    ctx.beginPath();
    ctx.moveTo(DIAL_CX + Math.cos(a) * (DIAL_R - 7), DIAL_CY + Math.sin(a) * (DIAL_R - 7));
    ctx.lineTo(DIAL_CX + Math.cos(a) * (DIAL_R + 7), DIAL_CY + Math.sin(a) * (DIAL_R + 7));
    ctx.stroke();
  }
}

function drawNeedle(ctx: CanvasRenderingContext2D, state: GameState): void {
  const a = angleFor(state.needle);
  let color: string = C.needle;
  if (state.phase === 'HOLD') color = state.lastResult === 'HIT' ? C.green : C.danger;
  if (state.phase === 'SUCCESS') color = C.green;
  if (state.phase === 'FAILED') color = C.danger;
  const len = DIAL_R - 4;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(DIAL_CX, DIAL_CY);
  ctx.lineTo(DIAL_CX + Math.cos(a) * len, DIAL_CY + Math.sin(a) * len);
  ctx.stroke();
  ctx.lineCap = 'butt';
  // Hub.
  ctx.fillStyle = C.dial;
  ctx.beginPath();
  ctx.arc(DIAL_CX, DIAL_CY, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(DIAL_CX, DIAL_CY, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawBars(ctx: CanvasRenderingContext2D, state: GameState): void {
  const total = TARGET_BARS * BAR_W + (TARGET_BARS - 1) * BAR_GAP;
  const x0 = WORLD_WIDTH / 2 - total / 2;
  const justLocked = state.phase === 'HOLD' && state.lastResult === 'HIT' ? state.bars - 1 : -1;
  for (let i = 0; i < TARGET_BARS; i++) {
    const h = 14 + i * 7;
    const x = x0 + i * (BAR_W + BAR_GAP);
    const y = BARS_BASE_Y - h;
    const locked = i < state.bars;
    let color: string = locked ? C.green : C.barOff;
    if (i === justLocked && Math.floor(state.phaseMs / 70) % 2 === 0) color = C.text;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, BAR_W, h);
  }
  ctx.fillStyle = C.dial;
  ctx.fillRect(x0 - 6, BARS_BASE_Y + 2, total + 12, 1);
}

function drawText(ctx: CanvasRenderingContext2D, state: GameState): void {
  const cx = WORLD_WIDTH / 2;
  const blink = Math.sin(state.timeMs / 300) > 0;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  switch (state.phase) {
    case 'READY':
      ctx.fillStyle = C.text;
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText('SIGNAL LOCK', cx, 388);
      ctx.fillStyle = C.textDim;
      ctx.font = `11px ${FONT}`;
      ctx.fillText('Stop the needle in the green.', cx, 410);
      ctx.fillText(`Lock ${TARGET_BARS} bars.`, cx, 425);
      if (blink) {
        ctx.fillStyle = C.green;
        ctx.font = `bold 12px ${FONT}`;
        ctx.fillText('PRESS LOCK', cx, 446);
      }
      break;
    case 'SWEEPING':
    case 'HOLD':
      if (state.bars === 0 && state.attempts === 0) {
        ctx.fillStyle = C.textDim;
        ctx.font = `11px ${FONT}`;
        ctx.fillText('LOCK stops the needle.', cx, 400);
      }
      ctx.fillStyle = C.textDim;
      ctx.font = `11px ${FONT}`;
      ctx.fillText(`${state.bars}/${TARGET_BARS}`, cx, 352);
      break;
    case 'SUCCESS':
      ctx.fillStyle = C.green;
      ctx.font = `bold 18px ${FONT}`;
      ctx.fillText('SIGNAL LOCKED', cx, 396);
      ctx.fillStyle = C.textDim;
      ctx.font = `11px ${FONT}`;
      ctx.fillText('Carrier steady.', cx, 420);
      break;
    case 'FAILED':
      ctx.fillStyle = C.danger;
      ctx.font = `bold 18px ${FONT}`;
      ctx.fillText('SIGNAL LOST', cx, 396);
      ctx.fillStyle = C.textDim;
      ctx.font = `11px ${FONT}`;
      ctx.fillText('Needle missed the zone.', cx, 420);
      break;
  }
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
