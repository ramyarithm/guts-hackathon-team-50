/**
 * G4 Rhythm Game - Canvas rendering
 * 
 * Visual elements:
 * - Beat indicator (pulsing circle that syncs with the beat)
 * - Tracker bar (fills up/down based on accuracy)
 * - Hit rating feedback (PERFECT, GREAT, etc.)
 * - Visual flash on button press
 * 
 * Updated to use bunker green theme matching other minigames.
 */

import {
  BPM,
  GAME_DURATION_MS,
  MS_PER_BEAT,
  TRACKER_MAX,
  TRACKER_MIN,
  TRACKER_START,
  TRACKER_WIN_THRESHOLD,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  getBeatProgress,
  getTimeToNextBeat,
  type GameState,
} from "./logic";
import { PALETTE } from "../../util/palette";

const FONT = '"ui-monospace", Menlo, Consolas, "Courier New", monospace';

// Bunker terminal palette - matches G1, G3, G6 etc.
const C = {
  letterbox: PALETTE.letterbox,
  bg0: PALETTE.bg0,
  bg1: PALETTE.bg1,
  grid: PALETTE.grid,
  
  // Primary accent (green) - used for beat indicator
  accent: PALETTE.green,
  accentDim: PALETTE.greenDim,
  accentGlow: PALETTE.greenGlow,
  
  // Tracker colors
  tracker: PALETTE.green,
  trackerBg: PALETTE.greenGlow,
  trackerDanger: PALETTE.danger,
  
  // Text - green tinted
  text: PALETTE.text,
  textDim: PALETTE.textDim,
  textBright: PALETTE.flash,
  
  // Rating colors
  perfect: PALETTE.amber,      // Amber for perfect
  great: PALETTE.green,        // Green
  good: PALETTE.cyan,         // Cyan
  ok: PALETTE.teal,           // Teal
  miss: PALETTE.danger,         // Red
  
  // Rings
  ring: "rgba(92, 255, 157, 0.4)",
  
  // Panel
  panel: PALETTE.panel,
  panelEdge: PALETTE.panelEdge,
  panelInner: PALETTE.panelInner,
  
  // CRT
  scanline: PALETTE.scanline,
  flash: PALETTE.flash,
} as const;

/** Draw one frame */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  canvasW: number,
  canvasH: number,
  pressFlash: number = 0, // 0-1, how recently button was pressed
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
  drawTrackerBar(ctx, state);
  drawBeatIndicator(ctx, state, pressFlash);
  drawRatingFeedback(ctx, state);
  drawHUD(ctx, state);
  drawOverlay(ctx, state);
  drawCrt(ctx, scale);

  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, state: GameState): void {
  // Gradient background - bunker teal
  const g = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  g.addColorStop(0, C.bg0);
  g.addColorStop(1, C.bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  
  // Subtle grid pattern - bunker wall style
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let x = 0; x <= WORLD_WIDTH; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= WORLD_HEIGHT; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_WIDTH, y);
    ctx.stroke();
  }
  
  // Pulsing background glow synced to beat
  if (state.phase === "INTRO" || state.phase === "PLAYING") {
    const beatProgress = getBeatProgress(state.timeMs, state.playStartMs);
    const pulse = Math.pow(1 - beatProgress, 3); // Sharp attack, slow decay
    
    const glowGrad = ctx.createRadialGradient(
      WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 0,
      WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH * 0.6
    );
    glowGrad.addColorStop(0, `rgba(92, 255, 157, ${0.08 * pulse})`);
    glowGrad.addColorStop(1, "rgba(92, 255, 157, 0)");
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }
}

function drawTrackerBar(ctx: CanvasRenderingContext2D, state: GameState): void {
  const barX = 30;
  const barY = 60;
  const barW = WORLD_WIDTH - 60;
  const barH = 20;
  
  // Background
  ctx.fillStyle = C.trackerBg;
  ctx.fillRect(barX, barY, barW, barH);
  
  // Border
  ctx.strokeStyle = "rgba(92, 255, 157, 0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, barH);
  
  // Fill
  const fillRatio = (state.tracker - TRACKER_MIN) / (TRACKER_MAX - TRACKER_MIN);
  const fillW = barW * fillRatio;
  
  // Color based on level
  let fillColor: string = C.tracker;
  if (state.tracker < TRACKER_START * 0.5) {
    fillColor = C.trackerDanger;
  } else if (state.tracker >= TRACKER_WIN_THRESHOLD) {
    fillColor = C.perfect;
  }
  
  ctx.fillStyle = fillColor;
  ctx.fillRect(barX, barY, fillW, barH);
  
  // Win threshold marker
  const thresholdX = barX + (barW * (TRACKER_WIN_THRESHOLD - TRACKER_MIN) / (TRACKER_MAX - TRACKER_MIN));
  ctx.strokeStyle = C.perfect;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(thresholdX, barY - 4);
  ctx.lineTo(thresholdX, barY + barH + 4);
  ctx.stroke();
  
  // Start position marker
  const startX = barX + (barW * (TRACKER_START - TRACKER_MIN) / (TRACKER_MAX - TRACKER_MIN));
  ctx.strokeStyle = "rgba(184, 245, 207, 0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(startX, barY);
  ctx.lineTo(startX, barY + barH);
  ctx.stroke();
  
  // Label
  ctx.font = `bold 10px ${FONT}`;
  ctx.fillStyle = C.textDim;
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("RHYTHM", barX, barY - 6);
  
  // Percentage
  ctx.textAlign = "right";
  ctx.fillStyle = fillColor;
  ctx.fillText(`${Math.round(state.tracker)}%`, barX + barW, barY - 6);
}

function drawBeatIndicator(ctx: CanvasRenderingContext2D, state: GameState, pressFlash: number): void {
  const cx = WORLD_WIDTH / 2;
  const cy = WORLD_HEIGHT / 2;
  const baseRadius = 60;
  
  // Beat progress animation
  const beatProgress = getBeatProgress(state.timeMs, state.playStartMs);
  const beatPulse = Math.pow(1 - beatProgress, 2);
  
  // Outer ring (pulses with beat)
  const ringRadius = baseRadius + 30 + beatPulse * 20;
  ctx.strokeStyle = C.ring;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
  ctx.stroke();
  
  // Middle ring
  const midRadius = baseRadius + 15 + beatPulse * 10;
  ctx.strokeStyle = `rgba(92, 255, 157, ${0.2 + beatPulse * 0.2})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, midRadius, 0, Math.PI * 2);
  ctx.stroke();
  
  // Main beat circle
  const mainRadius = baseRadius + pressFlash * 15;
  
  // Glow
  ctx.save();
  ctx.shadowColor = C.accent;
  ctx.shadowBlur = 20 + beatPulse * 30 + pressFlash * 40;
  
  // Fill with gradient
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, mainRadius);
  grad.addColorStop(0, C.accent);
  grad.addColorStop(0.7, C.accent);
  grad.addColorStop(1, C.accentDim);
  
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, mainRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  
  // Inner bright core
  ctx.fillStyle = pressFlash > 0.5 ? C.flash : "rgba(234, 255, 242, 0.8)";
  ctx.beginPath();
  ctx.arc(cx, cy, mainRadius * 0.3, 0, Math.PI * 2);
  ctx.fill();
  
  // Press flash ring
  if (pressFlash > 0) {
    ctx.strokeStyle = `rgba(234, 255, 242, ${pressFlash * 0.8})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, mainRadius + (1 - pressFlash) * 40, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  // "TAP" text in center during playing
  if (state.phase === "PLAYING") {
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillStyle = C.textBright;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("TAP", cx, cy);
  }
}

function drawRatingFeedback(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.lastRating) return;
  
  const timeSince = state.timeMs - state.lastRatingTime;
  if (timeSince > 800) return;
  
  const alpha = 1 - (timeSince / 800);
  const yOffset = (timeSince / 800) * -30;
  
  const cx = WORLD_WIDTH / 2;
  const cy = WORLD_HEIGHT / 2 - 100 + yOffset;
  
  let color: string;
  let text: string;
  
  switch (state.lastRating) {
    case "PERFECT":
      color = C.perfect;
      text = "PERFECT!";
      break;
    case "GREAT":
      color = C.great;
      text = "GREAT!";
      break;
    case "GOOD":
      color = C.good;
      text = "GOOD";
      break;
    case "OK":
      color = C.ok;
      text = "OK";
      break;
    case "MISS":
      color = C.miss;
      text = "MISS";
      break;
    case "SKIP":
      color = C.miss;
      text = "MISS";
      break;
    default:
      return;
  }
  
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `bold 24px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
  // Shadow
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  
  ctx.fillText(text, cx, cy);
  ctx.restore();
}

function drawHUD(ctx: CanvasRenderingContext2D, state: GameState): void {
  // BPM indicator
  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = C.textDim;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`${BPM} BPM`, 12, 12);
  
  // Phase indicator
  ctx.textAlign = "right";
  if (state.phase === "INTRO") {
    const remaining = Math.ceil((state.playStartMs - state.timeMs) / 1000);
    ctx.fillStyle = C.accent;
    ctx.fillText(`LISTEN: ${remaining}s`, WORLD_WIDTH - 12, 12);
  } else if (state.phase === "PLAYING") {
    const elapsed = state.timeMs - state.playStartMs;
    const remaining = Math.ceil((GAME_DURATION_MS - elapsed) / 1000);
    ctx.fillStyle = C.text;
    ctx.fillText(`${remaining}s`, WORLD_WIDTH - 12, 12);
  }
  
  // Timing guide at bottom
  if (state.phase === "PLAYING") {
    const timeToNext = getTimeToNextBeat(state);
    const guideY = WORLD_HEIGHT - 80;
    
    // Beat countdown dots
    ctx.fillStyle = C.textDim;
    ctx.textAlign = "center";
    ctx.font = `10px ${FONT}`;
    
    if (timeToNext < MS_PER_BEAT && timeToNext > 0) {
      const progress = 1 - (timeToNext / MS_PER_BEAT);
      const dotCount = 4;
      const lit = Math.floor(progress * dotCount);
      
      for (let i = 0; i < dotCount; i++) {
        const dotX = WORLD_WIDTH / 2 - 30 + i * 20;
        ctx.fillStyle = i <= lit ? C.accent : C.textDim;
        ctx.beginPath();
        ctx.arc(dotX, guideY, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawOverlay(ctx: CanvasRenderingContext2D, state: GameState): void {
  const cx = WORLD_WIDTH / 2;
  const cy = WORLD_HEIGHT / 2;
  
  switch (state.phase) {
    case "READY":
      drawCard(ctx, cx, cy + 100, 260, 100);
      ctx.fillStyle = C.text;
      ctx.font = `bold 18px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("KEEP THE BEAT", cx, cy + 80);
      
      ctx.fillStyle = C.textDim;
      ctx.font = `12px ${FONT}`;
      ctx.fillText("Listen to the rhythm, then tap along", cx, cy + 105);
      
      ctx.fillStyle = C.accent;
      ctx.font = `bold 14px ${FONT}`;
      const blink = Math.sin(Date.now() / 300) > 0;
      if (blink) {
        ctx.fillText("PRESS TO START", cx, cy + 135);
      }
      break;
      
    case "INTRO":
      // "Listen" indicator
      ctx.fillStyle = C.accent;
      ctx.font = `bold 16px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("♪ LISTEN TO THE BEAT ♪", cx, cy + 140);
      break;
      
    case "SUCCESS":
      ctx.fillStyle = "rgba(92, 255, 157, 0.08)";
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      
      drawCard(ctx, cx, cy, 240, 100);
      
      ctx.save();
      ctx.shadowColor = C.tracker;
      ctx.shadowBlur = 20;
      ctx.fillStyle = C.tracker;
      ctx.font = `bold 28px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PERFECT RHYTHM!", cx, cy - 10);
      ctx.restore();
      
      ctx.fillStyle = C.textDim;
      ctx.font = `12px ${FONT}`;
      ctx.fillText("You kept the beat!", cx, cy + 25);
      break;
      
    case "FAILED":
      ctx.fillStyle = "rgba(255, 107, 87, 0.08)";
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      
      drawCard(ctx, cx, cy, 220, 100);
      
      ctx.fillStyle = C.miss;
      ctx.font = `bold 24px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("OFF BEAT", cx, cy - 10);
      
      ctx.fillStyle = C.textDim;
      ctx.font = `12px ${FONT}`;
      const retryBlink = Math.sin(Date.now() / 300) > 0;
      if (retryBlink) {
        ctx.fillText("Press to retry", cx, cy + 25);
      }
      break;
  }
}

function drawCard(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
  ctx.fillStyle = C.panel;
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.strokeStyle = C.panelEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - w / 2 + 1, cy - h / 2 + 1, w - 2, h - 2);
  ctx.fillStyle = C.panelInner;
  ctx.fillRect(cx - w / 2 + 5, cy - h / 2 + 5, w - 10, h - 10);
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
