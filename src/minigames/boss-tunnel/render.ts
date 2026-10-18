/**
 * Boss Tunnel Escape - Fullscreen immersive rendering
 * 
 * Creates a first-person tunnel view using the perspective wall/ceiling/floor assets.
 * This breaks the convention of center-screen dialog for a more immersive boss fight.
 */

import type { TunnelState } from "./logic";
import { TUNNEL_LENGTH, MAX_LIGHT_TIME_MS, MAX_STILL_TIME_MS } from "./logic";

// ---- Image Loading ----

interface TunnelImages {
  wallLeft: HTMLImageElement | null;
  wallRight: HTMLImageElement | null;
  ceiling: HTMLImageElement | null;
  floor: HTMLImageElement | null;
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
    while (!images) {
      await new Promise(r => setTimeout(r, 50));
    }
    return images;
  }

  imagesLoading = true;
  try {
    const [wallLeft, wallRight, ceiling, floor] = await Promise.all([
      loadImage('/assets/scenes/tunnel_dark_wall.png'),
      loadImage('/assets/scenes/tunnel_dark_wall_right.png'),
      loadImage('/assets/scenes/tunnel_dark_ceiling.png'),
      loadImage('/assets/scenes/tunnel_dark_floor.png'),
    ]);
    images = { wallLeft, wallRight, ceiling, floor };
    console.log('[BossTunnel] Images loaded', {
      wallLeft: `${wallLeft.width}x${wallLeft.height}`,
      wallRight: `${wallRight.width}x${wallRight.height}`,
      ceiling: `${ceiling.width}x${ceiling.height}`,
      floor: `${floor.width}x${floor.height}`,
    });
  } catch (e) {
    console.warn('[BossTunnel] Failed to load images, using fallback', e);
    images = { wallLeft: null, wallRight: null, ceiling: null, floor: null };
  }
  imagesLoading = false;
  return images;
}

// Start loading immediately
void loadImages();

// ---- Colors ----

const COLOR_BG = '#030303';
const COLOR_PROGRESS_BG = 'rgba(255, 255, 255, 0.1)';
const COLOR_PROGRESS_FILL = '#5cff9d';
const COLOR_DANGER_LIGHT = '#ffcc00';
const COLOR_DANGER_STILL = '#ff6b57';
const COLOR_TEXT = 'rgba(255, 255, 255, 0.7)';
const COLOR_TEXT_DIM = 'rgba(255, 255, 255, 0.4)';

// ---- Main Render ----

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: TunnelState,
  canvasWidth: number,
  canvasHeight: number
): void {
  // Disable smoothing for crisp pixel art scaling (images are 320x180)
  ctx.imageSmoothingEnabled = false;
  
  // Clear to black
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  switch (state.phase) {
    case 'PLAYING':
      drawTunnelScene(ctx, state, canvasWidth, canvasHeight);
      drawUI(ctx, state, canvasWidth, canvasHeight);
      break;

    case 'CAUGHT':
      drawCaughtScreen(ctx, state, canvasWidth, canvasHeight);
      break;

    case 'ESCAPED':
      drawEscapedScreen(ctx, state, canvasWidth, canvasHeight);
      break;
  }
}

function drawTunnelScene(
  ctx: CanvasRenderingContext2D,
  state: TunnelState,
  w: number,
  h: number
): void {
  // Calculate progress toward exit (0 to 1)
  const exitProgress = state.distanceTraveled / TUNNEL_LENGTH;
  
  // Light at the end of the tunnel - grows brighter as player approaches
  // Always visible as a faint glow, becomes dominant near the end
  const exitLightIntensity = Math.pow(exitProgress, 1.5); // Accelerates as you get closer
  const exitLightRadius = w * (0.05 + exitProgress * 0.4); // Grows from small dot to large glow
  
  // Draw exit light first (behind everything when flashlight is on)
  if (exitProgress > 0) {
    const exitGradient = ctx.createRadialGradient(
      w / 2, h / 2, 0,
      w / 2, h / 2, exitLightRadius
    );
    // Warm daylight color
    const coreAlpha = 0.3 + exitLightIntensity * 0.7;
    const midAlpha = 0.1 + exitLightIntensity * 0.4;
    exitGradient.addColorStop(0, `rgba(255, 250, 230, ${coreAlpha})`);
    exitGradient.addColorStop(0.3, `rgba(255, 245, 200, ${midAlpha})`);
    exitGradient.addColorStop(0.7, `rgba(200, 180, 150, ${exitLightIntensity * 0.2})`);
    exitGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = exitGradient;
    ctx.fillRect(0, 0, w, h);
  }

  if (!state.lightOn) {
    // In darkness, still show the exit light if close enough
    if (exitProgress < 0.3) {
      // Too far - pitch black
      ctx.fillStyle = COLOR_TEXT_DIM;
      ctx.font = `${Math.floor(h * 0.03)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('[ darkness ]', w / 2, h / 2);
    }
    // Exit light already drawn above will show through
    return;
  }

  if (!images) return;

  // Calculate light intensity (dims as light timer increases)
  const lightProgress = state.lightOnTime / MAX_LIGHT_TIME_MS;
  const baseAlpha = 0.9 - lightProgress * 0.3; // Dims slightly as danger increases
  
  // Movement animation - use distance to create scrolling texture effect
  const movePhase = (state.distanceTraveled * 0.08) % 1; // 0 to 1 repeating cycle
  
  ctx.save();
  ctx.globalAlpha = baseAlpha;

  // Left wall
  if (images.wallLeft) {
    const img = images.wallLeft;
    const wallW = w * 0.5;
    const wallH = h;
    const srcScrollX = img.width * 0.1 * movePhase;
    ctx.drawImage(img, srcScrollX, 0, img.width * 0.9, img.height, 0, 0, wallW, wallH);
  }

  // Right wall
  if (images.wallRight) {
    const img = images.wallRight;
    const wallW = w * 0.5;
    const wallH = h;
    const srcScrollX = img.width * 0.1 * (1 - movePhase);
    ctx.drawImage(img, srcScrollX, 0, img.width * 0.9, img.height, w - wallW, 0, wallW, wallH);
  }

  // Ceiling
  if (images.ceiling) {
    const img = images.ceiling;
    const ceilH = h * 0.4;
    const srcScrollY = img.height * 0.15 * movePhase;
    ctx.drawImage(img, 0, srcScrollY, img.width, img.height * 0.85, 0, 0, w, ceilH);
  }

  // Floor
  if (images.floor) {
    const img = images.floor;
    const floorH = h * 0.4;
    const srcScrollY = img.height * 0.15 * (1 - movePhase);
    ctx.drawImage(img, 0, srcScrollY, img.width, img.height * 0.85, 0, h - floorH, w, floorH);
  }

  ctx.globalAlpha = 1;

  // Vignette to darken edges (flashlight doesn't illuminate the sides)
  const vignette = ctx.createRadialGradient(
    w / 2, h / 2, w * 0.15,
    w / 2, h / 2, w * 0.7
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  // Danger vignette when light has been on too long
  if (lightProgress > 0.5) {
    const dangerAlpha = (lightProgress - 0.5) * 0.6;
    const vignette = ctx.createRadialGradient(
      w / 2, h / 2, w * 0.2,
      w / 2, h / 2, w * 0.8
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, `rgba(255, 100, 50, ${dangerAlpha})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.restore();
}

function drawUI(
  ctx: CanvasRenderingContext2D,
  state: TunnelState,
  w: number,
  h: number
): void {
  const padding = Math.floor(w * 0.04);
  const barHeight = Math.floor(h * 0.02);
  const meterWidth = Math.floor(w * 0.25);
  const fontSize = Math.floor(h * 0.025);

  // Progress bar at top
  const progressY = padding;
  const progressWidth = w - padding * 2;
  const progress = state.distanceTraveled / TUNNEL_LENGTH;

  // Background
  ctx.fillStyle = COLOR_PROGRESS_BG;
  ctx.fillRect(padding, progressY, progressWidth, barHeight);

  // Fill
  ctx.fillStyle = COLOR_PROGRESS_FILL;
  ctx.fillRect(padding, progressY, progressWidth * progress, barHeight);

  // Label
  ctx.fillStyle = COLOR_TEXT;
  ctx.font = `${fontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('EXIT', w / 2, progressY + barHeight + fontSize + 4);

  // Bottom UI area
  const bottomY = h - padding - barHeight;

  // Light meter (left) - only when light is on
  if (state.lightOn) {
    const lightProgress = Math.min(state.lightOnTime / MAX_LIGHT_TIME_MS, 1);
    drawMeter(ctx, padding, bottomY, meterWidth, barHeight, lightProgress, COLOR_DANGER_LIGHT, 'LIGHT', fontSize);
  }

  // Still/Danger meter (right)
  const stillProgress = Math.min(state.stillTime / MAX_STILL_TIME_MS, 1);
  drawMeter(ctx, w - padding - meterWidth, bottomY, meterWidth, barHeight, stillProgress, COLOR_DANGER_STILL, 'DANGER', fontSize);

  // Instructions (center bottom)
  ctx.fillStyle = COLOR_TEXT_DIM;
  ctx.font = `${fontSize}px monospace`;
  ctx.textAlign = 'center';
  const instructionY = bottomY - fontSize - 8;
  if (!state.lightOn) {
    ctx.fillText('A: LIGHT ON', w / 2, instructionY);
  } else {
    ctx.fillText('D: MOVE  •  A: LIGHT OFF', w / 2, instructionY);
  }
}

function drawMeter(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, width: number, height: number,
  progress: number, color: string, label: string, fontSize: number
): void {
  // Background
  ctx.fillStyle = COLOR_PROGRESS_BG;
  ctx.fillRect(x, y, width, height);

  // Fill with pulse when high
  const pulse = progress > 0.7 ? 0.7 + Math.sin(Date.now() / 80) * 0.3 : 1;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width * progress, height);
  ctx.globalAlpha = 1;

  // Label above
  ctx.fillStyle = COLOR_TEXT_DIM;
  ctx.font = `${Math.floor(fontSize * 0.8)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(label, x + width / 2, y - 6);
}

function drawCaughtScreen(
  ctx: CanvasRenderingContext2D,
  state: TunnelState,
  w: number,
  h: number
): void {
  // Red flash that fades
  const flashIntensity = Math.max(0, 1 - state.phaseMs / 800);
  
  // Dark red background
  ctx.fillStyle = `rgb(${Math.floor(40 + flashIntensity * 80)}, 0, 0)`;
  ctx.fillRect(0, 0, w, h);

  // Pulsing vignette
  const pulse = 0.5 + Math.sin(state.phaseMs / 150) * 0.2;
  const vignette = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, `rgba(0, 0, 0, ${pulse})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  // Text
  const titleSize = Math.floor(h * 0.1);
  const subSize = Math.floor(h * 0.035);

  ctx.fillStyle = '#ff3333';
  ctx.font = `bold ${titleSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CAUGHT', w / 2, h / 2 - subSize);

  ctx.fillStyle = COLOR_TEXT_DIM;
  ctx.font = `${subSize}px monospace`;
  ctx.fillText('The monster found you...', w / 2, h / 2 + titleSize / 2);
}

function drawEscapedScreen(
  ctx: CanvasRenderingContext2D,
  state: TunnelState,
  w: number,
  h: number
): void {
  // Bright white flash that intensifies
  const flashIntensity = Math.min(state.phaseMs / 400, 1);
  
  ctx.fillStyle = `rgba(255, 255, 255, ${flashIntensity})`;
  ctx.fillRect(0, 0, w, h);
}

// Export world dimensions for adapter (fullscreen, so use reasonable defaults)
export const WORLD_WIDTH = 800;
export const WORLD_HEIGHT = 600;
