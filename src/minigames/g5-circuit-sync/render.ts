// Canvas drawing for G5 (Circuit Sync). Reads GameState only.
// Bunker terminal style with spinning wheel and colored contacts.

import {
  CONTACT_COUNT,
  HITS_TO_WIN,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type GameState,
} from "./logic";

const FONT = '"ui-monospace", Menlo, Consolas, "Courier New", monospace';
const TWO_PI = Math.PI * 2;

const C = {
  bg0: "#081311",
  bg1: "#0a1411",
  gridLine: "#27413d",
  gridLineAlt: "#223733",
  pillar: "#516761",
  pillarInner: "#152724",
  panel: "#16312c",
  text: "#9fc3b3",
  textBright: "#d5e2cb",
  textDim: "#5a7a6a",
  wheelOuter: "#0b1010",
  wheelOuterStroke: "#60746e",
  wheelRim: "#87948b",
  wheelGrad0: "#3c6258",
  wheelGrad1: "#203934",
  wheelGrad2: "#122320",
  wheelLine: "#1a302b",
  wheelLineAlt: "#778f7c6b",
  wheelInnerRing: "#74957c66",
  contactBg: "#0b1212",
  contactStroke: "#87928c",
  red: "#ff6b60",
  blue: "#76d5ed",
  centerOuter: "#061310",
  centerOuterStroke: "#9ab4a3",
  centerInner: "#25483e",
  marker: "#efbd72",
  launchBg: "#1b302d",
  launchInner: "#071513",
  launchText: "#a8c5b0",
  connectorBody: "#bdd1ca",
  connectorLine: "#ffffff",
  connectorGrip: "#233537",
  connectorBase: "#233337",
  flashGood: "rgba(169, 255, 175, 0.08)",
  flashBad: "rgba(255, 101, 85, 0.24)",
  success: "#5cff9d",
  danger: "#ff6b57",
  scanline: "rgba(0, 0, 0, 0.12)",
} as const;

const COLORS: [string, string] = [C.red, C.blue];

// Wheel positioning (scaled for 320x480)
const CORE = { x: WORLD_WIDTH / 2, y: 180, radius: 75 };

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  canvasW: number,
  canvasH: number
): void {
  const scale = Math.min(canvasW / WORLD_WIDTH, canvasH / WORLD_HEIGHT);
  const offX = (canvasW - WORLD_WIDTH * scale) / 2;
  const offY = (canvasH - WORLD_HEIGHT * scale) / 2;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#000";
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
      Math.cos(state.timeMs / 30) * state.shake * 0.08
    );
  }

  drawBackground(ctx, state);
  drawWheel(ctx, state);
  drawSyncedConnectors(ctx, state);
  drawMarker(ctx);
  drawFlyingConnectors(ctx, state);
  drawHUD(ctx, state);
  drawFlash(ctx, state);
  drawScanlines(ctx);

  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, state: GameState): void {
  // Dark bunker background
  ctx.fillStyle = C.bg0;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // Horizontal grid lines
  ctx.strokeStyle = C.gridLine;
  ctx.lineWidth = 1;
  for (let y = 10; y <= WORLD_HEIGHT; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_WIDTH, y);
    ctx.stroke();
  }

  // Side pillars
  ctx.fillStyle = C.pillar;
  ctx.fillRect(0, 0, 8, WORLD_HEIGHT);
  ctx.fillRect(WORLD_WIDTH - 8, 0, 8, WORLD_HEIGHT);
  ctx.fillStyle = C.pillarInner;
  ctx.fillRect(2, 0, 4, WORLD_HEIGHT);
  ctx.fillRect(WORLD_WIDTH - 6, 0, 4, WORLD_HEIGHT);

  // Pulse lights
  const pulse = 0.52 + 0.32 * Math.sin(state.timeMs / 410);
  ctx.fillStyle = `rgba(255,91,70,${pulse})`;
  ctx.fillRect(14, 15, 35, 5);
  ctx.fillRect(WORLD_WIDTH - 49, 15, 35, 5);

  // Header
  ctx.fillStyle = C.panel;
  ctx.fillRect(60, 8, 200, 20);
  ctx.fillStyle = C.text;
  ctx.font = `bold 10px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CORE-04 // REPAIR MODE", WORLD_WIDTH / 2, 18);
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
    const a = i * TWO_PI / 12;
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
    const a = i * TWO_PI / 18;
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
    const a = i * TWO_PI / CONTACT_COUNT;
    const cx = Math.cos(a) * radius;
    const cy = Math.sin(a) * radius;
    const color = COLORS[i % 2];

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
    ctx.fillStyle = "rgba(255,255,255,0.6)";
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
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("04", 0, 1);

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
  const markerY = y + radius + 5;

  // Triangle marker
  ctx.save();
  ctx.shadowColor = C.marker;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(x, markerY);
  ctx.lineTo(x - 10, markerY + 18);
  ctx.lineTo(x + 10, markerY + 18);
  ctx.closePath();
  ctx.fillStyle = C.marker;
  ctx.fill();
  ctx.restore();

  // Label
  ctx.fillStyle = C.marker;
  ctx.font = `9px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("THROW WHEN ALIGNED", x, markerY + 32);
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
  opacity: number = 1
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
  // Stats panel
  const panelY = 340;
  ctx.fillStyle = C.panel;
  ctx.fillRect(10, panelY, WORLD_WIDTH - 20, 36);

  ctx.font = `9px ${FONT}`;
  ctx.textBaseline = "top";

  // Hits
  ctx.textAlign = "left";
  ctx.fillStyle = C.textDim;
  ctx.fillText("CONTACTS", 18, panelY + 5);
  ctx.fillStyle = C.textBright;
  ctx.font = `bold 14px ${FONT}`;
  ctx.fillText(`${state.hits} / ${HITS_TO_WIN}`, 18, panelY + 17);

  // Lives
  ctx.textAlign = "center";
  ctx.font = `9px ${FONT}`;
  ctx.fillStyle = C.textDim;
  ctx.fillText("ERRORS LEFT", WORLD_WIDTH / 2, panelY + 5);
  ctx.fillStyle = state.missesLeft <= 1 ? C.danger : C.textBright;
  ctx.font = `bold 14px ${FONT}`;
  ctx.fillText(`${state.missesLeft}`, WORLD_WIDTH / 2, panelY + 17);

  // Speed
  ctx.textAlign = "right";
  ctx.font = `9px ${FONT}`;
  ctx.fillStyle = C.textDim;
  ctx.fillText("SPEED", WORLD_WIDTH - 18, panelY + 5);
  ctx.fillStyle = C.textBright;
  ctx.font = `bold 14px ${FONT}`;
  const speedMult = state.phase === "READY" ? "—" : `${(state.speed / 1.3).toFixed(1)}×`;
  ctx.fillText(speedMult, WORLD_WIDTH - 18, panelY + 17);

  // Launch area
  ctx.fillStyle = C.launchBg;
  ctx.fillRect(WORLD_WIDTH / 2 - 45, 390, 90, 35);
  ctx.fillStyle = C.launchInner;
  ctx.fillRect(WORLD_WIDTH / 2 - 38, 396, 76, 24);
  ctx.fillStyle = C.launchText;
  ctx.font = `bold 10px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("LAUNCH", WORLD_WIDTH / 2, 408);

  // Message
  const msgY = 445;
  ctx.textAlign = "center";
  ctx.font = `11px ${FONT}`;
  if (state.messageType === "success") {
    ctx.fillStyle = C.success;
  } else if (state.messageType === "danger") {
    ctx.fillStyle = C.danger;
  } else {
    ctx.fillStyle = C.text;
  }
  ctx.fillText(state.message, WORLD_WIDTH / 2, msgY);

  // Phase-specific overlays
  if (state.phase === "SUCCESS") {
    drawOverlay(ctx, "CIRCUIT RESTORED", "ACCESS GRANTED", C.success);
  } else if (state.phase === "FAILED") {
    drawOverlay(ctx, "CIRCUIT OVERLOAD", "REPAIR FAILED", C.danger);
  }
}

function drawOverlay(ctx: CanvasRenderingContext2D, subtitle: string, title: string, color: string): void {
  // Dim background
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // Panel
  ctx.fillStyle = C.bg1;
  ctx.fillRect(30, 180, WORLD_WIDTH - 60, 100);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 180, WORLD_WIDTH - 60, 100);

  // Text
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = `10px ${FONT}`;
  ctx.fillStyle = C.textDim;
  ctx.fillText(subtitle, WORLD_WIDTH / 2, 205);

  ctx.font = `bold 18px ${FONT}`;
  ctx.fillStyle = color;
  ctx.fillText(title, WORLD_WIDTH / 2, 235);
}

function drawFlash(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.flashUntilMs > state.timeMs && state.flashType) {
    ctx.fillStyle = state.flashType === "good" ? C.flashGood : C.flashBad;
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }
}

function drawScanlines(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = C.scanline;
  for (let y = 0; y < WORLD_HEIGHT; y += 3) {
    ctx.fillRect(0, y, WORLD_WIDTH, 1);
  }
}
