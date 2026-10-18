/**
 * Boss Tunnel Escape - Canvas rendering
 * 
 * Renders the dark tunnel scene with:
 * - Tunnel background images (dark when light off, visible when on)
 * - Progress bar showing distance to exit
 * - Danger meters for light time and still time
 * - Screen effects (vignette, flash on caught)
 */

import type { TunnelState } from "./logic";
import { TUNNEL_LENGTH, MAX_LIGHT_TIME_MS, MAX_STILL_TIME_MS } from "./logic";

// ---- Constants ----

const WORLD_WIDTH = 400;
const WORLD_HEIGHT = 300;

// Colors
const COLOR_BG_DARK = '#050505';
const COLOR_BG_LIT = '#1a1a1a';
const COLOR_PROGRESS_BG = '#1a1a1a';
const COLOR_PROGRESS_FILL = '#5cff9d';
const COLOR_PROGRESS_BORDER = '#3d4a3f';
const COLOR_DANGER_BG = '#1a1a1a';
const COLOR_DANGER_LIGHT = '#ffcc00';
const COLOR_DANGER_STILL = '#ff6b57';
const COLOR_TEXT = '#8fa89a';
const COLOR_TEXT_DIM = '#5a6a62';
const COLOR_CAUGHT = '#ff0000';

// Layout
const PROGRESS_BAR_HEIGHT = 16;
const PROGRESS_BAR_MARGIN = 20;
const METER_HEIGHT = 8;
const METER_WIDTH = 120;
const METER_MARGIN = 16;

// ---- Image Loading ----

interface TunnelImages {
  darkWall: HTMLImageElement | null;
  darkCeiling: HTMLImageElement | null;
  darkFloor: HTMLImageElement | null;
}

let images: TunnelImages | null = null;
let imagesLoading = false;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function loadImages(): Promise<TunnelImages> {
  if (images) return images;
  if (imagesLoading) {
    // Wait for existing load
    while (!images) {
      await new Promise(r => setTimeout(r, 50));
    }
    return images;
  }

  imagesLoading = true;
  try {
    const [darkWall, darkCeiling, darkFloor] = await Promise.all([
      loadImage('/assets/scenes/tunnel_dark_wall.png'),
      loadImage('/assets/scenes/tunnel_dark_ceiling.png'),
      loadImage('/assets/scenes/tunnel_dark_floor.png'),
    ]);
    images = { darkWall, darkCeiling, darkFloor };
  } catch (e) {
    console.warn('[BossTunnel] Failed to load images, using fallback', e);
    images = { darkWall: null, darkCeiling: null, darkFloor: null };
  }
  imagesLoading = false;
  return images;
}

// Start loading images immediately
void loadImages();

// ---- Rendering ----

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: TunnelState,
  canvasWidth: number,
  canvasHeight: number
): void {
  const scale = Math.min(canvasWidth / WORLD_WIDTH, canvasHeight / WORLD_HEIGHT);
  
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 
    (canvasWidth - WORLD_WIDTH * scale) / 2,
    (canvasHeight - WORLD_HEIGHT * scale) / 2
  );

  // Clear background
  ctx.fillStyle = state.lightOn ? COLOR_BG_LIT : COLOR_BG_DARK;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // Draw based on phase
  switch (state.phase) {
    case 'PLAYING':
      drawTunnelScene(ctx, state);
      drawProgressBar(ctx, state);
      drawDangerMeters(ctx, state);
      drawInstructions(ctx, state);
      break;

    case 'CAUGHT':
      drawCaughtScreen(ctx, state);
      break;

    case 'ESCAPED':
      drawEscapedScreen(ctx, state);
      break;
  }

  ctx.restore();
}

function drawTunnelScene(ctx: CanvasRenderingContext2D, state: TunnelState): void {
  const centerX = WORLD_WIDTH / 2;
  const centerY = WORLD_HEIGHT / 2;

  if (state.lightOn && images) {
    // Draw tunnel images when light is on
    const imgSize = 120;
    const imgY = centerY - 20;

    if (images.darkCeiling) {
      ctx.globalAlpha = 0.8;
      ctx.drawImage(images.darkCeiling, centerX - imgSize / 2, imgY - 60, imgSize, 50);
    }
    if (images.darkFloor) {
      ctx.globalAlpha = 0.8;
      ctx.drawImage(images.darkFloor, centerX - imgSize / 2, imgY + 30, imgSize, 50);
    }
    if (images.darkWall) {
      ctx.globalAlpha = 1;
      ctx.drawImage(images.darkWall, centerX - imgSize / 2, imgY - 30, imgSize, 80);
    }
    ctx.globalAlpha = 1;

    // Draw light cone effect
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 150);
    gradient.addColorStop(0, 'rgba(255, 255, 200, 0.1)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 200, 0.05)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  } else {
    // Pitch black with subtle text
    ctx.fillStyle = COLOR_TEXT_DIM;
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[ darkness ]', centerX, centerY);
  }

  // Vignette effect
  const vignette = ctx.createRadialGradient(centerX, centerY, 50, centerX, centerY, 250);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
}

function drawProgressBar(ctx: CanvasRenderingContext2D, state: TunnelState): void {
  const barWidth = WORLD_WIDTH - PROGRESS_BAR_MARGIN * 2;
  const barX = PROGRESS_BAR_MARGIN;
  const barY = PROGRESS_BAR_MARGIN;
  const progress = state.distanceTraveled / TUNNEL_LENGTH;

  // Background
  ctx.fillStyle = COLOR_PROGRESS_BG;
  ctx.fillRect(barX, barY, barWidth, PROGRESS_BAR_HEIGHT);

  // Fill
  ctx.fillStyle = COLOR_PROGRESS_FILL;
  ctx.fillRect(barX, barY, barWidth * progress, PROGRESS_BAR_HEIGHT);

  // Border
  ctx.strokeStyle = COLOR_PROGRESS_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barWidth, PROGRESS_BAR_HEIGHT);

  // Label
  ctx.fillStyle = COLOR_TEXT;
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('EXIT', barX + barWidth / 2, barY + PROGRESS_BAR_HEIGHT + 12);
}

function drawDangerMeters(ctx: CanvasRenderingContext2D, state: TunnelState): void {
  const bottomY = WORLD_HEIGHT - METER_MARGIN - METER_HEIGHT;

  // Light meter (left side) - only show when light is on
  if (state.lightOn) {
    const lightProgress = Math.min(state.lightOnTime / MAX_LIGHT_TIME_MS, 1);
    drawMeter(ctx, METER_MARGIN, bottomY, METER_WIDTH, METER_HEIGHT, 
      lightProgress, COLOR_DANGER_LIGHT, 'LIGHT');
  }

  // Still meter (right side) - always show
  const stillProgress = Math.min(state.stillTime / MAX_STILL_TIME_MS, 1);
  drawMeter(ctx, WORLD_WIDTH - METER_MARGIN - METER_WIDTH, bottomY, METER_WIDTH, METER_HEIGHT,
    stillProgress, COLOR_DANGER_STILL, 'DANGER');
}

function drawMeter(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, width: number, height: number,
  progress: number, color: string, label: string
): void {
  // Background
  ctx.fillStyle = COLOR_DANGER_BG;
  ctx.fillRect(x, y, width, height);

  // Fill with pulsing effect when high
  const intensity = progress > 0.7 ? 0.8 + Math.sin(Date.now() / 100) * 0.2 : 1;
  ctx.globalAlpha = intensity;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width * progress, height);
  ctx.globalAlpha = 1;

  // Border
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);

  // Label
  ctx.fillStyle = COLOR_TEXT_DIM;
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, x + width / 2, y - 4);
}

function drawInstructions(ctx: CanvasRenderingContext2D, state: TunnelState): void {
  const y = WORLD_HEIGHT - METER_MARGIN - METER_HEIGHT - 30;
  
  ctx.fillStyle = COLOR_TEXT_DIM;
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  
  if (!state.lightOn) {
    ctx.fillText('Press A to turn on light', WORLD_WIDTH / 2, y);
  } else {
    ctx.fillText('Press D to move • A to turn off light', WORLD_WIDTH / 2, y);
  }
}

function drawCaughtScreen(ctx: CanvasRenderingContext2D, state: TunnelState): void {
  // Flash red
  const flashIntensity = Math.max(0, 1 - state.phaseMs / 500);
  ctx.fillStyle = `rgba(255, 0, 0, ${flashIntensity * 0.5})`;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // Text
  ctx.fillStyle = COLOR_CAUGHT;
  ctx.font = 'bold 32px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CAUGHT', WORLD_WIDTH / 2, WORLD_HEIGHT / 2);

  ctx.fillStyle = COLOR_TEXT_DIM;
  ctx.font = '14px monospace';
  ctx.fillText('The monster found you...', WORLD_WIDTH / 2, WORLD_HEIGHT / 2 + 30);
}

function drawEscapedScreen(ctx: CanvasRenderingContext2D, state: TunnelState): void {
  // Bright white flash that intensifies
  const flashIntensity = Math.min(state.phaseMs / 300, 1);
  ctx.fillStyle = `rgba(255, 255, 255, ${flashIntensity})`;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  if (flashIntensity > 0.5) {
    ctx.fillStyle = COLOR_BG_DARK;
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = (flashIntensity - 0.5) * 2;
    ctx.fillText('ESCAPED', WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    ctx.globalAlpha = 1;
  }
}

// Export for adapter
export { WORLD_WIDTH, WORLD_HEIGHT };
