// Canvas drawing for G7. Reads GameState, never mutates it. All art is canvas primitives,
// in the same bunker CRT palette as G1, G3 and G6 (dark teal, green signal, amber hazard).

import {
  FAIL_LOCKOUT_MS,
  FLINCH_MS,
  HAZARD_WARN_MS,
  MAX_SPILLS,
  ROUND_MS,
  SHAKE_MS,
  SPILL_FX_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  lightsOut,
  progress,
  secondsLeft,
  type GameState,
  type Hazard,
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
  floor: "#101a16",
  floorEdge: "#2a4a3a",
  hazard: "#c98a1a",
  amber: "#ffb347",
  amberDim: "rgba(255, 179, 71, 0.35)",
  green: "#5cff9d",
  greenDim: "rgba(92, 255, 157, 0.35)",
  text: "#b8f5cf",
  textDim: "rgba(184, 245, 207, 0.6)",
  danger: "#ff6b57",
  dangerDim: "rgba(255, 107, 87, 0.3)",
  flash: "#eafff2",
  coffee: "#8a5a1a",
  coffeeLight: "#c98a1a",
  scanline: "rgba(0, 0, 0, 0.18)",
} as const;

// ---- Layout (world units) -------------------------------------------------------

const METER_Y = 70;
const METER_X = 40;
const METER_W = 240;
const SCENE_TOP = 92;
const WALK_Y = 334;
const SCENE_BOTTOM = 400;
const ENGINEER_X = 112;
const HINT_Y = 424;
/** World units the walkway scrolls per second (visual only). */
const SCROLL_PX_PER_S = 60;

type Pose = "walk" | "collapse" | "sip";

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

  // The scene shakes when a pipe bumps the walkway.
  const shake = state.shakeMs > 0 ? (state.shakeMs / SHAKE_MS) * Math.sin(state.timeMs / 18) * 4 : 0;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, SCENE_TOP, WORLD_WIDTH, SCENE_BOTTOM - SCENE_TOP);
  ctx.clip();
  ctx.translate(0, shake);
  drawWall(ctx, state);
  drawIntercom(ctx, state);
  drawFan(ctx, state);
  drawWalkway(ctx, state);
  drawPipe(ctx, state);
  drawExit(ctx, state);
  drawEngineer(ctx, state);
  drawWind(ctx, state);
  drawDarkness(ctx, state);
  ctx.restore();

  drawHud(ctx, state);
  drawTiltMeter(ctx, state);
  drawSpeech(ctx, state, shake);
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
}

function scrollPx(state: GameState): number {
  return (state.elapsedMs / 1000) * SCROLL_PX_PER_S;
}

function drawWall(ctx: CanvasRenderingContext2D, state: GameState): void {
  // Slow parallax grid: the bunker wall behind the walkway.
  const cell = 40;
  const shift = (scrollPx(state) * 0.35) % cell;
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -shift; x <= WORLD_WIDTH; x += cell) {
    ctx.moveTo(x, SCENE_TOP);
    ctx.lineTo(x, WALK_Y);
  }
  for (let y = SCENE_TOP + 8; y <= WALK_Y; y += cell) {
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_WIDTH, y);
  }
  ctx.stroke();

  // Conduit along the top of the wall with lamps.
  ctx.fillStyle = C.floor;
  ctx.fillRect(0, SCENE_TOP, WORLD_WIDTH, 6);
  ctx.fillStyle = C.floorEdge;
  ctx.fillRect(0, SCENE_TOP + 6, WORLD_WIDTH, 1);
  const spacing = 80;
  const lampShift = scrollPx(state) % spacing;
  const dark = lightsOut(state);
  for (let x = -lampShift; x <= WORLD_WIDTH + spacing; x += spacing) {
    const on = !dark && Math.sin(state.timeMs / 500 + x) > -0.6;
    ctx.fillStyle = on ? C.amberDim : "rgba(255,179,71,0.08)";
    ctx.fillRect(x - 3, SCENE_TOP + 2, 6, 3);
  }
}

function drawWalkway(ctx: CanvasRenderingContext2D, state: GameState): void {
  const shift = scrollPx(state);

  // Handrail and posts behind the engineer.
  const postGap = 64;
  const postShift = shift % postGap;
  ctx.fillStyle = C.panelEdge;
  ctx.fillRect(0, WALK_Y - 44, WORLD_WIDTH, 3);
  for (let x = -postShift; x <= WORLD_WIDTH + postGap; x += postGap) {
    ctx.fillRect(x - 1.5, WALK_Y - 44, 3, 44);
  }
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(0, WALK_Y - 24, WORLD_WIDTH, 1);

  // Grating.
  ctx.fillStyle = C.floor;
  ctx.fillRect(0, WALK_Y, WORLD_WIDTH, 18);
  ctx.fillStyle = C.floorEdge;
  ctx.fillRect(0, WALK_Y, WORLD_WIDTH, 2);
  const slat = 12;
  const slatShift = shift % slat;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  for (let x = -slatShift; x <= WORLD_WIDTH; x += slat) ctx.fillRect(x + 4, WALK_Y + 5, slat - 7, 9);
  // Hazard stripe along the walkway edge.
  const dash = 24;
  const dashShift = shift % (dash * 2);
  ctx.fillStyle = C.hazard;
  for (let x = -dashShift; x <= WORLD_WIDTH; x += dash * 2) ctx.fillRect(x, WALK_Y + 18, dash, 3);

  // Struts down into the dark.
  const strutGap = 96;
  const strutShift = shift % strutGap;
  ctx.fillStyle = C.panel;
  for (let x = -strutShift + 20; x <= WORLD_WIDTH + strutGap; x += strutGap) {
    ctx.fillRect(x - 3, WALK_Y + 21, 6, SCENE_BOTTOM - WALK_Y - 21);
  }
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(0, WALK_Y + 30, WORLD_WIDTH, 1);
}

function drawExit(ctx: CanvasRenderingContext2D, state: GameState): void {
  const p = state.phase === "SUCCESS" ? 1 : progress(state);
  const doorX = ENGINEER_X + 48 + (1 - p) * 700;
  if (doorX > WORLD_WIDTH + 10) return;
  const w = 48;
  const h = 96;
  const y = WALK_Y - h;
  ctx.fillStyle = C.panel;
  ctx.fillRect(doorX - 6, y - 6, w + 12, h + 6);
  ctx.fillStyle = C.panelInner;
  ctx.fillRect(doorX, y, w, h);
  ctx.strokeStyle = C.panelEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(doorX + 1, y + 1, w - 2, h - 2);
  // Lit "EXIT" sign.
  const on = !lightsOut(state);
  ctx.fillStyle = on ? C.green : C.greenDim;
  ctx.fillRect(doorX + 8, y - 20, w - 16, 12);
  ctx.fillStyle = C.bg1;
  ctx.font = `bold 8px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("EXIT", doorX + w / 2, y - 14);
  // Handle.
  ctx.fillStyle = C.amber;
  ctx.fillRect(doorX + 8, y + h / 2, 6, 3);
}

// ---- Hazards --------------------------------------------------------------------

function drawIntercom(ctx: CanvasRenderingContext2D, state: GameState): void {
  const h = state.hazard;
  const buzzing = !!h && h.kind === "INTERCOM" && h.warnMs <= 0 && h.activeMs > 0;
  const warning = !!h && h.kind === "INTERCOM" && h.warnMs > 0;
  const x = 236;
  const y = 118;
  const w = 44;
  const hgt = 28;
  ctx.fillStyle = C.panel;
  ctx.fillRect(x, y, w, hgt);
  ctx.strokeStyle = C.panelEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, hgt - 2);
  // Speaker grille.
  ctx.fillStyle = C.panelInner;
  for (let i = 0; i < 4; i++) ctx.fillRect(x + 6, y + 6 + i * 5, w - 20, 2);
  // Status lamp.
  const lampOn = buzzing ? Math.floor(state.timeMs / 80) % 2 === 0 : warning && Math.floor(state.timeMs / 160) % 2 === 0;
  ctx.fillStyle = lampOn ? C.amber : "rgba(255,179,71,0.15)";
  ctx.beginPath();
  ctx.arc(x + w - 8, y + hgt / 2, 3, 0, Math.PI * 2);
  ctx.fill();
  if (buzzing) {
    ctx.fillStyle = C.amber;
    ctx.font = `bold 9px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const jitter = Math.sin(state.timeMs / 20) * 1.5;
    ctx.fillText("BZZZT", x + w / 2 + jitter, y - 4);
    // Sound rings.
    ctx.strokeStyle = C.amberDim;
    ctx.lineWidth = 1.5;
    for (let i = 1; i <= 3; i++) {
      const r = 6 + i * 7 + ((state.timeMs / 60) % 7);
      ctx.beginPath();
      ctx.arc(x + w / 2, y + hgt / 2, r, Math.PI * 0.6, Math.PI * 1.4);
      ctx.stroke();
    }
  }
}

function drawFan(ctx: CanvasRenderingContext2D, state: GameState): void {
  const h = state.hazard;
  if (!h || h.kind !== "FAN") return;
  const active = h.warnMs <= 0 && h.activeMs > 0;
  const x = h.side < 0 ? 6 : WORLD_WIDTH - 54;
  const y = 180;
  const w = 48;
  const hgt = 56;
  ctx.fillStyle = C.panel;
  ctx.fillRect(x, y, w, hgt);
  ctx.strokeStyle = active ? C.amber : C.panelEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, hgt - 2);
  // Blades.
  const cx = x + w / 2;
  const cy = y + hgt / 2;
  const spin = active ? state.timeMs / 40 : h.warnMs > 0 ? (HAZARD_WARN_MS - h.warnMs) / 120 : 0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(spin);
  ctx.fillStyle = active ? C.amberDim : C.panelEdge;
  for (let i = 0; i < 3; i++) {
    ctx.rotate((Math.PI * 2) / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(14, -6, 18, 4);
    ctx.quadraticCurveTo(10, 8, 0, 0);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = C.panelInner;
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.panelEdge;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 20, 0, Math.PI * 2);
  ctx.stroke();
}

function drawWind(ctx: CanvasRenderingContext2D, state: GameState): void {
  const h = state.hazard;
  if (!h || h.kind !== "FAN" || h.warnMs > 0 || h.activeMs <= 0) return;
  // Streaks travelling in the push direction across the scene.
  const dir = h.side;
  ctx.strokeStyle = C.greenDim;
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    const lane = 150 + ((i * 37) % 160);
    const len = 20 + (i % 3) * 10;
    const t = ((state.timeMs / 4 + i * 53) % (WORLD_WIDTH + 80)) - 40;
    const x = dir > 0 ? t : WORLD_WIDTH - t;
    ctx.globalAlpha = 0.25 + 0.25 * Math.sin(state.timeMs / 90 + i);
    ctx.beginPath();
    ctx.moveTo(x, lane);
    ctx.lineTo(x - dir * len, lane);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawPipe(ctx: CanvasRenderingContext2D, state: GameState): void {
  const h = state.hazard;
  if (!h || h.kind !== "PIPE") return;
  // A loose pipe under the grating rises during the warning and slams the walkway.
  const x = ENGINEER_X + h.side * 44;
  const rise = h.warnMs > 0 ? 1 - h.warnMs / HAZARD_WARN_MS : 1;
  const top = SCENE_BOTTOM - rise * (SCENE_BOTTOM - WALK_Y - 20);
  ctx.fillStyle = C.panelEdge;
  ctx.fillRect(x - 7, top, 14, SCENE_BOTTOM - top);
  ctx.fillStyle = C.panel;
  ctx.fillRect(x - 4, top + 2, 8, SCENE_BOTTOM - top);
  ctx.fillStyle = C.amber;
  ctx.fillRect(x - 9, top, 18, 4);
  if (h.warnMs > 0 && Math.floor(state.timeMs / 120) % 2 === 0) {
    ctx.fillStyle = C.amber;
    ctx.font = `bold 9px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("!", x, top - 2);
  }
}

function drawDarkness(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!lightsOut(state)) return;
  // Near-black with a faint emergency glow around the engineer.
  ctx.fillStyle = "rgba(0, 0, 0, 0.86)";
  ctx.fillRect(0, SCENE_TOP, WORLD_WIDTH, SCENE_BOTTOM - SCENE_TOP);
  const g = ctx.createRadialGradient(ENGINEER_X, WALK_Y - 40, 4, ENGINEER_X, WALK_Y - 40, 70);
  g.addColorStop(0, "rgba(255, 107, 87, 0.18)");
  g.addColorStop(1, "rgba(255, 107, 87, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, SCENE_TOP, WORLD_WIDTH, SCENE_BOTTOM - SCENE_TOP);
}

// ---- The engineer -------------------------------------------------------------

function poseFor(state: GameState): Pose {
  if (state.phase === "FAILED") return "collapse";
  if (state.phase === "SUCCESS") return "sip";
  return "walk";
}

function drawEngineer(ctx: CanvasRenderingContext2D, state: GameState): void {
  const pose = poseFor(state);
  const walking = state.phase === "WALKING";
  const flinch = state.flinchMs > 0 ? state.flinchMs / FLINCH_MS : 0;
  const bob = walking ? Math.abs(Math.sin(state.timeMs / 140)) * 2 : 0;
  const x = ENGINEER_X;
  const feetY = WALK_Y;
  const lift = bob + flinch * 10;

  if (pose === "collapse") {
    drawCollapsed(ctx, state, x, feetY);
    return;
  }

  const bodyBottom = feetY - 26 - lift;
  const bodyTop = bodyBottom - 30;
  const headY = bodyTop - 12;

  // Legs: alternate while walking.
  const swing = walking ? Math.sin(state.timeMs / 140) * 7 : 0;
  ctx.strokeStyle = C.panelEdge;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - 4, bodyBottom);
  ctx.lineTo(x - 6 + swing, feetY - lift + 0);
  ctx.moveTo(x + 4, bodyBottom);
  ctx.lineTo(x + 6 - swing, feetY - lift + 0);
  ctx.stroke();
  // Boots.
  ctx.fillStyle = C.panelInner;
  ctx.fillRect(x - 11 + swing, feetY - lift - 3, 10, 4);
  ctx.fillRect(x + 1 - swing, feetY - lift - 3, 10, 4);

  // Overalls with a hi-vis stripe.
  ctx.fillStyle = C.panel;
  ctx.fillRect(x - 11, bodyTop, 22, 30);
  ctx.strokeStyle = C.panelEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 10, bodyTop + 1, 20, 28);
  ctx.fillStyle = C.green;
  ctx.fillRect(x - 11, bodyTop + 12, 22, 3);
  // Lanyard / tool clip.
  ctx.fillStyle = C.amber;
  ctx.fillRect(x - 7, bodyTop + 20, 4, 4);

  // Head and hard hat.
  ctx.fillStyle = C.text;
  ctx.beginPath();
  ctx.arc(x, headY, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.amber;
  ctx.beginPath();
  ctx.arc(x, headY - 2, 10, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(x - 13, headY - 2, 26, 3);
  // Face: eyes widen on a flinch or in the dark; squint during a spill recovery.
  ctx.fillStyle = C.bg1;
  const eyeR = flinch > 0 ? 2.4 : 1.4;
  ctx.beginPath();
  ctx.arc(x + 3, headY + 1, eyeR, 0, Math.PI * 2);
  ctx.arc(x + 7, headY + 1, eyeR, 0, Math.PI * 2);
  ctx.fill();
  if (pose === "sip") {
    // Happy closed eyes.
    ctx.fillStyle = C.text;
    ctx.fillRect(x + 1, headY, 4, 2);
    ctx.fillRect(x + 6, headY, 4, 2);
  } else if (state.recoverMs > 0 || flinch > 0) {
    ctx.fillStyle = C.bg1;
    ctx.beginPath();
    ctx.arc(x + 6, headY + 6, flinch > 0 ? 3 : 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Arms out front holding the cup.
  const handX = pose === "sip" ? x + 8 : x + 22;
  const handY = pose === "sip" ? headY + 4 : bodyTop + 10 - flinch * 8;
  ctx.strokeStyle = C.panelEdge;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x + 6, bodyTop + 6);
  ctx.lineTo(handX - 2, handY + 4);
  ctx.moveTo(x - 6, bodyTop + 8);
  ctx.lineTo(handX - 6, handY + 6);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.fillStyle = C.text;
  ctx.beginPath();
  ctx.arc(handX - 3, handY + 5, 3.5, 0, Math.PI * 2);
  ctx.fill();

  drawCup(ctx, state, handX + 2, handY, pose === "sip" ? -0.9 : state.tilt * 0.55);
  drawSpillFx(ctx, state, handX + 2, handY);

  if (pose === "sip") {
    // Steam.
    ctx.strokeStyle = C.textDim;
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
      const sx = handX + 2 + i * 5;
      const wob = Math.sin(state.timeMs / 200 + i) * 2;
      ctx.beginPath();
      ctx.moveTo(sx, handY - 12);
      ctx.quadraticCurveTo(sx + wob, handY - 20, sx - wob, handY - 28);
      ctx.stroke();
    }
  }
}

/** The cup, rotated by `angle`; the coffee inside stays level. */
function drawCup(ctx: CanvasRenderingContext2D, state: GameState, cx: number, cy: number, angle: number): void {
  const topW = 16;
  const botW = 12;
  const h = 18;
  const cupPath = (): void => {
    ctx.beginPath();
    ctx.moveTo(-topW / 2, -h / 2);
    ctx.lineTo(topW / 2, -h / 2);
    ctx.lineTo(botW / 2, h / 2);
    ctx.lineTo(-botW / 2, h / 2);
    ctx.closePath();
  };

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  // Cup body.
  ctx.fillStyle = C.flash;
  cupPath();
  ctx.fill();
  // Coffee: clip to the cup, then fill a level rectangle in world orientation.
  if (state.cupLevel > 0) {
    ctx.save();
    cupPath();
    ctx.clip();
    ctx.rotate(-angle);
    const surface = -h / 2 + 3 + (1 - state.cupLevel) * (h - 5);
    ctx.fillStyle = C.coffee;
    ctx.fillRect(-40, surface, 80, 60);
    ctx.fillStyle = C.coffeeLight;
    ctx.fillRect(-40, surface, 80, 2);
    ctx.restore();
  }
  // Rim and handle.
  ctx.strokeStyle = C.panelEdge;
  ctx.lineWidth = 1.5;
  cupPath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(topW / 2 + 2, 0, 4, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.restore();
}

function drawSpillFx(ctx: CanvasRenderingContext2D, state: GameState, cx: number, cy: number): void {
  if (state.spillFxMs <= 0) return;
  const k = 1 - state.spillFxMs / SPILL_FX_MS; // 0 -> 1 over the splash
  const dir = state.lastSpillSide;
  ctx.fillStyle = C.coffeeLight;
  for (let i = 0; i < 7; i++) {
    const spread = 0.6 + (i % 4) * 0.25;
    const dx = dir * (8 + k * 34 * spread);
    const dy = -10 - k * 18 * (1 - spread) + k * k * 52;
    const r = 2.5 - k * 1.5;
    ctx.globalAlpha = 1 - k * 0.6;
    ctx.beginPath();
    ctx.arc(cx + dx + (i % 3) * 3, cy + dy + i * 2, Math.max(0.5, r), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Puddle on the grating.
  if (k > 0.6) {
    ctx.fillStyle = C.coffee;
    ctx.globalAlpha = (k - 0.6) / 0.4;
    ctx.beginPath();
    ctx.ellipse(ENGINEER_X + dir * 30, WALK_Y + 2, 14, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** Face-down on the walkway, one arm out, sobbing. */
function drawCollapsed(ctx: CanvasRenderingContext2D, state: GameState, x: number, feetY: number): void {
  const y = feetY - 8;
  const sob = Math.abs(Math.sin(state.timeMs / 160)) * 2;
  // Legs trailing left.
  ctx.strokeStyle = C.panelEdge;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - 10, y);
  ctx.lineTo(x - 34, y + 2);
  ctx.moveTo(x - 10, y + 3);
  ctx.lineTo(x - 30, y + 5);
  ctx.stroke();
  // Body lying flat.
  ctx.fillStyle = C.panel;
  ctx.fillRect(x - 12, y - 10 - sob, 30, 16);
  ctx.strokeStyle = C.panelEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 11, y - 9 - sob, 28, 14);
  ctx.fillStyle = C.green;
  ctx.fillRect(x + 1, y - 10 - sob, 3, 16);
  // Arm flung forward towards the fallen cup.
  ctx.strokeStyle = C.panelEdge;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x + 16, y - 6);
  ctx.lineTo(x + 36, y - 2);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.fillStyle = C.text;
  ctx.beginPath();
  ctx.arc(x + 38, y - 2, 3.5, 0, Math.PI * 2);
  ctx.fill();
  // Head, hat knocked askew.
  ctx.fillStyle = C.text;
  ctx.beginPath();
  ctx.arc(x + 24, y - 6 - sob, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(x + 30, y - 12 - sob);
  ctx.rotate(0.9);
  ctx.fillStyle = C.amber;
  ctx.beginPath();
  ctx.arc(0, 0, 10, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(-13, 0, 26, 3);
  ctx.restore();
  // Tears.
  ctx.fillStyle = C.green;
  for (let i = 0; i < 2; i++) {
    const t = ((state.timeMs / 6 + i * 60) % 120) / 120;
    ctx.globalAlpha = 1 - t;
    ctx.beginPath();
    ctx.arc(x + 20 + i * 8, y - 2 + t * 10, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // The empty cup, on its side.
  ctx.save();
  ctx.translate(x + 52, y + 2);
  ctx.rotate(Math.PI / 2 + 0.3);
  ctx.fillStyle = C.flash;
  ctx.beginPath();
  ctx.moveTo(-8, -9);
  ctx.lineTo(8, -9);
  ctx.lineTo(6, 9);
  ctx.lineTo(-6, 9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = C.panelEdge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  // Last of the coffee on the grating.
  ctx.fillStyle = C.coffee;
  ctx.beginPath();
  ctx.ellipse(x + 66, WALK_Y + 2, 16, 3, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---- Speech ---------------------------------------------------------------------

function drawSpeech(ctx: CanvasRenderingContext2D, state: GameState, shake: number): void {
  const s = state.speech;
  if (!s) return;
  const collapsed = state.phase === "FAILED";
  ctx.font = `bold 11px ${FONT}`;
  const w = Math.max(60, ctx.measureText(s.text).width + 18);
  const h = 22;
  const anchorX = collapsed ? ENGINEER_X + 24 : ENGINEER_X;
  const anchorY = (collapsed ? WALK_Y - 30 : WALK_Y - 90) + shake;
  let x = anchorX - w / 2 + 16;
  x = Math.max(6, Math.min(WORLD_WIDTH - w - 6, x));
  const y = anchorY - h - 10;

  // Fade in the last 300ms.
  const alpha = Math.min(1, s.ms / 300);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(4, 10, 8, 0.9)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = C.greenDim;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  // Tail.
  ctx.fillStyle = "rgba(4, 10, 8, 0.9)";
  ctx.beginPath();
  ctx.moveTo(anchorX - 4, y + h);
  ctx.lineTo(anchorX + 4, y + h);
  ctx.lineTo(anchorX + 1, y + h + 7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = state.phase === "FAILED" ? C.danger : state.phase === "SUCCESS" ? C.green : C.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(s.text, x + w / 2, y + h / 2);
  ctx.globalAlpha = 1;
}

// ---- HUD ------------------------------------------------------------------------

function drawHud(ctx: CanvasRenderingContext2D, state: GameState): void {
  const secs = state.phase === "READY" ? ROUND_MS / 1000 : secondsLeft(state);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.font = `bold 12px ${FONT}`;
  ctx.fillStyle = C.text;
  ctx.fillText(`WALKWAY  0:${String(secs).padStart(2, "0")}`, 12, 16);

  if (state.fails > 0) {
    ctx.textAlign = "right";
    ctx.font = `10px ${FONT}`;
    ctx.fillStyle = C.textDim;
    ctx.fillText(`REFILLS ${state.fails}`, WORLD_WIDTH - 12, 17);
  }

  // Distance bar with the exit marked at the end.
  const barX = 12;
  const barY = 34;
  const barW = WORLD_WIDTH - 24;
  const p = state.phase === "SUCCESS" ? 1 : progress(state);
  ctx.fillStyle = "rgba(92,255,157,0.12)";
  ctx.fillRect(barX, barY, barW, 6);
  ctx.fillStyle = C.green;
  ctx.fillRect(barX, barY, barW * p, 6);
  ctx.strokeStyle = "rgba(92,255,157,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(barX - 2.5, barY - 2.5, barW + 5, 11);
  ctx.fillStyle = C.amber;
  ctx.fillRect(barX + barW - 2, barY - 3, 2, 12);
}

function drawTiltMeter(ctx: CanvasRenderingContext2D, state: GameState): void {
  // Coffee left: one cup glyph per third.
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.font = `bold 9px ${FONT}`;
  ctx.fillStyle = C.textDim;
  ctx.fillText("COFFEE", WORLD_WIDTH - 12 - MAX_SPILLS * 14, 56);
  for (let i = 0; i < MAX_SPILLS; i++) {
    const full = i < MAX_SPILLS - state.spills;
    const gx = WORLD_WIDTH - 12 - (MAX_SPILLS - i) * 14 + 4;
    ctx.fillStyle = full ? C.coffeeLight : "rgba(184, 245, 207, 0.15)";
    ctx.fillRect(gx, 51, 8, 10);
    ctx.strokeStyle = full ? C.flash : C.textDim;
    ctx.lineWidth = 1;
    ctx.strokeRect(gx + 0.5, 51.5, 8, 10);
    ctx.beginPath();
    ctx.arc(gx + 9.5, 56, 2.5, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
  }

  ctx.textAlign = "left";
  ctx.fillStyle = C.textDim;
  ctx.fillText("TILT", 12, 56);

  // In the dark the meter only shows while the emergency light flickers on.
  if (lightsOut(state)) {
    const t = state.timeMs;
    const on = Math.sin(t / 37) * Math.sin(t / 91) + Math.sin(t / 13) * 0.3 > 0.25;
    if (!on) {
      ctx.fillStyle = "rgba(184, 245, 207, 0.08)";
      ctx.fillRect(METER_X, METER_Y - 6, METER_W, 12);
      return;
    }
  }

  const cx = METER_X + METER_W / 2;
  const half = METER_W / 2;
  // Track.
  ctx.fillStyle = "rgba(92,255,157,0.12)";
  ctx.fillRect(METER_X, METER_Y - 6, METER_W, 12);
  // Danger zones past 70% tilt.
  const safe = 0.7;
  ctx.fillStyle = C.dangerDim;
  ctx.fillRect(METER_X, METER_Y - 6, half * (1 - safe), 12);
  ctx.fillRect(cx + half * safe, METER_Y - 6, half * (1 - safe), 12);
  // Caution shading between 40% and 70%.
  ctx.fillStyle = "rgba(255, 179, 71, 0.12)";
  ctx.fillRect(cx - half * safe, METER_Y - 6, half * (safe - 0.4), 12);
  ctx.fillRect(cx + half * 0.4, METER_Y - 6, half * (safe - 0.4), 12);
  // Centre mark and frame.
  ctx.fillStyle = C.greenDim;
  ctx.fillRect(cx - 1, METER_Y - 9, 2, 18);
  ctx.strokeStyle = "rgba(92,255,157,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(METER_X - 0.5, METER_Y - 6.5, METER_W + 1, 13);
  // Edge arrows showing which way each button tips.
  ctx.fillStyle = C.textDim;
  ctx.font = `bold 9px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText("L", METER_X - 6, METER_Y);
  ctx.textAlign = "left";
  ctx.fillText("R", METER_X + METER_W + 6, METER_Y);

  // Needle: a little cup glyph.
  const t = Math.max(-1, Math.min(1, state.tilt));
  const nx = cx + t * half;
  const danger = Math.abs(t) >= safe;
  const color = danger ? C.danger : Math.abs(t) >= 0.4 ? C.amber : C.green;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = danger ? 12 : 6;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(nx - 5, METER_Y - 9);
  ctx.lineTo(nx + 5, METER_Y - 9);
  ctx.lineTo(nx + 3.5, METER_Y + 9);
  ctx.lineTo(nx - 3.5, METER_Y + 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function hazardLabel(h: Hazard | null): string {
  if (!h) return "";
  const warning = h.warnMs > 0;
  switch (h.kind) {
    case "PIPE":
      return warning ? "PIPE COMING UP" : "";
    case "FAN":
      return warning ? "FAN STARTING" : h.side < 0 ? "FAN  >>>" : "<<<  FAN";
    case "DARK":
      return warning ? "LIGHTS FLICKERING" : "LIGHTS OUT";
    case "INTERCOM":
      return warning ? "INTERCOM..." : "INTERCOM BUZZING";
  }
}

function drawHint(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.phase !== "WALKING") return;
  const cx = WORLD_WIDTH / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `11px ${FONT}`;
  if (state.recoverMs > 0) {
    ctx.fillStyle = C.danger;
    ctx.fillText("Spilled! Steadying the cup...", cx, HINT_Y);
  } else {
    ctx.fillStyle = C.textDim;
    ctx.fillText("LEFT tips left, RIGHT tips right. Stay centred.", cx, HINT_Y);
  }
  const label = hazardLabel(state.hazard);
  if (label) {
    ctx.fillStyle = C.amber;
    ctx.font = `bold 11px ${FONT}`;
    ctx.fillText(label, cx, HINT_Y + 18);
  }
}

function drawOverlay(ctx: CanvasRenderingContext2D, state: GameState): void {
  const cx = WORLD_WIDTH / 2;
  const cy = 200;
  const blink = Math.sin(state.timeMs / 300) > 0;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  switch (state.phase) {
    case "READY": {
      drawCard(ctx, cx, cy, 266, 104);
      ctx.fillStyle = C.text;
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText("COFFEE RUN", cx, cy - 30);
      ctx.fillStyle = C.textDim;
      ctx.font = `11px ${FONT}`;
      ctx.fillText("Carry the cup to the end of the walkway.", cx, cy - 8);
      ctx.fillText("Tip it back before it spills. Three strikes.", cx, cy + 7);
      if (blink) {
        ctx.fillStyle = C.green;
        ctx.font = `bold 12px ${FONT}`;
        ctx.fillText("PRESS TO START", cx, cy + 30);
      }
      break;
    }
    case "FAILED": {
      ctx.fillStyle = "rgba(255, 107, 87, 0.08)";
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      drawCard(ctx, cx, 170, 230, 80);
      ctx.fillStyle = C.danger;
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText("OUT OF COFFEE", cx, 156);
      if (state.phaseMs >= FAIL_LOCKOUT_MS && blink) {
        ctx.fillStyle = C.text;
        ctx.font = `bold 12px ${FONT}`;
        ctx.fillText("PRESS TO REFILL", cx, 186);
      }
      break;
    }
    case "SUCCESS": {
      ctx.fillStyle = "rgba(92, 255, 157, 0.08)";
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      drawCard(ctx, cx, 170, 250, 80);
      ctx.save();
      ctx.shadowColor = C.green;
      ctx.shadowBlur = 16;
      ctx.fillStyle = C.green;
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText("MADE IT", cx, 158);
      ctx.restore();
      ctx.fillStyle = C.textDim;
      ctx.font = `11px ${FONT}`;
      const thirds = MAX_SPILLS - state.spills;
      ctx.fillText(thirds === MAX_SPILLS ? "Not a drop lost." : `${thirds}/${MAX_SPILLS} of a cup. Still counts.`, cx, 186);
      break;
    }
    case "WALKING":
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
