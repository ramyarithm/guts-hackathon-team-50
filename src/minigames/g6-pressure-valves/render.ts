// Canvas drawing for G6. Reads GameState, never mutates it. All art is canvas primitives,
// in the same bunker CRT palette as G1 and G3 (dark teal, green signal, amber hazard).

import {
  BURST_LOCKOUT_MS,
  BURST_MS,
  RED_ZONE,
  ROUND_MS,
  STICK_MS,
  STICK_THRESHOLD,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  secondsLeft,
  type Gauge,
  type GameState,
  type Side,
} from "./logic";

const FONT = '"ui-monospace", Menlo, Consolas, "Courier New", monospace';

const C = {
  letterbox: "#04070a",
  bg0: "#0a1411",
  bg1: "#060b0a",
  grid: "rgba(72, 214, 128, 0.07)",
  panel: "#182420",
  panelEdge: "#2f453b",
  panelInner: "#0e1613",
  glass: "#070d0b",
  amber: "#ffb347",
  amberDim: "rgba(255, 179, 71, 0.35)",
  green: "#5cff9d",
  greenDim: "rgba(92, 255, 157, 0.35)",
  text: "#b8f5cf",
  textDim: "rgba(184, 245, 207, 0.6)",
  danger: "#ff6b57",
  dangerDim: "rgba(255, 107, 87, 0.3)",
  flash: "#eafff2",
  scanline: "rgba(0, 0, 0, 0.18)",
} as const;

// ---- Layout (world units) -------------------------------------------------------

const GAUGE_CX: readonly [number, number] = [88, 232];
const DIAL_Y = 76;
const DIAL_R = 14;
const TUBE_W = 44;
const TUBE_TOP = 98;
const TUBE_H = 272;
const TUBE_BOTTOM = TUBE_TOP + TUBE_H;
const LABEL_Y = 378;
const PIPE_Y = 392;
const WHEEL_Y = 422;
const WHEEL_R = 17;
const PIPS_Y = 446;
const HINT_Y = 458;

const SIDE_NAME: readonly [string, string] = ["LEFT TANK", "RIGHT TANK"];

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
  drawManifold(ctx, state);
  for (const side of [0, 1] as const) {
    const g = state.gauges[side];
    drawTube(ctx, state, g, side);
    drawDial(ctx, state, g, side);
    drawValve(ctx, state, g, side);
  }
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

  // Static bunker-wall grid behind the air plant.
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

function drawPipe(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.strokeStyle = C.panelEdge;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = C.panel;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.lineCap = "butt";
}

function drawManifold(ctx: CanvasRenderingContext2D, state: GameState): void {
  // Each tank drains down to its valve wheel; a header pipe joins both to a junction box.
  for (const cx of GAUGE_CX) {
    drawPipe(ctx, cx, TUBE_BOTTOM, cx, WHEEL_Y);
  }
  drawPipe(ctx, GAUGE_CX[0], PIPE_Y, GAUGE_CX[1], PIPE_Y);

  const bw = 64;
  const bh = 26;
  const bx = WORLD_WIDTH / 2 - bw / 2;
  const by = PIPE_Y - bh / 2;
  ctx.fillStyle = C.panel;
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = C.panelEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
  ctx.fillStyle = C.panelInner;
  ctx.fillRect(bx + 5, by + 5, bw - 10, bh - 10);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold 8px ${FONT}`;
  ctx.fillStyle = state.phase === "BURST" ? C.danger : C.textDim;
  ctx.fillText("AIR PLANT", WORLD_WIDTH / 2, PIPE_Y);
}

// ---- Tanks ----------------------------------------------------------------------

function pressureColor(p: number): string {
  if (p >= RED_ZONE) return C.danger;
  if (p >= 0.5) return C.amber;
  return C.green;
}

function drawTube(ctx: CanvasRenderingContext2D, state: GameState, g: Gauge, side: Side): void {
  const cx = GAUGE_CX[side];
  const x = cx - TUBE_W / 2;
  const burst = state.phase === "BURST" && state.burstSide === side;

  // Housing.
  ctx.fillStyle = C.panel;
  ctx.fillRect(x - 6, TUBE_TOP - 8, TUBE_W + 12, TUBE_H + 16);
  ctx.strokeStyle = C.panelEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 5, TUBE_TOP - 7, TUBE_W + 10, TUBE_H + 14);

  // Sight glass.
  ctx.fillStyle = C.glass;
  ctx.fillRect(x, TUBE_TOP, TUBE_W, TUBE_H);

  // Red zone band with hazard dashes.
  const redTop = TUBE_TOP;
  const redBottom = TUBE_TOP + TUBE_H * (1 - RED_ZONE);
  ctx.fillStyle = "rgba(255, 107, 87, 0.12)";
  ctx.fillRect(x, redTop, TUBE_W, redBottom - redTop);
  ctx.fillStyle = C.dangerDim;
  for (let yy = redTop + 4; yy < redBottom - 2; yy += 10) ctx.fillRect(x + 2, yy, 6, 3);
  ctx.fillStyle = C.danger;
  ctx.fillRect(x, redBottom - 1, TUBE_W, 2);

  // Fill level.
  const level = burst ? 1 : g.pressure;
  const fillH = TUBE_H * level;
  const fillY = TUBE_BOTTOM - fillH;
  const color = burst ? C.danger : pressureColor(g.pressure);
  const surging = g.surgeMs > 0;
  ctx.save();
  if (surging || burst) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
  }
  const grad = ctx.createLinearGradient(0, fillY, 0, TUBE_BOTTOM);
  grad.addColorStop(0, color);
  grad.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = color;
  ctx.fillRect(x + 2, fillY, TUBE_W - 4, fillH);
  ctx.fillStyle = grad;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(x + 2, fillY, TUBE_W - 4, fillH);
  ctx.globalAlpha = 1;
  ctx.restore();
  // Bright meniscus line.
  ctx.fillStyle = C.flash;
  ctx.globalAlpha = 0.7;
  ctx.fillRect(x + 2, fillY, TUBE_W - 4, 2);
  ctx.globalAlpha = 1;

  // Scale ticks every 10%.
  ctx.fillStyle = "rgba(184, 245, 207, 0.35)";
  for (let i = 1; i < 10; i++) {
    const yy = TUBE_BOTTOM - TUBE_H * (i / 10);
    const w = i % 5 === 0 ? 10 : 5;
    ctx.fillRect(x + TUBE_W - w, yy, w, 1);
  }

  // Glass highlight.
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(x + 3, TUBE_TOP + 2, 4, TUBE_H - 4);

  // Vent hiss at the relief port on top.
  if (g.ventFlashMs > 0) {
    const k = g.ventFlashMs / 220;
    ctx.strokeStyle = C.flash;
    ctx.globalAlpha = k;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
      ctx.moveTo(cx + i * 8, TUBE_TOP - 10);
      ctx.lineTo(cx + i * 14, TUBE_TOP - 22 - (1 - k) * 10);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Surge warning: amber flash above the tank before the spike lands.
  if (g.warnMs > 0 && state.phase === "PLAYING") {
    const on = Math.floor(state.timeMs / 90) % 2 === 0;
    if (on) {
      ctx.fillStyle = C.amber;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `bold 10px ${FONT}`;
      ctx.fillText("SURGE", cx, DIAL_Y + DIAL_R + 10);
      ctx.strokeStyle = C.amber;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 6, TUBE_TOP - 8, TUBE_W + 12, TUBE_H + 16);
    }
  }

  // Tank name.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold 9px ${FONT}`;
  ctx.fillStyle = burst ? C.danger : C.textDim;
  ctx.fillText(SIDE_NAME[side], cx, LABEL_Y);
}

/** Small dial above each tank: a ring that fills with time spent in the red. */
function drawDial(ctx: CanvasRenderingContext2D, state: GameState, g: Gauge, side: Side): void {
  const cx = GAUGE_CX[side];
  const burst = state.phase === "BURST" && state.burstSide === side;
  const frac = burst ? 1 : Math.min(1, g.redMs / BURST_MS);

  ctx.fillStyle = C.panel;
  ctx.beginPath();
  ctx.arc(cx, DIAL_Y, DIAL_R + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.panelInner;
  ctx.beginPath();
  ctx.arc(cx, DIAL_Y, DIAL_R, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 107, 87, 0.2)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, DIAL_Y, DIAL_R - 3, 0, Math.PI * 2);
  ctx.stroke();
  if (frac > 0) {
    ctx.strokeStyle = C.danger;
    ctx.beginPath();
    ctx.arc(cx, DIAL_Y, DIAL_R - 3, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
  }

  // Centre reads the pressure as a percentage.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold 8px ${FONT}`;
  ctx.fillStyle = burst ? C.danger : pressureColor(g.pressure);
  ctx.fillText(`${Math.round((burst ? 1 : g.pressure) * 100)}`, cx, DIAL_Y);
}

// ---- Valves -------------------------------------------------------------------

function drawValve(ctx: CanvasRenderingContext2D, state: GameState, g: Gauge, side: Side): void {
  const cx = GAUGE_CX[side];
  const stuck = g.stuckMs > 0 && state.phase === "PLAYING";
  const flash = g.ventFlashMs > 0 ? g.ventFlashMs / 220 : 0;
  // Each vent turns the wheel a notch; the turn eases in over the flash.
  const angle = g.vents * 0.9 - flash * 0.9;
  const rim = stuck ? C.danger : C.panelEdge;
  const spoke = stuck ? C.danger : flash > 0 ? C.green : C.text;

  ctx.save();
  ctx.translate(cx, WHEEL_Y);
  ctx.rotate(angle);
  if (stuck) {
    // Jammed: a judder.
    ctx.rotate(Math.sin(state.timeMs / 30) * 0.05);
  }
  ctx.fillStyle = C.panel;
  ctx.beginPath();
  ctx.arc(0, 0, WHEEL_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, WHEEL_R - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = spoke;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * (WHEEL_R - 4), Math.sin(a) * (WHEEL_R - 4));
  }
  ctx.stroke();
  ctx.fillStyle = spoke;
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (stuck) {
    // Jam countdown under the wheel.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold 9px ${FONT}`;
    ctx.fillStyle = C.danger;
    ctx.fillText("STUCK", cx, PIPS_Y);
    const w = 40;
    const k = Math.max(0, g.stuckMs / STICK_MS);
    ctx.fillStyle = C.dangerDim;
    ctx.fillRect(cx - w / 2, PIPS_Y + 7, w, 3);
    ctx.fillStyle = C.danger;
    ctx.fillRect(cx - w / 2, PIPS_Y + 7, w * k, 3);
    return;
  }

  // Strain pips: one per consecutive vent; all lit means the next press jams it.
  const pips = STICK_THRESHOLD - 1;
  const pipW = 8;
  const gap = 4;
  const total = pips * pipW + (pips - 1) * gap;
  for (let i = 0; i < pips; i++) {
    const lit = i < g.streak;
    const last = lit && g.streak === pips;
    ctx.fillStyle = last ? C.amber : lit ? C.green : "rgba(92,255,157,0.15)";
    ctx.fillRect(cx - total / 2 + i * (pipW + gap), PIPS_Y - 2, pipW, 5);
  }
}

// ---- Text ---------------------------------------------------------------------

function drawHud(ctx: CanvasRenderingContext2D, state: GameState): void {
  const secs = state.phase === "READY" ? ROUND_MS / 1000 : secondsLeft(state);
  const mm = Math.floor(secs / 60);
  const ss = String(secs % 60).padStart(2, "0");
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.font = `bold 12px ${FONT}`;
  ctx.fillStyle = C.text;
  ctx.fillText(`HOLD PRESSURE  ${mm}:${ss}`, 12, 16);

  if (state.bursts > 0) {
    ctx.textAlign = "right";
    ctx.font = `10px ${FONT}`;
    ctx.fillStyle = C.textDim;
    ctx.fillText(`RUPTURES ${state.bursts}`, WORLD_WIDTH - 12, 17);
  }

  // Round timer: a bar that drains as the clock runs down, amber in the last ten seconds.
  const barX = 12;
  const barY = 34;
  const barW = WORLD_WIDTH - 24;
  const remaining = state.phase === "SUCCESS" ? 0 : Math.max(0, 1 - state.elapsedMs / ROUND_MS);
  ctx.fillStyle = "rgba(92,255,157,0.12)";
  ctx.fillRect(barX, barY, barW, 6);
  ctx.fillStyle = state.phase === "SUCCESS" ? C.green : secs <= 10 ? C.amber : C.green;
  ctx.fillRect(barX, barY, state.phase === "SUCCESS" ? barW : barW * remaining, 6);
  ctx.strokeStyle = "rgba(92,255,157,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(barX - 2.5, barY - 2.5, barW + 5, 11);
}

function drawHint(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.phase !== "PLAYING") return;
  const cx = WORLD_WIDTH / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `11px ${FONT}`;
  const anyRed = state.gauges.some((g) => g.pressure >= RED_ZONE);
  const anyStuck = state.gauges.some((g) => g.stuckMs > 0);
  if (anyStuck) {
    ctx.fillStyle = C.danger;
    ctx.fillText("Valve jammed. Work the other one.", cx, HINT_Y);
  } else if (anyRed) {
    ctx.fillStyle = C.danger;
    ctx.fillText("Vent now! Tank in the red.", cx, HINT_Y);
  } else {
    ctx.fillStyle = C.textDim;
    ctx.fillText("Vent before the red. Alternate valves.", cx, HINT_Y);
  }
}

function drawOverlay(ctx: CanvasRenderingContext2D, state: GameState): void {
  const cx = WORLD_WIDTH / 2;
  const cy = TUBE_TOP + TUBE_H / 2;
  const blink = Math.sin(state.timeMs / 300) > 0;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  switch (state.phase) {
    case "READY": {
      drawCard(ctx, cx, cy, 262, 104);
      ctx.fillStyle = C.text;
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText("STABILISE THE AIR PLANT", cx, cy - 30);
      ctx.fillStyle = C.textDim;
      ctx.font = `11px ${FONT}`;
      ctx.fillText("Vent each tank before it hits the red.", cx, cy - 8);
      ctx.fillText(`Hold both steady for ${ROUND_MS / 1000} seconds.`, cx, cy + 7);
      if (blink) {
        ctx.fillStyle = C.green;
        ctx.font = `bold 12px ${FONT}`;
        ctx.fillText("PRESS TO START", cx, cy + 30);
      }
      break;
    }
    case "BURST": {
      ctx.fillStyle = "rgba(255, 107, 87, 0.08)";
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      drawCard(ctx, cx, cy, 230, 92);
      ctx.fillStyle = C.danger;
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText("TANK RUPTURE", cx, cy - 20);
      ctx.fillStyle = C.textDim;
      ctx.font = `11px ${FONT}`;
      ctx.fillText(state.burstSide === null ? "" : `${SIDE_NAME[state.burstSide]} held in the red too long.`, cx, cy + 2);
      if (state.phaseMs >= BURST_LOCKOUT_MS && blink) {
        ctx.fillStyle = C.text;
        ctx.font = `bold 12px ${FONT}`;
        ctx.fillText("PRESS TO RETRY", cx, cy + 26);
      }
      break;
    }
    case "SUCCESS": {
      ctx.fillStyle = "rgba(92, 255, 157, 0.08)";
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      drawCard(ctx, cx, cy, 250, 80);
      ctx.save();
      ctx.shadowColor = C.green;
      ctx.shadowBlur = 16;
      ctx.fillStyle = C.green;
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText("PLANT STABILISED", cx, cy - 12);
      ctx.restore();
      ctx.fillStyle = C.textDim;
      ctx.font = `11px ${FONT}`;
      ctx.fillText("Trunk pressure nominal.", cx, cy + 16);
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
