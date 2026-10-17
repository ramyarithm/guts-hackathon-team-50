/**
 * G3 Rhythm Game - Canvas rendering
 * 
 * Visual elements:
 * - Beat indicator (pulsing circle that syncs with the beat)
 * - Tracker bar (fills up/down based on accuracy)
 * - Hit rating feedback (PERFECT, GREAT, etc.)
 * - Visual flash on button press
 */

import {
  BPM,
  GAME_DURATION_MS,
  INTRO_DURATION_MS,
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

const FONT = '"ui-monospace", Menlo, Consolas, "Courier New", monospace';

const C = {
  bg: "#0a0a12",
  bgGradient1: "#0a0a12",
  bgGradient2: "#12121f",
  
  accent: "#ff6b9d",       // Pink accent
  accentDim: "rgba(255, 107, 157, 0.3)",
  accentGlow: "rgba(255, 107, 157, 0.15)",
  
  tracker: "#5cff9d",      // Green for tracker
  trackerBg: "rgba(92, 255, 157, 0.1)",
  trackerDanger: "#ff6b57", // Red when low
  
  text: "#e0e0e0",
  textDim: "rgba(224, 224, 224, 0.5)",
  textBright: "#ffffff",
  
  perfect: "#ffeb3b",      // Gold
  great: "#5cff9d",        // Green
  good: "#64b5f6",         // Blue
  ok: "#b0bec5",           // Gray
  miss: "#ff6b57",         // Red
  
  ring: "rgba(255, 107, 157, 0.4)",
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
  ctx.fillStyle = C.bg;
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

  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, state: GameState): void {
  // Gradient background
  const g = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  g.addColorStop(0, C.bgGradient1);
  g.addColorStop(1, C.bgGradient2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  
  // Subtle grid pattern
  ctx.strokeStyle = "rgba(255, 107, 157, 0.03)";
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
    const beatProgress = getBeatProgress(state.timeMs);
    const pulse = Math.pow(1 - beatProgress, 3); // Sharp attack, slow decay
    
    const glowGrad = ctx.createRadialGradient(
      WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 0,
      WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH * 0.6
    );
    glowGrad.addColorStop(0, `rgba(255, 107, 157, ${0.1 * pulse})`);
    glowGrad.addColorStop(1, "rgba(255, 107, 157, 0)");
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
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
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
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
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
  const beatProgress = getBeatProgress(state.timeMs);
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
  ctx.strokeStyle = `rgba(255, 107, 157, ${0.2 + beatPulse * 0.2})`;
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
  ctx.fillStyle = pressFlash > 0.5 ? C.textBright : "rgba(255, 255, 255, 0.8)";
  ctx.beginPath();
  ctx.arc(cx, cy, mainRadius * 0.3, 0, Math.PI * 2);
  ctx.fill();
  
  // Press flash ring
  if (pressFlash > 0) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${pressFlash * 0.8})`;
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
    const remaining = Math.ceil((INTRO_DURATION_MS - state.timeMs) / 1000);
    ctx.fillStyle = C.accent;
    ctx.fillText(`LISTEN: ${remaining}s`, WORLD_WIDTH - 12, 12);
  } else if (state.phase === "PLAYING") {
    const elapsed = state.timeMs - INTRO_DURATION_MS;
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
      ctx.fillStyle = "rgba(92, 255, 157, 0.1)";
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
      ctx.fillStyle = "rgba(255, 107, 87, 0.1)";
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
  ctx.fillStyle = "rgba(10, 10, 18, 0.9)";
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.strokeStyle = "rgba(255, 107, 157, 0.3)";
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - w / 2 + 0.5, cy - h / 2 + 0.5, w - 1, h - 1);
}
