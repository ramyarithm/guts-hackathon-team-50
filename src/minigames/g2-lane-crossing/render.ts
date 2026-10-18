// Canvas drawing for G2: a bunker maintenance corridor. Reads GameState only; never
// touches logic or collision. All art is canvas primitives and gradients.
//
// Readability rules kept here: every obstacle body is drawn exactly as wide as its
// collision width (never narrower), and the player's collision box (75% of the drawn
// width) sits inside the drawn engineer.

import {
  HIT_LOCKOUT_MS,
  LANE_COUNT,
  PLAYER_COLUMN_X,
  PLAYER_WIDTH,
  ROW_HEIGHT,
  TICK_MS,
  TOP_ROW,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  glideProgress,
  obstacleBodiesAt,
  playerVisualRow,
  rowTop,
  type GameState,
  type LaneLayout,
} from './logic';

const FONT = '"ui-monospace", Menlo, Consolas, "Courier New", monospace';

const C = {
  letterbox: '#04070a',
  wall0: '#0c1512',
  wall1: '#070c0a',
  laneA: '#151d1a',
  laneB: '#1a2420',
  rail: '#2f453b',
  sleeper: '#22322b',
  rivet: '#3a5245',
  hazardAmber: 'rgba(201, 138, 26, 0.55)',
  hazardDark: 'rgba(0, 0, 0, 0.45)',
  grating: '#1b2724',
  gratingLine: '#2c3f37',
  gratingEdge: '#c98a1a',
  amber: '#ffb347',
  amberDim: 'rgba(255, 179, 71, 0.35)',
  green: '#5cff9d',
  greenDim: 'rgba(92, 255, 157, 0.35)',
  text: '#b8f5cf',
  textDim: 'rgba(184, 245, 207, 0.65)',
  danger: '#ff6b57',
  scanline: 'rgba(0, 0, 0, 0.18)',
  cartBody: '#3b4a44',
  cartTop: '#4c5f57',
  drumWood: '#5a4632',
  drumFlange: '#7a6245',
  unitBody: '#27383f',
  unitVent: '#182428',
  overalls: '#2f5f45',
  overallsDark: '#234634',
  skin: '#d9b58f',
  hiVis: '#ffd166',
} as const;

const OBSTACLE_PAD = 7; // vertical inset of an obstacle body inside its lane

export interface Renderer {
  drawFrame(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    canvasW: number,
    canvasH: number,
  ): void;
}

/**
 * Create a renderer with its own cache of pre-rendered static layers (background and
 * CRT overlay), rebuilt only when the canvas size changes. One renderer per adapter.
 */
export function createRenderer(): Renderer {
  let cacheKey = '';
  let back: HTMLCanvasElement | null = null;
  let front: HTMLCanvasElement | null = null;

  const ensureLayers = (
    canvasW: number,
    canvasH: number,
    scale: number,
    offX: number,
    offY: number,
  ): void => {
    const key = `${canvasW}x${canvasH}`;
    if (key === cacheKey && back && front) return;
    cacheKey = key;
    back = document.createElement('canvas');
    back.width = canvasW;
    back.height = canvasH;
    front = document.createElement('canvas');
    front.width = canvasW;
    front.height = canvasH;
    const bctx = back.getContext('2d');
    const fctx = front.getContext('2d');
    if (!bctx || !fctx) return;

    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.fillStyle = C.letterbox;
    bctx.fillRect(0, 0, canvasW, canvasH);
    bctx.setTransform(scale, 0, 0, scale, offX, offY);
    bctx.save();
    bctx.beginPath();
    bctx.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    bctx.clip();
    drawStaticBackground(bctx);
    bctx.restore();

    fctx.setTransform(scale, 0, 0, scale, offX, offY);
    fctx.save();
    fctx.beginPath();
    fctx.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    fctx.clip();
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
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      ctx.clip();

      // Fraction of a tick since the last fixed step, for smooth motion at any refresh rate.
      const alpha = Math.min(0.999, Math.max(0, state.accumulatorMs / TICK_MS));
      drawObstacles(ctx, state, alpha);
      drawPlayer(ctx, state, alpha);
      drawHud(ctx, state);
      drawMessage(ctx, state);
      ctx.restore();

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (front) ctx.drawImage(front, 0, 0);
    },
  };
}

// ---- Static background ---------------------------------------------------------

function drawStaticBackground(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  g.addColorStop(0, C.wall0);
  g.addColorStop(1, C.wall1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  for (let row = 1; row <= LANE_COUNT; row++) drawLane(ctx, row);
  drawGrating(ctx, 0, false);
  drawGrating(ctx, TOP_ROW, true);
}

function drawLane(ctx: CanvasRenderingContext2D, row: number): void {
  const y = rowTop(row);
  ctx.fillStyle = row % 2 === 0 ? C.laneA : C.laneB;
  ctx.fillRect(0, y, WORLD_WIDTH, ROW_HEIGHT);

  // Two rails with sleepers between them.
  const railTop = y + 16;
  const railBottom = y + ROW_HEIGHT - 16;
  ctx.fillStyle = C.sleeper;
  for (let x = 6; x < WORLD_WIDTH; x += 26) ctx.fillRect(x, railTop, 10, railBottom - railTop);
  ctx.fillStyle = C.rail;
  ctx.fillRect(0, railTop, WORLD_WIDTH, 3);
  ctx.fillRect(0, railBottom - 3, WORLD_WIDTH, 3);
  // Rivets along the rails.
  ctx.fillStyle = C.rivet;
  for (let x = 12; x < WORLD_WIDTH; x += 26) {
    ctx.fillRect(x, railTop - 2, 2, 2);
    ctx.fillRect(x, railBottom + 1, 2, 2);
  }
  // Faint hazard striping along the lane's top edge.
  for (let x = 0; x < WORLD_WIDTH; x += 16) {
    ctx.fillStyle = (x / 16) % 2 === 0 ? C.hazardAmber : C.hazardDark;
    ctx.fillRect(x, y, 16, 3);
  }
}

function drawGrating(ctx: CanvasRenderingContext2D, row: number, goal: boolean): void {
  const y = rowTop(row);
  ctx.fillStyle = C.grating;
  ctx.fillRect(0, y, WORLD_WIDTH, ROW_HEIGHT);
  ctx.strokeStyle = C.gratingLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= WORLD_WIDTH; x += 10) {
    ctx.moveTo(x + 0.5, y);
    ctx.lineTo(x + 0.5, y + ROW_HEIGHT);
  }
  for (let yy = y; yy <= y + ROW_HEIGHT; yy += 10) {
    ctx.moveTo(0, yy + 0.5);
    ctx.lineTo(WORLD_WIDTH, yy + 0.5);
  }
  ctx.stroke();
  // Amber edge strip on the side facing the lanes.
  ctx.fillStyle = C.gratingEdge;
  if (goal) ctx.fillRect(0, y + ROW_HEIGHT - 3, WORLD_WIDTH, 3);
  else ctx.fillRect(0, y, WORLD_WIDTH, 3);

  if (goal) {
    // Lit terminal: a doorway frame with a glowing sign.
    const w = 150;
    const h = 36;
    const x = (WORLD_WIDTH - w) / 2;
    const ty = y + (ROW_HEIGHT - h) / 2 - 2;
    ctx.fillStyle = 'rgba(4, 10, 8, 0.9)';
    ctx.fillRect(x, ty, w, h);
    ctx.strokeStyle = C.greenDim;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, ty + 1, w - 2, h - 2);
    ctx.save();
    ctx.shadowColor = C.green;
    ctx.shadowBlur = 10;
    ctx.fillStyle = C.green;
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LINE RESTORED', WORLD_WIDTH / 2, ty + h / 2);
    ctx.restore();
    // Small lamps either side of the doorway.
    ctx.fillStyle = C.green;
    ctx.fillRect(x - 10, ty + h / 2 - 2, 4, 4);
    ctx.fillRect(x + w + 6, ty + h / 2 - 2, 4, 4);
  } else {
    ctx.fillStyle = C.textDim;
    ctx.font = `10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MAINTENANCE ACCESS', WORLD_WIDTH / 2, y + ROW_HEIGHT - 10);
  }
}

// ---- Obstacles -------------------------------------------------------------------

function drawObstacles(ctx: CanvasRenderingContext2D, state: GameState, alpha: number): void {
  const blinkOn = Math.floor(state.tick / 8) % 2 === 0;
  state.layout.lanes.forEach((lane, i) => {
    const bodies = obstacleBodiesAt(lane, state.tick, alpha);
    const y = rowTop(i + 1) + OBSTACLE_PAD;
    const h = ROW_HEIGHT - OBSTACLE_PAD * 2;
    for (const b of bodies) {
      if (b.right < 0 || b.left > WORLD_WIDTH) continue;
      drawObstacle(ctx, lane, b.left, b.right, y, h, blinkOn, state.tick);
    }
  });
}

function drawObstacle(
  ctx: CanvasRenderingContext2D,
  lane: LaneLayout,
  left: number,
  right: number,
  y: number,
  h: number,
  blinkOn: boolean,
  tick: number,
): void {
  const w = right - left;
  switch (lane.style % 3) {
    case 0: {
      // Maintenance cart: steel box with a lighter top panel and two wheels.
      ctx.fillStyle = C.cartBody;
      ctx.fillRect(left, y, w, h);
      ctx.fillStyle = C.cartTop;
      ctx.fillRect(left + 3, y + 3, w - 6, h * 0.4);
      ctx.fillStyle = '#101816';
      const wheelY = y + h - 6;
      ctx.beginPath();
      ctx.arc(left + 9, wheelY, 5, 0, Math.PI * 2);
      ctx.arc(right - 9, wheelY, 5, 0, Math.PI * 2);
      ctx.fill();
      // Handle bar across the trailing edge.
      ctx.fillStyle = C.rail;
      if (lane.direction > 0) ctx.fillRect(left + 2, y + h * 0.5, 3, h * 0.35);
      else ctx.fillRect(right - 5, y + h * 0.5, 3, h * 0.35);
      break;
    }
    case 1: {
      // Rolling cable drum: wooden spool, two flanges, cable lines that roll with motion.
      ctx.fillStyle = C.drumWood;
      ctx.fillRect(left, y + 4, w, h - 8);
      ctx.fillStyle = C.drumFlange;
      ctx.fillRect(left, y, 7, h);
      ctx.fillRect(right - 7, y, 7, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      const roll = (tick * lane.speed * lane.direction * (TICK_MS / 1000)) % 8;
      for (let x = left + 9 + roll; x < right - 8; x += 8) {
        ctx.beginPath();
        ctx.moveTo(x, y + 6);
        ctx.lineTo(x, y + h - 6);
        ctx.stroke();
      }
      break;
    }
    default: {
      // Sparking power unit: dark box, amber vents, flickering sparks on top.
      ctx.fillStyle = C.unitBody;
      ctx.fillRect(left, y, w, h);
      ctx.fillStyle = C.unitVent;
      for (let vy = y + 8; vy < y + h - 8; vy += 7) ctx.fillRect(left + 8, vy, w - 16, 3);
      ctx.fillStyle = C.amberDim;
      for (let vy = y + 8; vy < y + h - 8; vy += 14) ctx.fillRect(left + 8, vy, w - 16, 3);
      if ((tick + Math.floor(left)) % 5 < 2) {
        ctx.strokeStyle = C.amber;
        ctx.lineWidth = 1.5;
        const sx = left + w / 2 + ((tick * 7) % 11) - 5;
        ctx.beginPath();
        ctx.moveTo(sx, y + 2);
        ctx.lineTo(sx + 4, y - 4);
        ctx.lineTo(sx + 2, y - 7);
        ctx.stroke();
      }
      break;
    }
  }
  // Outline so the body reads as one object against the rails.
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, y + 0.5, w - 1, h - 1);

  // Warning light on the leading edge, blinking.
  const lx = lane.direction > 0 ? right - 6 : left + 6;
  ctx.fillStyle = blinkOn ? C.amber : 'rgba(255,179,71,0.25)';
  ctx.beginPath();
  ctx.arc(lx, y + 7, 3, 0, Math.PI * 2);
  ctx.fill();
}

// ---- Player ------------------------------------------------------------------------

function drawPlayer(ctx: CanvasRenderingContext2D, state: GameState, alpha: number): void {
  const row = playerVisualRow(state, alpha);
  const progress = glideProgress(state, alpha);
  const bob = state.glide ? -Math.sin(progress * Math.PI) * 3 : 0;
  const cx = PLAYER_COLUMN_X;
  const cy = rowTop(row) + ROW_HEIGHT / 2 + bob;
  const hit = state.phase === 'HIT';
  const half = PLAYER_WIDTH / 2;

  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 10, half - 2, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Shoulders / overalls (top-down), exactly the drawn width.
  ctx.fillStyle = hit ? '#7a2d25' : C.overalls;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, half, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hit ? '#5a1f19' : C.overallsDark;
  ctx.fillRect(cx - half + 4, cy + 6, PLAYER_WIDTH - 8, 4);
  // Hi-vis stripes.
  ctx.fillStyle = C.hiVis;
  ctx.fillRect(cx - half + 3, cy - 1, 5, 6);
  ctx.fillRect(cx + half - 8, cy - 1, 5, 6);

  // Toolbox on the right hand, inside the drawn width.
  ctx.fillStyle = C.gratingEdge;
  ctx.fillRect(cx + 4, cy + 5, 8, 6);
  ctx.fillStyle = '#3a2a10';
  ctx.fillRect(cx + 6, cy + 4, 4, 2);

  // Hard hat.
  ctx.fillStyle = hit ? C.danger : C.amber;
  ctx.beginPath();
  ctx.arc(cx, cy - 1, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(cx - 2.5, cy - 3.5, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.skin;
  ctx.fillRect(cx - 4, cy + 6, 8, 2);

  if (hit) {
    ctx.strokeStyle = C.danger;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, half + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ---- HUD and messages ----------------------------------------------------------------

function drawHud(ctx: CanvasRenderingContext2D, state: GameState): void {
  const row = state.playerRow;
  const laneNo = Math.min(LANE_COUNT, Math.max(0, row));
  const label = `Lane ${laneNo}/${LANE_COUNT}`;
  ctx.font = `bold 12px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(4, 10, 8, 0.75)';
  ctx.fillRect(6, 6, ctx.measureText(label).width + 12, 18);
  ctx.fillStyle = C.text;
  ctx.fillText(label, 12, 9);
  if (state.hits > 0) {
    const hits = `Hits ${state.hits}`;
    const w = ctx.measureText(hits).width + 12;
    ctx.fillStyle = 'rgba(4, 10, 8, 0.75)';
    ctx.fillRect(WORLD_WIDTH - 6 - w, 6, w, 18);
    ctx.fillStyle = C.textDim;
    ctx.textAlign = 'right';
    ctx.fillText(hits, WORLD_WIDTH - 12, 9);
  }
}

function drawMessage(ctx: CanvasRenderingContext2D, state: GameState): void {
  const cx = WORLD_WIDTH / 2;
  const cy = WORLD_HEIGHT / 2;
  const blink = Math.sin(state.timeMs / 300) > 0;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  switch (state.phase) {
    case 'READY': {
      drawCard(ctx, cx, cy, 250, 84);
      ctx.fillStyle = C.text;
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText('CROSS THE CORRIDOR', cx, cy - 22);
      ctx.fillStyle = C.textDim;
      ctx.font = `11px ${FONT}`;
      ctx.fillText('Reach the far terminal.', cx, cy - 3);
      ctx.fillText('Forward and Back, one lane at a time.', cx, cy + 11);
      if (blink) {
        ctx.fillStyle = C.green;
        ctx.font = `bold 12px ${FONT}`;
        ctx.fillText('PRESS TO START', cx, cy + 29);
      }
      break;
    }
    case 'HIT': {
      ctx.fillStyle = 'rgba(255, 107, 87, 0.08)';
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      drawCard(ctx, cx, cy, 200, 72);
      ctx.fillStyle = C.danger;
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText('Hit!', cx, cy - 12);
      if (state.phaseMs >= HIT_LOCKOUT_MS && blink) {
        ctx.fillStyle = C.text;
        ctx.font = `bold 12px ${FONT}`;
        ctx.fillText('PRESS TO RETRY', cx, cy + 16);
      }
      break;
    }
    case 'SUCCESS': {
      ctx.fillStyle = 'rgba(92, 255, 157, 0.08)';
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      drawCard(ctx, cx, cy, 220, 72);
      ctx.save();
      ctx.shadowColor = C.green;
      ctx.shadowBlur = 16;
      ctx.fillStyle = C.green;
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText('Crossed!', cx, cy - 10);
      ctx.restore();
      ctx.fillStyle = C.textDim;
      ctx.font = `11px ${FONT}`;
      ctx.fillText('Terminal reached. Line restored.', cx, cy + 16);
      break;
    }
    case 'PLAYING':
      break;
  }
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = 'rgba(4, 10, 8, 0.86)';
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.strokeStyle = 'rgba(92,255,157,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - w / 2 + 0.5, cy - h / 2 + 0.5, w - 1, h - 1);
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
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
}
