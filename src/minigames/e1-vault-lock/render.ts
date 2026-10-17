// Canvas drawing for E1 (vault lock). Reads GameState only. Canvas primitives and
// gradients only, in the bunker style shared with G1 and G2.

import {
  CLICK_FLASH_MS,
  CODE_LENGTH,
  DIAL_SIZE,
  DROP_LOCKOUT_MS,
  LOCK_FLASH_MS,
  SUCCESS_HOLD_MS,
  TICK_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  dialVisualPosition,
  meterLevel,
  stepHint,
  type GameState,
} from "./logic";

const FONT = '"ui-monospace", Menlo, Consolas, "Courier New", monospace';

const C = {
  letterbox: "#04070a",
  wall0: "#0c1512",
  wall1: "#070c0a",
  doorOuter: "#2a3a35",
  doorInner: "#1b2824",
  doorEdge: "#49605c",
  bolt: "#657971",
  boltDark: "#1a2522",
  interior: "#030705",
  dialRim0: "#5b6f69",
  dialRim1: "#2b3b36",
  dialFace0: "#1d2a26",
  dialFace1: "#0f1715",
  tick: "#9fb3ab",
  tickMinor: "#4f655e",
  number: "#e0e8da",
  indicator: "#ffb347",
  amber: "#ffb347",
  amberDim: "rgba(255, 179, 71, 0.4)",
  green: "#5cff9d",
  greenDim: "rgba(92, 255, 157, 0.35)",
  text: "#b8f5cf",
  textDim: "rgba(184, 245, 207, 0.65)",
  danger: "#ff6b57",
  meterBg: "#061009",
  scanline: "rgba(0, 0, 0, 0.18)",
} as const;

const DIAL_CX = WORLD_WIDTH / 2;
const DIAL_CY = 222;
const DIAL_R = 92;
const HANDLE_CX = 262;
const HANDLE_CY = 372;
const HANDLE_R = 24;
const METER_X = 20;
const METER_Y = 406;
const METER_W = WORLD_WIDTH - 40;
const METER_H = 44;
const DOOR = { x: 14, y: 54, w: WORLD_WIDTH - 28, h: 404 };

export interface Renderer {
  drawFrame(ctx: CanvasRenderingContext2D, state: GameState, canvasW: number, canvasH: number): void;
}

/** Create a renderer with cached static layers (wall + door frame, CRT overlay). */
export function createRenderer(): Renderer {
  let cacheKey = "";
  let back: HTMLCanvasElement | null = null;
  let front: HTMLCanvasElement | null = null;

  const ensureLayers = (canvasW: number, canvasH: number, scale: number, offX: number, offY: number): void => {
    const key = `${canvasW}x${canvasH}`;
    if (key === cacheKey && back && front) return;
    cacheKey = key;
    back = document.createElement("canvas");
    back.width = canvasW;
    back.height = canvasH;
    front = document.createElement("canvas");
    front.width = canvasW;
    front.height = canvasH;
    const bctx = back.getContext("2d");
    const fctx = front.getContext("2d");
    if (!bctx || !fctx) return;

    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.fillStyle = C.letterbox;
    bctx.fillRect(0, 0, canvasW, canvasH);
    bctx.setTransform(scale, 0, 0, scale, offX, offY);
    clipWorld(bctx);
    drawWall(bctx);
    bctx.restore();

    fctx.setTransform(scale, 0, 0, scale, offX, offY);
    clipWorld(fctx);
    drawCrt(fctx, scale);
    fctx.restore();
  };

  return {
    drawFrame(ctx, state, canvasW, canvasH): void {
      const scale = Math.min(canvasW / WORLD_WIDTH, canvasH / WORLD_HEIGHT);
      const offX = (canvasW - WORLD_WIDTH * scale) / 2;
      const offY = (canvasH - WORLD_HEIGHT * scale) / 2;
      ensureLayers(canvasW, canvasH, scale, offX, offY);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (back) ctx.drawImage(back, 0, 0);
      else {
        ctx.fillStyle = C.letterbox;
        ctx.fillRect(0, 0, canvasW, canvasH);
      }

      ctx.setTransform(scale, 0, 0, scale, offX, offY);
      clipWorld(ctx);
      const alpha = Math.min(0.999, Math.max(0, state.accumulatorMs / TICK_MS));
      const open = state.phase === "SUCCESS" ? Math.min(1, state.phaseMs / SUCCESS_HOLD_MS) : 0;

      drawInterior(ctx, open);
      drawDoor(ctx, state, alpha, open);
      drawMeter(ctx, state);
      drawHud(ctx, state);
      drawMessage(ctx, state);
      ctx.restore();

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (front) ctx.drawImage(front, 0, 0);
    },
  };
}

function clipWorld(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  ctx.clip();
}

// ---- Static wall ------------------------------------------------------------------

function drawWall(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  g.addColorStop(0, C.wall0);
  g.addColorStop(1, C.wall1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  // Concrete panel lines.
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let y = 24; y < WORLD_HEIGHT; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(WORLD_WIDTH, y + 0.5);
    ctx.stroke();
  }
  // Hazard stripe above the door.
  for (let x = 0; x < WORLD_WIDTH; x += 16) {
    ctx.fillStyle = (x / 16) % 2 === 0 ? C.amberDim : "rgba(0,0,0,0.4)";
    ctx.fillRect(x, DOOR.y - 10, 16, 4);
  }
  // Fixed door frame (the opening the door leaf sits in).
  ctx.fillStyle = C.doorEdge;
  roundRect(ctx, DOOR.x - 6, DOOR.y - 6, DOOR.w + 12, DOOR.h + 12, 14);
  ctx.fill();
}

// ---- Interior revealed when the door opens -------------------------------------------------

function drawInterior(ctx: CanvasRenderingContext2D, open: number): void {
  ctx.fillStyle = C.interior;
  roundRect(ctx, DOOR.x, DOOR.y, DOOR.w, DOOR.h, 10);
  ctx.fill();
  if (open <= 0) return;
  // Shelves and a glowing terminal inside.
  ctx.globalAlpha = Math.min(1, open * 1.5);
  ctx.fillStyle = "#0e1a15";
  for (let y = DOOR.y + 70; y < DOOR.y + DOOR.h - 40; y += 80) ctx.fillRect(DOOR.x + 30, y, DOOR.w - 60, 6);
  ctx.save();
  ctx.shadowColor = C.green;
  ctx.shadowBlur = 18;
  ctx.fillStyle = C.green;
  ctx.font = `bold 14px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("LINE RESTORED", WORLD_WIDTH / 2, DOOR.y + 44);
  ctx.restore();
  ctx.fillStyle = C.greenDim;
  for (let i = 0; i < 6; i++) ctx.fillRect(DOOR.x + 40 + i * 40, DOOR.y + 110, 20, 4);
  ctx.globalAlpha = 1;
}

// ---- Door leaf, dial and handle ---------------------------------------------------------

function drawDoor(ctx: CanvasRenderingContext2D, state: GameState, alpha: number, open: number): void {
  // The leaf swings on its left hinge: foreshorten it horizontally as it opens.
  const eased = 1 - Math.pow(1 - open, 3);
  const widthScale = Math.max(0.06, 1 - eased * 0.94);
  ctx.save();
  ctx.translate(DOOR.x, 0);
  ctx.scale(widthScale, 1);
  ctx.translate(-DOOR.x, 0);

  const g = ctx.createLinearGradient(DOOR.x, DOOR.y, DOOR.x + DOOR.w, DOOR.y + DOOR.h);
  g.addColorStop(0, C.doorOuter);
  g.addColorStop(1, C.doorInner);
  ctx.fillStyle = g;
  roundRect(ctx, DOOR.x, DOOR.y, DOOR.w, DOOR.h, 10);
  ctx.fill();
  ctx.strokeStyle = C.doorEdge;
  ctx.lineWidth = 2;
  roundRect(ctx, DOOR.x + 1, DOOR.y + 1, DOOR.w - 2, DOOR.h - 2, 9);
  ctx.stroke();
  // Inner panel and bolts.
  ctx.fillStyle = C.doorInner;
  roundRect(ctx, DOOR.x + 16, DOOR.y + 16, DOOR.w - 32, DOOR.h - 32, 8);
  ctx.fill();
  ctx.fillStyle = C.bolt;
  const boltPositions: Array<[number, number]> = [];
  for (let x = DOOR.x + 10; x <= DOOR.x + DOOR.w - 10; x += (DOOR.w - 20) / 6) {
    boltPositions.push([x, DOOR.y + 9], [x, DOOR.y + DOOR.h - 9]);
  }
  for (let y = DOOR.y + 9 + (DOOR.h - 18) / 6; y < DOOR.y + DOOR.h - 12; y += (DOOR.h - 18) / 6) {
    boltPositions.push([DOOR.x + 9, y], [DOOR.x + DOOR.w - 9, y]);
  }
  for (const [bx, by] of boltPositions) {
    ctx.fillStyle = C.bolt;
    ctx.beginPath();
    ctx.arc(bx, by, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.boltDark;
    ctx.beginPath();
    ctx.arc(bx + 0.8, by + 0.8, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  drawDial(ctx, state, alpha);
  drawHandle(ctx, state, eased);
  ctx.restore();
}

function drawDial(ctx: CanvasRenderingContext2D, state: GameState, alpha: number): void {
  const pos = dialVisualPosition(state, alpha);
  const stepAngle = (Math.PI * 2) / DIAL_SIZE;
  // Position k is drawn at -k*step relative to the top; rotating by +pos*step brings the
  // current position to the top, so turning right (increasing) rotates clockwise.
  const rotation = pos * stepAngle;
  const sinceClick = state.timeMs - state.lastClickMs;
  const clickFlash = sinceClick < CLICK_FLASH_MS ? 1 - sinceClick / CLICK_FLASH_MS : 0;

  // Rim.
  const rim = ctx.createRadialGradient(DIAL_CX - 20, DIAL_CY - 30, 10, DIAL_CX, DIAL_CY, DIAL_R + 14);
  rim.addColorStop(0, C.dialRim0);
  rim.addColorStop(1, C.dialRim1);
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(DIAL_CX, DIAL_CY, DIAL_R + 14, 0, Math.PI * 2);
  ctx.fill();
  // Knurled edge.
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 48; i++) {
    const a = rotation + (i * Math.PI * 2) / 48;
    const r0 = DIAL_R + 8;
    const r1 = DIAL_R + 13;
    ctx.beginPath();
    ctx.moveTo(DIAL_CX + Math.sin(a) * r0, DIAL_CY - Math.cos(a) * r0);
    ctx.lineTo(DIAL_CX + Math.sin(a) * r1, DIAL_CY - Math.cos(a) * r1);
    ctx.stroke();
  }

  // Face.
  const face = ctx.createRadialGradient(DIAL_CX, DIAL_CY, 10, DIAL_CX, DIAL_CY, DIAL_R);
  face.addColorStop(0, C.dialFace0);
  face.addColorStop(1, C.dialFace1);
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(DIAL_CX, DIAL_CY, DIAL_R, 0, Math.PI * 2);
  ctx.fill();

  // Ticks, numbers and notches rotate with the dial.
  ctx.save();
  ctx.translate(DIAL_CX, DIAL_CY);
  ctx.rotate(rotation);
  for (let k = 0; k < DIAL_SIZE; k++) {
    ctx.save();
    ctx.rotate(-k * stepAngle);
    // Major tick.
    ctx.fillStyle = C.tick;
    ctx.fillRect(-1.5, -DIAL_R + 4, 3, 14);
    // Minor ticks between numbers.
    ctx.fillStyle = C.tickMinor;
    for (let m = 1; m < 3; m++) {
      ctx.save();
      ctx.rotate((-m * stepAngle) / 3);
      ctx.fillRect(-1, -DIAL_R + 4, 2, 7);
      ctx.restore();
    }
    // Number, kept upright for readability while its tick rotates with the dial.
    ctx.save();
    ctx.translate(0, -DIAL_R + 32);
    ctx.rotate(k * stepAngle - rotation);
    ctx.fillStyle = C.number;
    ctx.font = `bold 13px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(k), 0, 0);
    ctx.restore();
    // Notches: lit for found numbers, faint for hints.
    const codeIndex = state.code.indexOf(k);
    const isFound = codeIndex >= 0 && state.found.some((f, i) => f && state.code[i] === k);
    const isHint = codeIndex >= 0 && state.hints.some((h, i) => h && state.code[i] === k);
    if (isFound || isHint) {
      ctx.fillStyle = isFound ? C.green : C.amberDim;
      if (isFound) {
        ctx.shadowColor = C.green;
        ctx.shadowBlur = 10;
      }
      ctx.beginPath();
      ctx.arc(0, -DIAL_R + 48, isFound ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
  // Centre boss.
  ctx.fillStyle = C.dialRim1;
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.dialRim0;
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Fixed indicator at the top, flashing on a click.
  ctx.save();
  if (clickFlash > 0) {
    ctx.shadowColor = C.green;
    ctx.shadowBlur = 18 * clickFlash;
  }
  ctx.fillStyle = clickFlash > 0 ? C.green : C.indicator;
  ctx.beginPath();
  ctx.moveTo(DIAL_CX, DIAL_CY - DIAL_R + 2);
  ctx.lineTo(DIAL_CX - 7, DIAL_CY - DIAL_R - 14);
  ctx.lineTo(DIAL_CX + 7, DIAL_CY - DIAL_R - 14);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (clickFlash > 0) {
    // Notch flash ring around the indicator.
    ctx.strokeStyle = C.green;
    ctx.globalAlpha = clickFlash * 0.9;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(DIAL_CX, DIAL_CY - DIAL_R + 6, 10 + (1 - clickFlash) * 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawHandle(ctx: CanvasRenderingContext2D, state: GameState, openEased: number): void {
  const spin = state.phase === "SUCCESS" ? openEased * Math.PI * 4 : 0;
  ctx.save();
  ctx.translate(HANDLE_CX, HANDLE_CY);
  ctx.rotate(spin);
  ctx.strokeStyle = C.dialRim0;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, HANDLE_R, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.sin(a) * HANDLE_R, -Math.cos(a) * HANDLE_R);
    ctx.stroke();
  }
  ctx.fillStyle = C.dialRim1;
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Tumbler lamps next to the handle: one per number in the code.
  for (let i = 0; i < CODE_LENGTH; i++) {
    const lx = 44 + i * 18;
    const ly = HANDLE_CY;
    const lit = state.found[i] === true;
    ctx.fillStyle = lit ? C.green : state.hints[i] ? C.amberDim : "#101a16";
    if (lit) {
      ctx.save();
      ctx.shadowColor = C.green;
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.arc(lx, ly, 5, 0, Math.PI * 2);
    ctx.fill();
    if (lit) ctx.restore();
    ctx.strokeStyle = C.doorEdge;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = C.textDim;
  ctx.font = `10px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("TUMBLERS", 36, HANDLE_CY - 16);
}

// ---- Proximity meter --------------------------------------------------------------------

function drawMeter(ctx: CanvasRenderingContext2D, state: GameState): void {
  const level = state.phase === "READY" ? 0 : meterLevel(state);
  const sinceClick = state.timeMs - state.lastClickMs;
  const clickFlash = sinceClick < CLICK_FLASH_MS ? 1 - sinceClick / CLICK_FLASH_MS : 0;

  ctx.fillStyle = C.meterBg;
  ctx.fillRect(METER_X, METER_Y, METER_W, METER_H);
  ctx.strokeStyle = C.greenDim;
  ctx.lineWidth = 1;
  ctx.strokeRect(METER_X + 0.5, METER_Y + 0.5, METER_W - 1, METER_H - 1);

  // Oscilloscope trace: amplitude and frequency rise with proximity; a click spikes it.
  const midY = METER_Y + METER_H / 2;
  const amp = 2 + level * level * 14 + clickFlash * 12;
  const freq = 0.05 + level * 0.25;
  ctx.strokeStyle = level >= 1 || clickFlash > 0 ? C.green : level > 0.66 ? C.amber : C.textDim;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = 0; x <= METER_W; x += 2) {
    const phase = state.timeMs / 60;
    let y = Math.sin(x * freq + phase) * amp * (0.6 + 0.4 * Math.sin(x * 0.03 + phase * 0.3));
    if (clickFlash > 0 && Math.abs(x - METER_W / 2) < 6) y -= clickFlash * 16;
    if (x === 0) ctx.moveTo(METER_X + x, midY + y);
    else ctx.lineTo(METER_X + x, midY + y);
  }
  ctx.stroke();

  // Cold-to-hot bar along the bottom edge.
  const barY = METER_Y + METER_H - 6;
  const g = ctx.createLinearGradient(METER_X, 0, METER_X + METER_W, 0);
  g.addColorStop(0, "#1f3b57");
  g.addColorStop(0.6, C.amber);
  g.addColorStop(1, C.green);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(METER_X + 4, barY, METER_W - 8, 3);
  ctx.fillStyle = g;
  ctx.fillRect(METER_X + 4, barY, (METER_W - 8) * level, 3);

  ctx.fillStyle = C.textDim;
  ctx.font = `10px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("LISTEN", METER_X + 6, METER_Y + 4);
  ctx.textAlign = "right";
  const label = level >= 1 ? "CLICK" : level > 0.8 ? "HOT" : level > 0.5 ? "WARM" : "COLD";
  ctx.fillStyle = level >= 1 ? C.green : C.textDim;
  ctx.fillText(label, METER_X + METER_W - 6, METER_Y + 4);
}

// ---- HUD and messages ----------------------------------------------------------------

function drawHud(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.font = `bold 12px ${FONT}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = C.text;
  ctx.fillText("VAULT LOCK", 12, 12);
  const set = state.found.filter(Boolean).length;
  ctx.textAlign = "right";
  ctx.fillStyle = C.textDim;
  ctx.fillText(`Tumblers ${set}/${CODE_LENGTH} set`, WORLD_WIDTH - 12, 12);
  if (state.drops > 0) ctx.fillText(`Drops ${state.drops}`, WORLD_WIDTH - 12, 28);

  if (state.phase === "PLAYING") {
    ctx.textAlign = "center";
    ctx.fillStyle = C.textDim;
    ctx.font = `10px ${FONT}`;
    ctx.fillText(stepHint(state), WORLD_WIDTH / 2, 30);
    const sinceLock = state.timeMs - state.lastLockMs;
    if (sinceLock < LOCK_FLASH_MS && set > 0) {
      ctx.fillStyle = C.green;
      ctx.font = `bold 13px ${FONT}`;
      ctx.fillText(`Tumbler ${set}/${CODE_LENGTH} set`, WORLD_WIDTH / 2, DIAL_CY + DIAL_R + 22);
    }
  }
}

function drawMessage(ctx: CanvasRenderingContext2D, state: GameState): void {
  const cx = WORLD_WIDTH / 2;
  const cy = DIAL_CY;
  const blink = Math.sin(state.timeMs / 300) > 0;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  switch (state.phase) {
    case "READY": {
      drawCard(ctx, cx, cy, 250, 88);
      ctx.fillStyle = C.text;
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText("CRACK THE VAULT", cx, cy - 24);
      ctx.fillStyle = C.textDim;
      ctx.font = `11px ${FONT}`;
      ctx.fillText("Turn the dial and listen for the click.", cx, cy - 5);
      ctx.fillText("Reverse direction to lock a number in.", cx, cy + 9);
      if (blink) {
        ctx.fillStyle = C.green;
        ctx.font = `bold 12px ${FONT}`;
        ctx.fillText("PRESS TO START", cx, cy + 29);
      }
      break;
    }
    case "DROPPED": {
      ctx.fillStyle = "rgba(255, 107, 87, 0.08)";
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      drawCard(ctx, cx, cy, 220, 72);
      ctx.fillStyle = C.danger;
      ctx.font = `bold 18px ${FONT}`;
      ctx.fillText("Tumblers dropped", cx, cy - 12);
      if (state.phaseMs >= DROP_LOCKOUT_MS && blink) {
        ctx.fillStyle = C.text;
        ctx.font = `bold 12px ${FONT}`;
        ctx.fillText("PRESS TO RETRY", cx, cy + 16);
      }
      break;
    }
    case "SUCCESS": {
      ctx.save();
      ctx.shadowColor = C.green;
      ctx.shadowBlur = 16;
      ctx.fillStyle = C.green;
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText("Vault open", cx, DIAL_CY + 110);
      ctx.restore();
      break;
    }
    case "PLAYING":
      break;
  }
}

function drawCard(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
  ctx.fillStyle = "rgba(4, 10, 8, 0.88)";
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.strokeStyle = "rgba(92,255,157,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - w / 2 + 0.5, cy - h / 2 + 0.5, w - 1, h - 1);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ---- CRT overlay ----------------------------------------------------------------------

function drawCrt(ctx: CanvasRenderingContext2D, scale: number): void {
  const step = Math.max(2, 3 / scale);
  ctx.fillStyle = C.scanline;
  for (let y = 0; y < WORLD_HEIGHT; y += step * 2) ctx.fillRect(0, y, WORLD_WIDTH, step * 0.6);
  const g = ctx.createRadialGradient(
    WORLD_WIDTH / 2,
    WORLD_HEIGHT / 2,
    WORLD_HEIGHT * 0.3,
    WORLD_WIDTH / 2,
    WORLD_HEIGHT / 2,
    WORLD_HEIGHT * 0.75,
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
}
