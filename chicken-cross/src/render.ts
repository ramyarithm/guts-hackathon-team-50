// Placeholder canvas drawing for G2: flat rectangles, a circle and text. Reads GameState
// only. The shared UI layer will replace the look later.

import {
  HIT_LOCKOUT_MS,
  LANE_COUNT,
  OBSTACLE_WIDTH,
  PLAYER_COLUMN_X,
  PLAYER_WIDTH,
  ROW_HEIGHT,
  TICK_MS,
  TOP_ROW,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  obstacleVisualX,
  playerVisualRow,
  rowTop,
  type GameState,
} from "./logic";

const FONT = "bold 14px system-ui, sans-serif";

const C = {
  letterbox: "#111",
  safe: "#2f7d4f",
  laneA: "#3b3b46",
  laneB: "#44444f",
  divider: "rgba(255,255,255,0.25)",
  obstacle: "#e0a030",
  player: "#f4f4f4",
  playerHit: "#e04848",
  text: "#ffffff",
  shade: "rgba(0,0,0,0.55)",
} as const;

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

  // Fraction of a tick since the last fixed step, so motion is smooth at any refresh rate.
  const alpha = Math.min(0.999, Math.max(0, state.accumulatorMs / TICK_MS));

  drawRows(ctx);
  drawObstacles(ctx, state, alpha);
  drawPlayer(ctx, state, alpha);
  drawHud(ctx, state);
  drawMessage(ctx, state);

  ctx.restore();
}

function drawRows(ctx: CanvasRenderingContext2D): void {
  for (let row = 0; row <= TOP_ROW; row++) {
    const y = rowTop(row);
    if (row === 0 || row === TOP_ROW) {
      ctx.fillStyle = C.safe;
    } else {
      ctx.fillStyle = row % 2 === 0 ? C.laneA : C.laneB;
    }
    ctx.fillRect(0, y, WORLD_WIDTH, ROW_HEIGHT);
  }
  // Dashed dividers between lanes.
  ctx.strokeStyle = C.divider;
  ctx.lineWidth = 1;
  ctx.setLineDash([8, 8]);
  for (let row = 2; row <= LANE_COUNT; row++) {
    const y = rowTop(row) + ROW_HEIGHT;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_WIDTH, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawObstacles(ctx: CanvasRenderingContext2D, state: GameState, alpha: number): void {
  const pad = 8;
  ctx.fillStyle = C.obstacle;
  state.lanes.forEach((lane, i) => {
    const y = rowTop(i + 1) + pad;
    for (const o of lane.obstacles) {
      const sx = obstacleVisualX(lane, o, alpha);
      if (sx + OBSTACLE_WIDTH < 0 || sx > WORLD_WIDTH) continue;
      ctx.fillRect(sx, y, OBSTACLE_WIDTH, ROW_HEIGHT - pad * 2);
    }
  });
}

function drawPlayer(ctx: CanvasRenderingContext2D, state: GameState, alpha: number): void {
  const cy = rowTop(playerVisualRow(state, alpha)) + ROW_HEIGHT / 2;
  ctx.fillStyle = state.phase === "HIT" ? C.playerHit : C.player;
  ctx.beginPath();
  ctx.arc(PLAYER_COLUMN_X, cy, PLAYER_WIDTH / 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawHud(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.font = FONT;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = C.text;
  const row = state.playerRow;
  const label =
    row === 0 ? `Lane 0/${LANE_COUNT}` : row === TOP_ROW ? `Lane ${LANE_COUNT}/${LANE_COUNT}` : `Lane ${row}/${LANE_COUNT}`;
  ctx.fillText(label, 8, 6);
  if (state.hits > 0) {
    ctx.textAlign = "right";
    ctx.fillText(`Hits: ${state.hits}`, WORLD_WIDTH - 8, 6);
  }
}

function drawMessage(ctx: CanvasRenderingContext2D, state: GameState): void {
  let line1 = "";
  let line2 = "";
  switch (state.phase) {
    case "READY":
      line1 = "Cross the lanes";
      line2 = "Press to start";
      break;
    case "HIT":
      line1 = "Hit!";
      line2 = state.phaseMs >= HIT_LOCKOUT_MS ? "Press to retry" : "";
      break;
    case "SUCCESS":
      line1 = "Crossed!";
      break;
    case "PLAYING":
      return;
  }
  const cx = WORLD_WIDTH / 2;
  const cy = WORLD_HEIGHT / 2;
  ctx.fillStyle = C.shade;
  ctx.fillRect(cx - 110, cy - 30, 220, 60);
  ctx.fillStyle = C.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 20px system-ui, sans-serif";
  ctx.fillText(line1, cx, line2 ? cy - 10 : cy);
  if (line2) {
    ctx.font = FONT;
    ctx.fillText(line2, cx, cy + 14);
  }
}
