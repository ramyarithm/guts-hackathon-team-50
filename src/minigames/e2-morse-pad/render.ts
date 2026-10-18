// Canvas drawing for E2 (morse pad). Reads GameState only.
// Bunker terminal style with morse reference guide.

import {
  MORSE_CODES,
  PIN_LENGTH,
  SYMBOLS_PER_DIGIT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  toMarks,
  type GameState,
} from "./logic";
import { PALETTE } from "../../util/palette";

const FONT = '"ui-monospace", Menlo, Consolas, "Courier New", monospace';

const C = {
  letterbox: PALETTE.letterbox,
  bg0: "#0a1411",
  bg1: "#061009",
  panel: "#0d1a15",
  panelBorder: "#1a2f28",
  text: "#b8f5cf",
  textDim: "#5a7a6a",
  textBright: "#e0f8e8",
  green: "#5cff9d",
  greenDim: "rgba(92, 255, 157, 0.3)",
  amber: "#ffb347",
  amberDim: "rgba(255, 179, 71, 0.4)",
  danger: "#ff6b57",
  slotBg: "#0a1411",
  slotBorder: "#2a4a3a",
  slotActive: "#3a6a5a",
  scanline: "rgba(0, 0, 0, 0.15)",
} as const;

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
  ctx.fillStyle = C.letterbox;
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.setTransform(scale, 0, 0, scale, offX, offY);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  ctx.clip();

  drawBackground(ctx);
  drawHeader(ctx, state);
  drawPinSlots(ctx, state);
  drawCurrentInput(ctx, state);
  drawMorseGuide(ctx);
  drawStats(ctx, state);
  drawMessage(ctx, state);
  drawScanlines(ctx);

  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  g.addColorStop(0, C.bg0);
  g.addColorStop(1, C.bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // Grid pattern
  ctx.strokeStyle = "rgba(92, 255, 157, 0.03)";
  ctx.lineWidth = 1;
  for (let x = 0; x < WORLD_WIDTH; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y < WORLD_HEIGHT; y += 20) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_WIDTH, y);
    ctx.stroke();
  }
}

function drawHeader(ctx: CanvasRenderingContext2D, state: GameState): void {
  // Header bar
  ctx.fillStyle = C.panel;
  ctx.fillRect(0, 0, WORLD_WIDTH, 50);
  ctx.strokeStyle = C.panelBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, WORLD_WIDTH, 50);

  // Title
  ctx.fillStyle = C.textDim;
  ctx.font = `10px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("EXIT 01 // MORSE OVERRIDE", 12, 10);

  ctx.fillStyle = C.textBright;
  ctx.font = `bold 16px ${FONT}`;
  ctx.fillText("DEAD SIGNAL", 12, 26);

  // Lock status
  const isOpen = state.phase === 'SUCCESS';
  const isFailed = state.phase === 'FAILED';
  ctx.textAlign = "right";
  ctx.font = `bold 12px ${FONT}`;
  
  if (isOpen) {
    ctx.fillStyle = C.green;
    ctx.fillText("● UNLOCKED", WORLD_WIDTH - 12, 20);
  } else if (isFailed) {
    ctx.fillStyle = C.danger;
    ctx.fillText("● LOCKOUT", WORLD_WIDTH - 12, 20);
  } else {
    ctx.fillStyle = C.amber;
    ctx.fillText("● LOCKED", WORLD_WIDTH - 12, 20);
  }
}

function drawPinSlots(ctx: CanvasRenderingContext2D, state: GameState): void {
  const slotW = 50;
  const slotH = 60;
  const gap = 12;
  const totalW = PIN_LENGTH * slotW + (PIN_LENGTH - 1) * gap;
  const startX = (WORLD_WIDTH - totalW) / 2;
  const y = 65;

  ctx.fillStyle = C.textDim;
  ctx.font = `11px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("RECOVERED PIN", WORLD_WIDTH / 2, y - 8);

  for (let i = 0; i < PIN_LENGTH; i++) {
    const x = startX + i * (slotW + gap);
    const digit = state.enteredDigits[i];
    const isActive = i === state.enteredDigits.length && state.phase === 'PLAYING';
    const isSuccess = state.phase === 'SUCCESS';
    const isFailed = state.phase === 'FAILED';

    // Slot background
    ctx.fillStyle = C.slotBg;
    ctx.fillRect(x, y, slotW, slotH);

    // Slot border
    if (isSuccess) {
      ctx.strokeStyle = C.green;
      ctx.lineWidth = 2;
    } else if (isFailed) {
      ctx.strokeStyle = C.danger;
      ctx.lineWidth = 2;
    } else if (isActive) {
      ctx.strokeStyle = C.amber;
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = C.slotBorder;
      ctx.lineWidth = 1;
    }
    ctx.strokeRect(x, y, slotW, slotH);

    // Digit or placeholder
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold 32px ${FONT}`;
    
    if (digit !== undefined) {
      ctx.fillStyle = isSuccess ? C.green : isFailed ? C.danger : C.textBright;
      ctx.fillText(digit, x + slotW / 2, y + slotH / 2);
    } else {
      ctx.fillStyle = C.textDim;
      ctx.fillText("_", x + slotW / 2, y + slotH / 2);
    }

    // Target PIN hint below (always visible)
    ctx.font = `10px ${FONT}`;
    ctx.fillStyle = C.textDim;
    ctx.fillText(state.targetPin[i], x + slotW / 2, y + slotH + 12);
  }

  // Label for target
  ctx.font = `9px ${FONT}`;
  ctx.fillStyle = C.textDim;
  ctx.textAlign = "center";
  ctx.fillText("TARGET", WORLD_WIDTH / 2, y + slotH + 26);
}

function drawCurrentInput(ctx: CanvasRenderingContext2D, state: GameState): void {
  const y = 175;
  
  // Label
  ctx.fillStyle = C.textDim;
  ctx.font = `11px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("CURRENT TRANSMISSION", WORLD_WIDTH / 2, y);

  // Symbol slots
  const slotW = 36;
  const slotH = 36;
  const gap = 8;
  const totalW = SYMBOLS_PER_DIGIT * slotW + (SYMBOLS_PER_DIGIT - 1) * gap;
  const startX = (WORLD_WIDTH - totalW) / 2;
  const slotY = y + 12;

  for (let i = 0; i < SYMBOLS_PER_DIGIT; i++) {
    const x = startX + i * (slotW + gap);
    const symbol = state.currentSymbols[i];

    // Slot background
    ctx.fillStyle = C.slotBg;
    ctx.fillRect(x, slotY, slotW, slotH);
    ctx.strokeStyle = symbol ? C.green : C.slotBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, slotY, slotW, slotH);

    // Symbol
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold 20px ${FONT}`;
    
    if (symbol) {
      ctx.fillStyle = C.green;
      ctx.fillText(symbol === '.' ? '▪' : '━', x + slotW / 2, slotY + slotH / 2);
    } else {
      ctx.fillStyle = C.textDim;
      ctx.fillText("_", x + slotW / 2, slotY + slotH / 2);
    }
  }
}

function drawMorseGuide(ctx: CanvasRenderingContext2D): void {
  const y = 240;
  
  // Label
  ctx.fillStyle = C.textDim;
  ctx.font = `11px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("MORSE NUMBER REFERENCE", WORLD_WIDTH / 2, y);

  // Two columns: 0-4 on left, 5-9 on right
  const colW = 130;
  const rowH = 24;
  const leftX = WORLD_WIDTH / 2 - colW - 10;
  const rightX = WORLD_WIDTH / 2 + 10;
  const startY = y + 16;

  ctx.font = `13px ${FONT}`;
  ctx.textBaseline = "middle";

  for (let i = 0; i < 5; i++) {
    const rowY = startY + i * rowH;

    // Left column (0-4)
    const leftDigit = i;
    ctx.textAlign = "left";
    ctx.fillStyle = C.textBright;
    ctx.fillText(String(leftDigit), leftX, rowY + rowH / 2);
    ctx.fillStyle = C.amber;
    ctx.fillText(toMarks(MORSE_CODES[leftDigit]), leftX + 24, rowY + rowH / 2);

    // Right column (5-9)
    const rightDigit = i + 5;
    ctx.fillStyle = C.textBright;
    ctx.fillText(String(rightDigit), rightX, rowY + rowH / 2);
    ctx.fillStyle = C.amber;
    ctx.fillText(toMarks(MORSE_CODES[rightDigit]), rightX + 24, rowY + rowH / 2);
  }

  // Separator line
  ctx.strokeStyle = C.slotBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(WORLD_WIDTH / 2, startY);
  ctx.lineTo(WORLD_WIDTH / 2, startY + 5 * rowH);
  ctx.stroke();
}

function drawStats(ctx: CanvasRenderingContext2D, state: GameState): void {
  const y = 400;

  ctx.fillStyle = C.panel;
  ctx.fillRect(10, y, WORLD_WIDTH - 20, 36);
  ctx.strokeStyle = C.panelBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(10, y, WORLD_WIDTH - 20, 36);

  ctx.font = `10px ${FONT}`;
  ctx.textBaseline = "top";

  // Digits received
  ctx.textAlign = "left";
  ctx.fillStyle = C.textDim;
  ctx.fillText("DIGITS RECEIVED", 20, y + 6);
  ctx.fillStyle = C.textBright;
  ctx.font = `bold 14px ${FONT}`;
  ctx.fillText(`${state.enteredDigits.length} / ${PIN_LENGTH}`, 20, y + 18);

  // Status
  ctx.textAlign = "right";
  ctx.font = `10px ${FONT}`;
  ctx.fillStyle = C.textDim;
  ctx.fillText("STATUS", WORLD_WIDTH - 20, y + 6);
  ctx.font = `bold 14px ${FONT}`;
  
  if (state.phase === 'SUCCESS') {
    ctx.fillStyle = C.green;
    ctx.fillText("OPEN", WORLD_WIDTH - 20, y + 18);
  } else if (state.phase === 'FAILED') {
    ctx.fillStyle = C.danger;
    ctx.fillText("FAILED", WORLD_WIDTH - 20, y + 18);
  } else {
    ctx.fillStyle = C.amber;
    ctx.fillText("ARMED", WORLD_WIDTH - 20, y + 18);
  }
}

function drawMessage(ctx: CanvasRenderingContext2D, state: GameState): void {
  const y = 456;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `12px ${FONT}`;

  if (state.phase === 'SUCCESS') {
    ctx.fillStyle = C.green;
    // Pulsing effect
    const pulse = Math.sin(state.phaseMs / 200) * 0.3 + 0.7;
    ctx.globalAlpha = pulse;
  } else if (state.phase === 'FAILED') {
    ctx.fillStyle = C.danger;
  } else {
    ctx.fillStyle = C.text;
  }

  ctx.fillText(state.message, WORLD_WIDTH / 2, y);
  ctx.globalAlpha = 1;
}

function drawScanlines(ctx: CanvasRenderingContext2D): void {
  // Scanlines
  ctx.fillStyle = C.scanline;
  for (let y = 0; y < WORLD_HEIGHT; y += 3) {
    ctx.fillRect(0, y, WORLD_WIDTH, 1);
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
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
}
