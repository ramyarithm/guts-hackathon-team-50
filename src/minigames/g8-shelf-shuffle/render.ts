import { CAPACITY, ROUND_MS, TARGET_MATCHES, WORLD_WIDTH, WORLD_HEIGHT,
  type GameState, type ObjectType } from "./logic";

const P = { bg: "#080f18", panel: "#101d29", line: "#2a424b", dim: "#739098",
  text: "#d6e5d9", teal: "#62d8be", cyan: "#72c9ed", gold: "#e6b76a", red: "#ed796e" };
const NAMES: Record<ObjectType, string> = { BATTERY: "BATTERY", DRIVE: "STORAGE DRIVE", BOX: "TOOLBOX", WRENCH: "WRENCH" };
const INK: Record<ObjectType, string> = { BATTERY: P.teal, DRIVE: P.cyan, BOX: P.gold, WRENCH: "#ccd2df" };
export function drawFrame(ctx: CanvasRenderingContext2D, state: Readonly<GameState>, width: number, height: number): void {
  ctx.setTransform(width / WORLD_WIDTH, 0, 0, height / WORLD_HEIGHT, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  const box = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };
  const text = (value: string, x: number, y: number, color = P.text, size = 10, align: CanvasTextAlign = "left") => {
    ctx.font = `bold ${size}px monospace`; ctx.fillStyle = color; ctx.textAlign = align;
    ctx.textBaseline = "middle"; ctx.fillText(value, x, y);
  };
  const panel = (x: number, y: number, w: number, h: number, border = P.line) => {
    box(x, y, w, h, border); box(x + 1, y + 1, w - 2, h - 2, P.panel);
  };
  const icon = (type: ObjectType, x: number, y: number, scale = 1, flash = false) => {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(scale, scale);
    const c = flash ? "#ffffff" : INK[type];
    box(-12, 9, 24, 3, "#060b12");
    if (type === "BATTERY") {
      box(-6, -9, 12, 19, "#293c42"); box(-4, -7, 8, 15, c); box(-3, -12, 6, 3, "#baccc4");
      box(-1, -5, 3, 5, "#1a4243"); box(-3, -1, 5, 2, "#1a4243"); box(-2, 1, 2, 5, "#1a4243");
    } else if (type === "DRIVE") {
      box(-11, -8, 22, 17, "#2f465b"); box(-9, -6, 18, 12, c); box(-6, -4, 10, 8, "#244455");
      box(-3, -2, 4, 4, "#52788e"); box(5, 2, 3, 2, P.gold); box(-7, 8, 3, 2, "#9cafb6"); box(4, 8, 3, 2, "#9cafb6");
    } else if (type === "BOX") {
      box(-5, -12, 10, 5, "#916948"); box(-3, -10, 6, 3, P.bg); box(-11, -7, 22, 16, c);
      box(-11, -1, 22, 2, "#99653d"); box(-2, -2, 4, 5, "#e8ddae"); box(-8, 5, 5, 2, "#a16e46");
    } else {
      box(-2, -3, 5, 14, c); box(-4, 7, 9, 5, c); box(-1, 9, 3, 2, "#3d495c");
      box(-7, -11, 15, 7, c); box(-6, -5, 13, 4, c); box(-2, -12, 5, 6, P.panel);
      box(-7, -10, 3, 3, c); box(5, -10, 3, 3, c);
    }
    ctx.restore();
  };
  box(0, 0, WORLD_WIDTH, WORLD_HEIGHT, P.bg);
  for (let y = 8; y < 320; y += 16) box(7, y, 1, 2, "#182834");
  text("SHELF SHUFFLE", 14, 17, P.teal, 15);
  text(`${state.matches}/${TARGET_MATCHES}`, 265, 16, P.teal, 14, "right");
  text("MATCHES", 265, 31, P.dim, 7, "right");
  text("STORAGE / REPAIR BAY", 14, 32, P.dim, 8);
  const urgent = state.remainingMs <= 10_000;
  const timerColor = urgent ? P.red : P.teal;
  box(14, 44, 213, 5, P.line);
  box(14, 44, Math.ceil(213 * state.remainingMs / ROUND_MS), 5, timerColor);
  text(`${Math.ceil(state.remainingMs / 1000)}s`, 266, 46, timerColor, 11, "right");
  text(state.phase === "READY" ? "FIRST PLACEMENT STARTS THE CLOCK" : "PLACE THE CURRENT ITEM", 140, 64, P.dim, 8, "center");
  // Intentionally one item only. Never render or receive the remaining sequence.
  if (state.current && state.phase !== "SUCCESS") {
    panel(114, 77, 52, 37); icon(state.current, 140, 96, 1.1);
    text(NAMES[state.current], 140, 124, INK[state.current], 9, "center");
  } else text("ALL SORTED", 140, 101, P.teal, 14, "center");
  for (const side of [0, 1] as const) {
    const x = side === 0 ? 16 : 151;
    const shelf = state.shelves[side];
    const warning = shelf.length >= 3;
    const color = warning ? (shelf.length === 4 ? P.red : P.gold) : P.dim;
    panel(x, 139, 113, 125, warning ? color : P.line);
    text(side === 0 ? "LEFT" : "RIGHT", x + 9, 149, color, 9);
    text(`${shelf.length}/${CAPACITY}`, x + 103, 149, color, 9, "right");
    for (let slot = 0; slot < CAPACITY; slot++) {
      const y = 244 - slot * 25;
      box(x + 8, y - 12, 97, 22, "#0b151f");
      box(x + 7, y + 10, 99, 3, "#314953"); box(x + 7, y + 10, 99, 1, "#536b70");
      text(`${slot + 1}`, x + 14, y, "#344e5a", 7);
      if (shelf[slot]) {
        const fx = state.effects.find(e => e.shelf === side && e.kind === "PLACE" && e.slot === slot);
        const bounce = fx ? -Math.round(12 * (1 - Math.min(1, fx.ageMs / 150)) ** 2) : 0;
        icon(shelf[slot], x + 57, y + bounce, .8);
      }
    }
    for (const fx of state.effects.filter(e => e.shelf === side && e.kind === "MATCH")) {
      const t = fx.ageMs / fx.durationMs;
      if (t < .4) {
        for (let i = 0; i < 3; i++) icon(fx.type, x + 57 + (Math.floor(fx.ageMs / 45) % 2 ? 1 : -1), 244 - (fx.slot + i) * 25, .8, true);
      } else {
        ctx.globalAlpha = Math.max(0, 1 - (t - .4) / .6);
        for (let i = 0; i < 12; i++) {
          const angle = i * 2.4 + fx.id;
          const radius = (t - .4) * 65;
          box(x + 57 + Math.cos(angle) * radius, 244 - (fx.slot + 1) * 25 + Math.sin(angle) * radius, 3, 3, INK[fx.type]);
        }
        text("+1 MATCH", x + 57, 204 - t * 10, P.teal, 9, "center"); ctx.globalAlpha = 1;
      }
    }
  }
  text(`${state.placed} / 24 SORTED`, 140, 277, P.dim, 9, "center");
  if (state.phase === "READY") {
    text("3 IDENTICAL IN A ROW = CLEAR", 140, 295, P.text, 9, "center");
    text("Choose a shelf. No swaps. Keep space.", 140, 310, P.dim, 8, "center");
  } else {
    const full = state.shelves.some(s => s.length === CAPACITY);
    text(full ? "SHELF FULL - USE THE OTHER SIDE" : urgent ? "LOW TIME - KEEP SORTING" : "MATCH THREE. MAKE ROOM.", 140, 302, full || urgent ? P.red : P.dim, 8, "center");
  }
  if (state.phase === "FAILED" || state.phase === "SUCCESS") {
    box(0, 56, 280, 264, "rgba(5,10,17,0.88)");
    panel(22, 106, 236, 126, state.phase === "SUCCESS" ? P.teal : P.red);
    if (state.phase === "SUCCESS") {
      text("BAY RESTORED", 140, 134, P.teal, 19, "center");
      text("8 MATCHES / SHELVES CLEAR", 140, 162, P.text, 10, "center");
      text("SIGNAL RETURNING...", 140, 202, P.dim, 9, "center");
      const t = Math.min(1, state.successMs / 650); box(49, 180, Math.round(182 * t), 4, P.teal);
    } else {
      text("SORTING HALTED", 140, 133, P.red, 17, "center");
      const message = state.failure === "TIMEOUT" ? "TIME RAN OUT" : state.failure === "OVERFLOW" ? `${state.failedShelf === 0 ? "LEFT" : "RIGHT"} SHELF OVERFLOW` : "ITEMS STILL ON THE SHELVES";
      text(message, 140, 160, P.text, 10, "center");
      text("SAME PUZZLE. FRESH 40 SECONDS.", 140, 185, P.dim, 8, "center");
      text("LEFT OR RIGHT TO RETRY", 140, 211, P.teal, 10, "center");
    }
  }
}
