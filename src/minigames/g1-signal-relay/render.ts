// Canvas drawing for G1. Reads GameState, never mutates it. All art is canvas primitives.

import {
  CRASH_LOCKOUT_MS,
  FLOOR_Y,
  GAP_HEIGHT,
  OBSTACLE_WIDTH,
  PULSE_RADIUS,
  PULSE_X,
  TARGET_GAPS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type GameState,
  type Obstacle,
} from "./logic";

const FONT = '"ui-monospace", Menlo, Consolas, "Courier New", monospace';

const C = {
  letterbox: "#04070a",
  bg0: "#0a1411",
  bg1: "#060b0a",
  grid: "rgba(72, 214, 128, 0.07)",
  floor: "#101a16",
  floorEdge: "#2a4a3a",
  hazard: "#c98a1a",
  pylon: "#182420",
  pylonEdge: "#2f453b",
  pylonInner: "#0e1613",
  amber: "#ffb347",
  amberDim: "rgba(255, 179, 71, 0.35)",
  green: "#5cff9d",
  greenDim: "rgba(92, 255, 157, 0.35)",
  text: "#b8f5cf",
  textDim: "rgba(184, 245, 207, 0.6)",
  danger: "#ff6b57",
  scanline: "rgba(0, 0, 0, 0.18)",
} as const;

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

  drawBackground(ctx, state);
  drawCeiling(ctx, state);
  for (const o of state.obstacles) drawPylon(ctx, state, o);
  drawFloor(ctx, state);
  drawSignalPath(ctx, state);
  drawPulse(ctx, state);
  drawHud(ctx, state);
  drawOverlay(ctx, state);
  drawCrt(ctx, scale);

  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, state: GameState): void {
  const g = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  g.addColorStop(0, C.bg0);
  g.addColorStop(1, C.bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // Slow parallax grid: the bunker wall behind the relay run.
  const cell = 40;
  const shift = (state.distance * 0.35) % cell;
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -shift; x <= WORLD_WIDTH; x += cell) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, FLOOR_Y);
  }
  for (let y = 0; y <= FLOOR_Y; y += cell) {
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_WIDTH, y);
  }
  ctx.stroke();
}

function drawCeiling(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = C.floor;
  ctx.fillRect(0, 0, WORLD_WIDTH, 6);
  ctx.fillStyle = C.floorEdge;
  ctx.fillRect(0, 6, WORLD_WIDTH, 1);
  // Conduit lamps along the ceiling.
  const spacing = 80;
  const shift = state.distance % spacing;
  for (let x = -shift; x <= WORLD_WIDTH + spacing; x += spacing) {
    const on = Math.sin(state.timeMs / 500 + x) > -0.6;
    ctx.fillStyle = on ? C.amberDim : "rgba(255,179,71,0.08)";
    ctx.fillRect(x - 3, 2, 6, 3);
  }
}

function drawFloor(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = C.floor;
  ctx.fillRect(0, FLOOR_Y, WORLD_WIDTH, WORLD_HEIGHT - FLOOR_Y);
  ctx.fillStyle = C.floorEdge;
  ctx.fillRect(0, FLOOR_Y, WORLD_WIDTH, 2);
  // Hazard dashes that scroll with the world.
  const dash = 24;
  const shift = state.distance % (dash * 2);
  ctx.fillStyle = C.hazard;
  for (let x = -shift; x <= WORLD_WIDTH; x += dash * 2) {
    ctx.fillRect(x, FLOOR_Y + 8, dash, 3);
  }
  // Cable tray lines.
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(0, FLOOR_Y + 16, WORLD_WIDTH, 1);
  ctx.fillRect(0, FLOOR_Y + 22, WORLD_WIDTH, 1);
}

function drawPylon(ctx: CanvasRenderingContext2D, state: GameState, o: Obstacle): void {
  const gapBottom = o.gapTop + GAP_HEIGHT;
  const x = o.x;
  const w = OBSTACLE_WIDTH;

  // Upper and lower relay pylons.
  drawPylonBody(ctx, x, 0, w, o.gapTop);
  drawPylonBody(ctx, x, gapBottom, w, FLOOR_Y - gapBottom);

  // Junction-box caps that face the gap.
  const capH = 14;
  const capPad = 4;
  const accent = o.passed ? C.green : C.amber;
  const accentDim = o.passed ? C.greenDim : C.amberDim;

  ctx.fillStyle = C.pylonEdge;
  ctx.fillRect(x - capPad, o.gapTop - capH, w + capPad * 2, capH);
  ctx.fillRect(x - capPad, gapBottom, w + capPad * 2, capH);
  ctx.fillStyle = accent;
  ctx.fillRect(x - capPad, o.gapTop - 3, w + capPad * 2, 3);
  ctx.fillRect(x - capPad, gapBottom, w + capPad * 2, 3);

  // Broken-wire sparks at the gap edges until the pulse has bridged this box.
  if (!o.passed) {
    const flicker = 0.5 + 0.5 * Math.sin(state.timeMs / 70 + x);
    ctx.fillStyle = accentDim;
    ctx.globalAlpha = flicker;
    ctx.fillRect(x + w / 2 - 2, o.gapTop, 4, 10);
    ctx.fillRect(x + w / 2 - 2, gapBottom - 10, 4, 10);
    ctx.globalAlpha = 1;
  } else {
    // A restored link glows softly across the gap.
    ctx.strokeStyle = accentDim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, o.gapTop);
    ctx.lineTo(x + w / 2, gapBottom);
    ctx.stroke();
  }
}

function drawPylonBody(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  if (h <= 0) return;
  ctx.fillStyle = C.pylon;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = C.pylonEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  // Inner panel lines.
  ctx.fillStyle = C.pylonInner;
  ctx.fillRect(x + 8, y + 6, w - 16, Math.max(0, h - 12));
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let yy = y + 14; yy < y + h - 8; yy += 18) ctx.fillRect(x + 10, yy, w - 20, 1);
}

function drawSignalPath(ctx: CanvasRenderingContext2D, state: GameState): void {
  // The line already restored behind the pulse.
  const y = pulseDrawY(state);
  const g = ctx.createLinearGradient(0, 0, PULSE_X, 0);
  g.addColorStop(0, "rgba(92,255,157,0)");
  g.addColorStop(1, "rgba(92,255,157,0.45)");
  ctx.strokeStyle = g;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(PULSE_X, y);
  ctx.stroke();
}

function pulseDrawY(state: GameState): number {
  if (state.phase === "READY") return state.pulseY + Math.sin(state.timeMs / 350) * 6;
  return state.pulseY;
}

function drawPulse(ctx: CanvasRenderingContext2D, state: GameState): void {
  const y = pulseDrawY(state);
  const sincePulse = state.timeMs - state.lastPulseMs;
  const flash = sincePulse < 160 ? 1 - sincePulse / 160 : 0;
  const crashed = state.phase === "CRASHED";
  const core = crashed ? C.danger : C.green;

  // Trail.
  for (let i = 1; i <= 5; i++) {
    ctx.globalAlpha = (0.28 * (6 - i)) / 6;
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(PULSE_X - i * 9, y, PULSE_RADIUS * (1 - i * 0.14), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Glow.
  ctx.save();
  ctx.shadowColor = core;
  ctx.shadowBlur = 18 + flash * 20;
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(PULSE_X, y, PULSE_RADIUS + flash * 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Bright core.
  ctx.fillStyle = "#eafff2";
  ctx.beginPath();
  ctx.arc(PULSE_X, y, PULSE_RADIUS * 0.45, 0, Math.PI * 2);
  ctx.fill();

  // Pulse ring on each press.
  if (flash > 0) {
    ctx.strokeStyle = core;
    ctx.globalAlpha = flash * 0.8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(PULSE_X, y, PULSE_RADIUS + (1 - flash) * 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawHud(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.font = `bold 12px ${FONT}`;
  ctx.fillStyle = C.text;
  ctx.fillText(`LINE RESTORED  ${state.passed}/${TARGET_GAPS}`, 12, 16);

  // Segmented progress bar.
  const barX = 12;
  const barY = 34;
  const barW = WORLD_WIDTH - 24;
  const segGap = 3;
  const segW = (barW - segGap * (TARGET_GAPS - 1)) / TARGET_GAPS;
  for (let i = 0; i < TARGET_GAPS; i++) {
    const filled = i < state.passed;
    ctx.fillStyle = filled ? C.green : "rgba(92,255,157,0.12)";
    ctx.fillRect(barX + i * (segW + segGap), barY, segW, 6);
  }
  ctx.strokeStyle = "rgba(92,255,157,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(barX - 2.5, barY - 2.5, barW + 5, 11);
}

function drawOverlay(ctx: CanvasRenderingContext2D, state: GameState): void {
  const cx = WORLD_WIDTH / 2;
  const blink = Math.sin(state.timeMs / 300) > 0;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  switch (state.phase) {
    case "READY": {
      drawCard(ctx, cx, 340, 260, 92);
      ctx.fillStyle = C.text;
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText("RE-ESTABLISH THE LINE", cx, 318);
      ctx.fillStyle = C.textDim;
      ctx.font = `11px ${FONT}`;
      ctx.fillText("Guide the pulse through the relay gaps.", cx, 340);
      ctx.fillText(`Bridge ${TARGET_GAPS} junction boxes.`, cx, 355);
      if (blink) {
        ctx.fillStyle = C.green;
        ctx.font = `bold 12px ${FONT}`;
        ctx.fillText("PRESS TO PULSE", cx, 374);
      }
      break;
    }
    case "CRASHED": {
      ctx.fillStyle = "rgba(255, 107, 87, 0.08)";
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      drawCard(ctx, cx, WORLD_HEIGHT / 2, 220, 80);
      ctx.fillStyle = C.danger;
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText("SIGNAL LOST", cx, WORLD_HEIGHT / 2 - 14);
      if (state.phaseMs >= CRASH_LOCKOUT_MS && blink) {
        ctx.fillStyle = C.text;
        ctx.font = `bold 12px ${FONT}`;
        ctx.fillText("PRESS TO RETRY", cx, WORLD_HEIGHT / 2 + 16);
      }
      break;
    }
    case "SUCCESS": {
      ctx.fillStyle = "rgba(92, 255, 157, 0.08)";
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      drawCard(ctx, cx, WORLD_HEIGHT / 2, 240, 80);
      ctx.save();
      ctx.shadowColor = C.green;
      ctx.shadowBlur = 16;
      ctx.fillStyle = C.green;
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText("LINE RESTORED", cx, WORLD_HEIGHT / 2 - 12);
      ctx.restore();
      ctx.fillStyle = C.textDim;
      ctx.font = `11px ${FONT}`;
      ctx.fillText("Carrier tone detected.", cx, WORLD_HEIGHT / 2 + 16);
      break;
    }
    case "PLAYING":
      break;
  }
}

function drawCard(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
  ctx.fillStyle = "rgba(4, 10, 8, 0.86)";
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.strokeStyle = "rgba(92,255,157,0.35)";
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
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
}
