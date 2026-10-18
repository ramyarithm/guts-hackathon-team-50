// Dead Line - retro raycaster at a low internal resolution, scaled up with nearest-neighbour.
// Walks the tile grid from world.ts (real T junctions, dark side passages, the blast door),
// with procedural bunker textures on offscreen canvases: riveted steel panels, cable trays,
// junction boxes, relay cabinets, stencils, caged lamps, grating over water, pipes and
// ducting. Distance fog to black, lantern falloff and flicker, emissive lamps and the
// daylight around the door, grain, vignette, the eyes, and a crisp HUD.

import {
  ATTENTION_CAUGHT, DARK_HINT_TEXT, DETECT_THRESHOLD, PANIC_THRESHOLD, PROMPT_TEXT,
  cameraPose, darkHintVisible, doorSequence, eyesVisible, labelsFor, transitionProgress, tutorialPrompt,
  type TunnelState,
} from "./logic";
import { AXIS_CROSS, AXIS_X, SIGN_COUNT, SOLID, axisAt, buildGrid, cellAt, faceKey, type Deco, type Grid, type Heading, type Layout } from "./world";

export const INTERNAL_W = 320;
export const INTERNAL_H = 180;
/** Wall textures are larger so the stencils stay readable up close. */
const WT = 128;
const FT = 64;
const FOV = 1.15; // radians (~66 degrees)
const FONT = '"ui-monospace", Menlo, Consolas, "Courier New", monospace';

interface Tex { size: number; data: Uint8ClampedArray; emit: Uint8ClampedArray | null }

export interface Renderer {
  draw(ctx: CanvasRenderingContext2D, state: TunnelState, width: number, height: number, nowMs: number): void;
  dispose(): void;
}

// ---- Palette (from assets/scenes: cold blue-grey steel panels with dark seams, phosphor-green
// readouts, amber/red lamps, yellow-black hazard striping on the vault door) -----------------
const PAINT = [66, 80, 78] as const;       // institutional grey-green paint
const SEAM = [18, 26, 29] as const;        // the dark panel joints of the bunker walls
const RIVET = [104, 116, 112] as const;
const PRIMER = [96, 92, 80] as const;      // chipped paint showing primer
const RUST = [122, 66, 34] as const;
const STENCIL = "rgba(198,204,176,0.82)";  // pale stencil paint
const HAZARD = [160, 128, 34] as const;
const LAMP_WARM = [255, 190, 112] as const;
const DAYLIGHT = [255, 246, 222] as const;

const rgb = (c: readonly [number, number, number], a = 1): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function rngOf(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function canvasOf(size: number): CanvasRenderingContext2D {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return c.getContext("2d")!;
}

/** Paint a texture; `e` is the emissive mask (white = glows on its own). */
function makeTex(size: number, paint: (g: CanvasRenderingContext2D, e: CanvasRenderingContext2D) => void): Tex {
  const g = canvasOf(size);
  const e = canvasOf(size);
  e.fillStyle = "#000";
  e.fillRect(0, 0, size, size);
  paint(g, e);
  const emit = e.getImageData(0, 0, size, size).data;
  let any = false;
  for (let i = 0; i < emit.length && !any; i += 4) if (emit[i]! > 0) any = true;
  return { size, data: g.getImageData(0, 0, size, size).data, emit: any ? emit : null };
}

function stencil(g: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color = STENCIL): void {
  g.font = `bold ${px}px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "rgba(0,0,0,0.5)";
  g.fillText(text, x + 1, y + 1);
  g.fillStyle = color;
  g.fillText(text, x, y);
}

// ---- Wall painters (128 px) -----------------------------------------------------------------

/** Riveted, painted steel panels with a cable tray along the top. Every wall starts here. */
function steel(g: CanvasRenderingContext2D, rng: () => number, variant: number): void {
  const S = WT;
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    const row = (rng() - 0.5) * 6; // brush streaks
    for (let x = 0; x < S; x++) {
      const n = (rng() - 0.5) * 20 + row;
      const i = (y * S + x) * 4;
      img.data[i] = PAINT[0] + n; img.data[i + 1] = PAINT[1] + n; img.data[i + 2] = PAINT[2] + n - 2; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // Lower skirting panel is grimier.
  g.fillStyle = "rgba(0,0,0,0.2)"; g.fillRect(0, 100, S, S - 100);
  // Chipped paint and bare metal.
  for (let i = 0; i < 12; i++) {
    g.fillStyle = i < 8 ? rgb(PRIMER) : "rgb(118,122,120)";
    g.beginPath(); g.ellipse(rng() * S, 30 + rng() * 96, 1.5 + rng() * 3, 1 + rng() * 2, rng() * 3, 0, Math.PI * 2); g.fill();
  }
  // Rust streaks running down from rivets.
  for (let i = 0; i < 5; i++) {
    const x = 4 + Math.floor(rng() * 8) * 16, y0 = 28 + rng() * 60, len = 10 + rng() * 40;
    const grad = g.createLinearGradient(0, y0, 0, y0 + len);
    grad.addColorStop(0, rgb(RUST, 0.55)); grad.addColorStop(1, rgb(RUST, 0));
    g.fillStyle = grad; g.fillRect(x - 1, y0, 2 + rng() * 2, len);
  }
  // Seams between panels (two panels per tile) and the skirting joint.
  g.fillStyle = rgb(SEAM); g.fillRect(0, 0, 2, S); g.fillRect(63, 0, 2, S); g.fillRect(0, 99, S, 2);
  g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(2, 0, 1, S); g.fillRect(65, 0, 1, S); g.fillRect(0, 101, S, 1);
  // Rivets along the seams.
  const rivet = (x: number, y: number): void => { g.fillStyle = rgb(SEAM); g.fillRect(x, y + 1, 3, 3); g.fillStyle = rgb(RIVET); g.fillRect(x, y, 3, 3); g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(x, y, 1, 1); };
  for (const y of [30, 52, 74, 92, 108, 120]) { rivet(5, y); rivet(58, y); rivet(67, y); rivet(121, y); }
  for (let x = 20; x < S; x += 16) { rivet(x, 29); rivet(x, 104); }
  // Cable tray with bundled phone cables and tags.
  g.fillStyle = "rgb(26,32,34)"; g.fillRect(0, 4, S, 17);
  g.fillStyle = "rgb(74,82,80)"; g.fillRect(0, 4, S, 1); g.fillRect(0, 20, S, 1);
  const cables = ["rgb(74,52,48)", "rgb(42,58,48)", "rgb(48,48,68)", "rgb(70,70,66)", "rgb(60,44,52)"];
  cables.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, 7 + i * 2.6, S, 2); });
  for (let i = 0; i < 2; i++) { const x = 10 + rng() * 100; g.fillStyle = "rgb(190,180,142)"; g.fillRect(x, 9, 7, 4); g.fillStyle = "rgb(40,36,30)"; g.fillRect(x + 1, 11, 4, 1); }
  // Conduit below the tray.
  g.fillStyle = "rgb(56,62,60)"; g.fillRect(0, 23, S, 4); g.fillStyle = "rgb(84,92,88)"; g.fillRect(0, 23, S, 1);
  if (variant === 1) { // grime drips from the skirting joint
    g.fillStyle = "rgba(14,18,18,0.45)";
    for (let i = 0; i < 4; i++) { const x = rng() * S; g.fillRect(x, 101, 2, 6 + rng() * 14); }
  } else if (variant === 2) { // panel number
    stencil(g, `P-${20 + Math.floor(rng() * 70)}`, 96, 114, 7, "rgba(198,204,176,0.4)");
  } else if (variant === 3) { // a loose cable hanging from the tray
    g.strokeStyle = "rgb(38,34,34)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(40, 20); g.bezierCurveTo(40, 50, 60, 60, 58, 80); g.stroke();
  }
}

function paintBox(g: CanvasRenderingContext2D, rng: () => number, variant: number): void {
  steel(g, rng, 0);
  // Conduits down from the tray into the box.
  g.fillStyle = "rgb(52,58,56)"; g.fillRect(52, 20, 3, 30); g.fillRect(72, 20, 3, 30);
  g.fillStyle = "rgb(28,34,36)"; g.fillRect(41, 47, 48, 52);
  g.fillStyle = "rgb(72,80,78)"; g.fillRect(42, 48, 46, 50);
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(42, 48, 46, 1);
  g.fillStyle = "rgb(120,126,122)";
  for (const [x, y] of [[44, 50], [84, 50], [44, 94], [84, 94]] as const) g.fillRect(x, y, 2, 2);
  if (variant === 2) { // lid open: terminal strip
    g.fillStyle = "rgb(36,40,40)"; g.fillRect(48, 56, 34, 34);
    for (let i = 0; i < 6; i++) { g.fillStyle = ["rgb(160,60,50)", "rgb(60,140,80)", "rgb(170,150,60)"][i % 3]!; g.fillRect(51 + i * 5, 60 + (i % 2) * 14, 3, 10); }
  } else {
    g.fillStyle = "rgb(178,172,136)"; g.fillRect(50, 58, 30, 9);
    stencil(g, `JB ${variant * 7 + 12}`, 65, 63, 6, "rgb(40,36,30)");
    g.fillStyle = "rgb(60,68,66)"; g.fillRect(50, 72, 30, 18);
    g.fillStyle = "rgb(110,118,114)"; g.fillRect(62, 78, 6, 6); // keyhole plate
  }
}

function paintCabinet(g: CanvasRenderingContext2D, rng: () => number): void {
  steel(g, rng, 0);
  g.fillStyle = "rgb(24,30,32)"; g.fillRect(29, 29, 70, 92);
  g.fillStyle = "rgb(58,68,66)"; g.fillRect(30, 30, 68, 90);
  g.fillStyle = "rgba(255,255,255,0.1)"; g.fillRect(30, 30, 68, 1); g.fillRect(30, 30, 1, 90);
  g.fillStyle = "rgb(30,36,36)";
  for (let y = 44; y < 72; y += 4) g.fillRect(40, y, 48, 1); // louvres
  g.fillStyle = "rgb(118,124,120)"; g.fillRect(88, 78, 3, 14); // handle
  g.fillStyle = "rgb(26,30,32)"; g.fillRect(40, 84, 36, 24);
  for (let i = 0; i < 8; i++) { g.fillStyle = i === 3 ? "rgb(220,90,70)" : "rgb(52,60,58)"; g.fillRect(43 + (i % 4) * 8, 88 + Math.floor(i / 4) * 9, 4, 4); } // indicator lamps, one red
  stencil(g, "RELAY", 64, 37, 7);
  const grad = g.createLinearGradient(0, 100, 0, 120); grad.addColorStop(0, rgb(RUST, 0)); grad.addColorStop(1, rgb(RUST, 0.5));
  g.fillStyle = grad; g.fillRect(30, 100, 68, 20);
}

const SIGN_TEXT: ReadonlyArray<readonly string[]> = [["LINE 4"], ["SECTOR C"], ["MAINTENANCE", "ACCESS"], ["AUTHORISED", "PERSONNEL ONLY"], ["COMMS TRUNK", "DO NOT CUT"]];

function paintSign(g: CanvasRenderingContext2D, rng: () => number, text: number, arrow: -1 | 0 | 1): void {
  steel(g, rng, 0);
  const lines = SIGN_TEXT[text % SIGN_COUNT]!;
  g.fillStyle = "rgba(20,26,28,0.5)"; g.fillRect(12, 44, 104, 42);
  g.strokeStyle = "rgba(198,204,176,0.35)"; g.lineWidth = 1; g.strokeRect(12.5, 44.5, 103, 41);
  const withArrow = arrow !== 0 && text < 3;
  const cx = withArrow ? 64 - arrow * 12 : 64;
  if (lines.length === 1) stencil(g, lines[0]!, cx, 65, withArrow ? 12 : 13);
  else { stencil(g, lines[0]!, cx, 57, 9); stencil(g, lines[1]!, cx, 72, 9); }
  if (withArrow) {
    g.fillStyle = STENCIL;
    const ax = arrow > 0 ? 100 : 28;
    g.beginPath(); g.moveTo(ax, 65); g.lineTo(ax - arrow * 10, 57); g.lineTo(ax - arrow * 10, 73); g.closePath(); g.fill();
    g.fillRect(arrow > 0 ? ax - 18 : ax + 10, 63, 8, 4);
  }
}

function paintLamp(g: CanvasRenderingContext2D, e: CanvasRenderingContext2D, rng: () => number, alive: boolean): void {
  steel(g, rng, 0);
  g.fillStyle = "rgb(36,40,40)"; g.fillRect(40, 44, 48, 44);
  g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(40, 44, 48, 1);
  g.fillStyle = alive ? rgb(LAMP_WARM) : "rgb(46,52,50)";
  g.beginPath(); g.ellipse(64, 66, 18, 13, 0, 0, Math.PI * 2); g.fill();
  if (!alive) { g.fillStyle = "rgba(255,255,255,0.06)"; g.beginPath(); g.ellipse(58, 61, 6, 3, -0.5, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = "rgb(86,90,88)";
  for (const x of [52, 63, 74]) g.fillRect(x, 52, 2, 28);
  for (const y of [58, 72]) g.fillRect(45, y, 38, 2);
  if (alive) {
    const halo = e.createRadialGradient(64, 66, 10, 64, 66, 40);
    halo.addColorStop(0, "rgba(255,255,255,0.45)"); halo.addColorStop(1, "rgba(255,255,255,0)");
    e.fillStyle = halo; e.fillRect(0, 0, WT, WT);
    e.fillStyle = "#fff"; e.beginPath(); e.ellipse(64, 66, 16, 11, 0, 0, Math.PI * 2); e.fill();
  }
}

function paintChalk(g: CanvasRenderingContext2D, rng: () => number, arrow: -1 | 1): void {
  steel(g, rng, 0);
  g.save();
  if (arrow < 0) { g.translate(WT, 0); g.scale(-1, 1); }
  g.lineCap = "round"; g.lineJoin = "round";
  for (const [w, a, dy] of [[7, 0.9, 0], [3, 0.35, -3], [3, 0.3, 3]] as const) {
    g.strokeStyle = `rgba(242,240,226,${a})`; g.lineWidth = w;
    g.beginPath(); g.moveTo(26, 70 + dy); g.lineTo(98, 68 + dy); g.moveTo(80, 50 + dy); g.lineTo(98, 68 + dy); g.lineTo(82, 86 + dy); g.stroke();
  }
  g.restore();
  g.strokeStyle = "rgba(242,240,226,0.8)"; g.lineWidth = 2;
  for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(30 + i * 5, 100); g.lineTo(31 + i * 5, 112); g.stroke(); } // tally marks
}

/** The blast door at the end. `wheel` and `swing` are 0..1 (the opening sequence). */
function paintDoor(g: CanvasRenderingContext2D, e: CanvasRenderingContext2D, rng: () => number, wheel: number, swing: number): void {
  steel(g, rng, 0);
  const S = WT;
  // Hazard-striped frame.
  g.fillStyle = rgb(HAZARD); g.fillRect(6, 4, S - 12, S - 4);
  g.save(); g.beginPath(); g.rect(6, 4, S - 12, S - 4); g.clip();
  g.fillStyle = "rgb(22,22,20)";
  for (let x = -S; x < S * 2; x += 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 6, 0); g.lineTo(x + 6 - S, S); g.lineTo(x - S, S); g.closePath(); g.fill(); }
  g.restore();
  // The opening behind the leaf: daylight.
  const ox = 18, oy = 16, ow = S - 36, oh = S - 16;
  g.fillStyle = rgb(DAYLIGHT); g.fillRect(ox, oy, ow, oh);
  e.fillStyle = "#fff"; e.fillRect(ox, oy, ow, oh);
  // Leaf: shrinks toward the hinge as it swings open.
  const lw = ow * (1 - swing);
  if (lw > 0.5) {
    g.save(); g.beginPath(); g.rect(ox, oy, lw, oh); g.clip();
    g.translate(ox, oy); g.scale(lw / ow, 1);
    g.fillStyle = "rgb(74,80,78)"; g.fillRect(0, 0, ow, oh);
    g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, oh - 20, ow, 20);
    g.fillStyle = "rgb(58,64,62)"; g.fillRect(0, 0, 7, oh); // hinge column
    g.fillStyle = rgb(RIVET);
    for (let y = 8; y < oh; y += 14) { g.fillRect(2, y, 3, 3); g.fillRect(ow - 6, y, 3, 3); }
    // Standing at the door the camera sees roughly the middle half of this texture, so the
    // stencils and the wheel sit in that band.
    g.fillStyle = "rgb(60,66,64)"; g.fillRect(10, 10, ow - 14, 6); g.fillRect(10, oh - 26, ow - 14, 6); // reinforcing bands
    stencil(g, "SURFACE ACCESS", ow / 2 + 2, 26, 8);
    stencil(g, "EMERGENCY EXIT", ow / 2 + 2, 38, 6, "rgba(220,120,90,0.9)");
    // Locking wheel.
    const cx = ow / 2 + 2, cy = 66, r = 17, a0 = wheel * Math.PI * 5;
    g.strokeStyle = "rgb(150,156,152)"; g.lineWidth = 4;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3;
    for (let i = 0; i < 6; i++) { const a = a0 + (i * Math.PI) / 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke(); }
    g.fillStyle = "rgb(120,126,122)"; g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(0,0,0,0.35)"; g.beginPath(); g.arc(cx, cy, r + 4, 0, Math.PI * 2); g.arc(cx, cy, r + 2, 0, Math.PI * 2, true); g.fill();
    g.restore();
    // Door thickness at the swinging edge.
    if (swing > 0) { g.fillStyle = "rgb(40,44,44)"; g.fillRect(ox + lw - 1, oy, 4, oh); }
    // The leaf blocks the daylight; only the slit around it glows, with a soft halo.
    e.fillStyle = "#000"; e.fillRect(ox, oy, lw, oh);
    e.fillStyle = "rgba(255,255,255,0.35)";
    e.fillRect(ox - 6, oy - 6, lw + 12, 6); e.fillRect(ox - 6, oy, 6, oh); e.fillRect(ox + lw, oy, 6, oh);
    e.fillStyle = "#fff";
    e.fillRect(ox - 2, oy - 2, lw + 4, 3); e.fillRect(ox - 2, oy, 3, oh); e.fillRect(ox + lw - 1, oy, 3, oh);
    g.fillStyle = rgb(DAYLIGHT, 0.9);
    g.fillRect(ox, oy, lw, 1); g.fillRect(ox, oy, 1, oh); g.fillRect(ox + lw - 1, oy, 1, oh);
  }
}

// ---- Floor and ceiling painters (64 px, v runs along the corridor) --------------------------

function paintGrating(g: CanvasRenderingContext2D, rng: () => number): void {
  const S = FT;
  g.fillStyle = "rgb(12,20,26)"; g.fillRect(0, 0, S, S); // dark water under the grating
  for (let i = 0; i < 5; i++) { // puddle highlights, blue so the renderer can add sheen
    g.fillStyle = `rgba(40,70,96,${0.4 + rng() * 0.4})`;
    g.beginPath(); g.ellipse(rng() * S, rng() * S, 6 + rng() * 12, 4 + rng() * 8, rng() * 3, 0, Math.PI * 2); g.fill();
  }
  for (let x = 0; x < S; x += 6) { g.fillStyle = "rgb(66,72,70)"; g.fillRect(x, 0, 2, S); g.fillStyle = "rgba(255,255,255,0.1)"; g.fillRect(x, 0, 1, S); } // bars across
  g.fillStyle = "rgb(58,64,62)";
  for (let y = 0; y < S; y += 16) g.fillRect(0, y, S, 2); // bearer bars along
  g.fillStyle = rgb(RUST, 0.35);
  for (let i = 0; i < 6; i++) g.fillRect(Math.floor(rng() * 10) * 6, rng() * S, 2, 3 + rng() * 6);
}

function paintPlate(g: CanvasRenderingContext2D, rng: () => number): void {
  const S = FT;
  g.fillStyle = "rgb(54,60,58)"; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${rng() * 0.25})`; g.fillRect(rng() * S, rng() * S, 1, 1); }
  g.fillStyle = "rgb(30,36,36)"; g.fillRect(0, 0, S, 2); g.fillRect(0, 0, 2, S);
  g.fillStyle = "rgb(20,28,32)"; g.fillRect(24, 24, 16, 16); // drain
  g.fillStyle = "rgb(70,76,74)";
  for (let y = 26; y < 40; y += 4) g.fillRect(26, y, 12, 1);
  g.fillStyle = "rgba(40,70,96,0.5)"; g.beginPath(); g.ellipse(32, 44, 14, 6, 0, 0, Math.PI * 2); g.fill();
}

function paintCeiling(g: CanvasRenderingContext2D, rng: () => number): void {
  const S = FT;
  const img = g.createImageData(S, S);
  for (let i = 0; i < img.data.length; i += 4) { const v = 42 + (rng() - 0.5) * 14; img.data[i] = v; img.data[i + 1] = v + 5; img.data[i + 2] = v + 4; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  // Duct, two pipes and a cable bundle, all running along the corridor (v).
  g.fillStyle = "rgb(50,56,58)"; g.fillRect(22, 0, 18, S); g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(24, 0, 2, S);
  g.fillStyle = "rgb(34,40,42)";
  for (let y = 0; y < S; y += 16) g.fillRect(22, y, 18, 2); // flanges
  g.fillStyle = "rgb(64,68,64)"; g.fillRect(8, 0, 7, S); g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(10, 0, 1, S);
  g.fillStyle = "rgb(62,52,46)"; g.fillRect(46, 0, 5, S); g.fillStyle = rgb(RUST, 0.5); g.fillRect(47, 20, 3, 10);
  g.fillStyle = "rgb(28,28,30)"; g.fillRect(56, 0, 3, S);
  g.fillStyle = "rgb(30,34,36)";
  for (let y = 4; y < S; y += 20) { g.fillRect(6, y, 11, 2); g.fillRect(44, y, 9, 2); } // pipe hangers
}

function paintCeilingCross(g: CanvasRenderingContext2D, rng: () => number): void {
  paintCeiling(g, rng);
  const S = FT;
  g.fillStyle = "rgb(46,52,54)"; g.fillRect(0, 22, S, 18); // duct crossing
  g.fillStyle = "rgb(34,40,42)"; g.fillRect(0, 22, S, 2); g.fillRect(0, 38, S, 2);
  g.fillStyle = "rgb(40,46,48)"; g.fillRect(18, 18, 26, 26); g.fillStyle = "rgb(26,30,32)"; g.fillRect(20, 20, 22, 22); // junction box
  g.fillStyle = "rgb(44,50,48)"; g.fillRect(27, 27, 8, 8); // dead fitting
}

// ---- Renderer ----------------------------------------------------------------------------

export function createRenderer(): Renderer {
  const small = document.createElement("canvas");
  small.width = INTERNAL_W;
  small.height = INTERNAL_H;
  const sctx = small.getContext("2d")!;
  const img = sctx.createImageData(INTERNAL_W, INTERNAL_H);
  const px = img.data;
  const depth = new Float32Array(INTERNAL_W);
  const rng = rngOf(7);

  const texCache = new Map<string, Tex>();
  const texFor = (d: Deco | undefined, tx: number, ty: number): Tex => {
    const key = d ? JSON.stringify(d) : `panel${(tx * 7 + ty * 13) & 3}`;
    let t = texCache.get(key);
    if (t) return t;
    let seed = 17;
    for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
    const r = rngOf(seed);
    t = makeTex(WT, (g, e) => {
      switch (d?.kind) {
        case "box": paintBox(g, r, d.variant); break;
        case "cabinet": paintCabinet(g, r); break;
        case "sign": paintSign(g, r, d.text, d.arrow); break;
        case "lamp": paintLamp(g, e, r, d.alive); break;
        case "chalk": paintChalk(g, r, d.arrow); break;
        case "door": paintDoor(g, e, r, 0, 0); break;
        default: steel(g, r, d?.kind === "panel" ? d.variant : (tx * 7 + ty * 13) & 3);
      }
    });
    texCache.set(key, t);
    return t;
  };
  const grating = makeTex(FT, (g) => paintGrating(g, rng));
  const plate = makeTex(FT, (g) => paintPlate(g, rng));
  const ceiling = makeTex(FT, (g) => paintCeiling(g, rng));
  const ceilingCross = makeTex(FT, (g) => paintCeilingCross(g, rng));
  let doorTex: Tex | null = null;
  let doorKey = "";

  const vignette = new Float32Array(INTERNAL_W * INTERNAL_H);
  for (let y = 0; y < INTERNAL_H; y++) for (let x = 0; x < INTERNAL_W; x++) {
    const dx = (x / INTERNAL_W - 0.5) * 2, dy = (y / INTERNAL_H - 0.5) * 2;
    vignette[y * INTERNAL_W + x] = Math.max(0, 1 - (dx * dx + dy * dy) * 0.45);
  }
  const drips = Array.from({ length: 14 }, () => ({ x: rng(), y: rng(), v: 0.4 + rng() * 0.6 }));
  const motes = Array.from({ length: 30 }, () => ({ x: rng(), y: rng(), s: rng() }));
  let lastNow = 0;
  let grid: Grid | null = null;
  let gridFor: Layout | null = null;

  const fract = (v: number): number => v - Math.floor(v);

  function draw(ctx: CanvasRenderingContext2D, state: TunnelState, W: number, H: number, nowMs: number): void {
    const dtS = lastNow ? Math.min(0.1, (nowMs - lastNow) / 1000) : 0;
    lastNow = nowMs;
    if (gridFor !== state.layout) { grid = buildGrid(state.layout); gridFor = state.layout; }
    const g = grid!;
    const seq = doorSequence(state);
    // The door is repainted while it opens (wheel, swing); static otherwise.
    const dk = state.phase === "SURFACE" ? `${(seq.wheel * 60) | 0}/${(seq.swing * 60) | 0}` : "closed";
    if (dk !== doorKey) { doorKey = dk; doorTex = makeTex(WT, (gg, e) => paintDoor(gg, e, rngOf(99), seq.wheel, seq.swing)); }

    const p = transitionProgress(state);
    const pose = cameraPose(state);
    const bob = state.transition ? Math.sin(p * Math.PI) * 0.035 : 0;
    const lit = state.lanternOn;
    const flicker = lit ? 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(nowMs / 41) * Math.sin(nowMs / 97)) : 0;
    const panic = Math.max(0, (state.attention - PANIC_THRESHOLD) / (ATTENTION_CAUGHT - PANIC_THRESHOLD));
    const angle = pose.angle + (panic ? Math.sin(nowMs / 23) * panic * 0.012 : 0);
    const dirX = Math.cos(angle), dirY = Math.sin(angle);
    const tanHalf = Math.tan(FOV / 2);
    const planeX = Math.sin(angle) * tanHalf, planeY = -Math.cos(angle) * tanHalf;
    const horizon = INTERNAL_H / 2 + bob * INTERNAL_H + (panic ? Math.cos(nowMs / 31) * panic * 2 : 0);
    const projH = INTERNAL_H * 0.9;
    const doorC = { x: g.door.tile.x + 0.5, y: g.door.tile.y + 0.5 };
    const doorDist = Math.hypot(doorC.x - pose.x, doorC.y - pose.y);
    const doorGlow = Math.max(0.12, Math.min(1, 1.15 - doorDist / 7)) + seq.wheel * 0.5 + seq.swing;
    const spill = seq.swing * 0.35; // daylight spilling in as the door opens
    const lampFlicker = (h: number): number => {
      const t = nowMs / 1000 + h;
      const f = Math.sin(t * 11) * Math.sin(t * 4.3) * 0.5 + 0.5;
      return (Math.sin(t * 0.7 + h) > -0.6 ? 0.25 + 0.75 * f : 0.05) * 0.9;
    };

    if (state.phase === "CAUGHT") {
      px.fill(0);
      sctx.putImageData(img, 0, 0);
    } else {
      for (let x = 0; x < INTERNAL_W; x++) {
        const cameraX = (2 * x) / INTERNAL_W - 1;
        const rdx = dirX + planeX * cameraX, rdy = dirY + planeY * cameraX;
        // DDA through the grid.
        let mapX = Math.floor(pose.x), mapY = Math.floor(pose.y);
        const deltaX = rdx === 0 ? 1e30 : Math.abs(1 / rdx), deltaY = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
        const stepX = rdx < 0 ? -1 : 1, stepY = rdy < 0 ? -1 : 1;
        let sideX = rdx < 0 ? (pose.x - mapX) * deltaX : (mapX + 1 - pose.x) * deltaX;
        let sideY = rdy < 0 ? (pose.y - mapY) * deltaY : (mapY + 1 - pose.y) * deltaY;
        let side = 0;
        for (let i = 0; i < 64; i++) {
          if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; } else { sideY += deltaY; mapY += stepY; side = 1; }
          if (cellAt(g, mapX, mapY) === SOLID) break;
        }
        const perp = Math.max(0.04, side === 0 ? sideX - deltaX : sideY - deltaY);
        const normal: Heading = side === 0 ? (stepX > 0 ? 3 : 1) : (stepY > 0 ? 2 : 0);
        const u = side === 0
          ? (stepX > 0 ? 1 - fract(pose.y + perp * rdy) : fract(pose.y + perp * rdy))
          : (stepY > 0 ? fract(pose.x + perp * rdx) : 1 - fract(pose.x + perp * rdx));
        const deco = g.deco.get(faceKey(mapX, mapY, normal));
        const tex = deco?.kind === "door" ? doorTex! : texFor(deco, mapX, mapY);
        const rayLen = Math.sqrt(rdx * rdx + rdy * rdy);
        const dist = perp * rayLen;
        depth[x] = perp;
        const h = Math.min(INTERNAL_H * 4, projH / perp);
        const top = horizon - h / 2, bottom = horizon + h / 2;
        // Light: lantern beam (brighter at the centre) with falloff, ambient outline, fog to black.
        const beam = 0.78 + 0.22 * (1 - Math.abs(cameraX));
        const lantern = lit ? flicker * beam * Math.min(1.3, 1.9 / (1 + dist * dist * 0.35)) : 0;
        const ambient = 0.035 + 0.03 / (1 + dist);
        const light = (Math.max(ambient, lantern) + spill) * (side === 1 ? 1 : 0.86);
        const S = tex.size;
        const tu = Math.min(S - 1, (u * S) | 0);
        const emit = tex.emit;
        let eStrength = 0, er = 0, eg = 0, eb = 0;
        if (emit) {
          if (deco?.kind === "door") { eStrength = doorGlow; er = DAYLIGHT[0]; eg = DAYLIGHT[1]; eb = DAYLIGHT[2]; }
          else { eStrength = lampFlicker((mapX * 31 + mapY * 17) % 7); er = LAMP_WARM[0]; eg = LAMP_WARM[1]; eb = LAMP_WARM[2]; }
        }
        const y0 = Math.max(0, top | 0), y1 = Math.min(INTERNAL_H, bottom | 0);
        for (let y = y0; y < y1; y++) {
          const tv = Math.min(S - 1, (((y - top) / h) * S) | 0);
          const k = (tv * S + tu) * 4;
          const i = (y * INTERNAL_W + x) * 4;
          let r = tex.data[k]! * light, gg = tex.data[k + 1]! * light, b = tex.data[k + 2]! * light;
          if (emit) { const e = (emit[k]! / 255) * eStrength; if (e > 0) { r += er * e; gg += eg * e; b += eb * e; } }
          const vg = vignette[i >> 2]!;
          px[i] = r * vg; px[i + 1] = gg * vg; px[i + 2] = b * vg; px[i + 3] = 255;
        }
        // Floor (grating over water) and ceiling (pipes and ducting) for this column.
        for (let y = 0; y < INTERNAL_H; y++) {
          if (y >= y0 && y < y1) continue;
          const below = y > horizon;
          const rowDist = (projH * 0.5) / Math.max(0.5, Math.abs(y - horizon));
          const wx = pose.x + rdx * rowDist, wy = pose.y + rdy * rowDist;
          const tx = Math.floor(wx), ty = Math.floor(wy);
          const axis = axisAt(g, tx, ty);
          const cross = axis === AXIS_CROSS;
          const tex2 = below ? (cross ? plate : grating) : (cross ? ceilingCross : ceiling);
          const fu = axis === AXIS_X ? fract(wy) : fract(wx), fv = axis === AXIS_X ? fract(wx) : fract(wy);
          const k = (((fv * FT) | 0) * FT + ((fu * FT) | 0)) * 4;
          const d2 = rowDist * rayLen;
          const lantern2 = lit ? flicker * beam * Math.min(1.3, 1.9 / (1 + d2 * d2 * 0.35)) : 0;
          const l = (Math.max(0.03, lantern2) + spill) * (below ? 1 : 0.8);
          const i = (y * INTERNAL_W + x) * 4;
          const vg = vignette[i >> 2]!;
          let r = tex2.data[k]! * l, gg = tex2.data[k + 1]! * l, b = tex2.data[k + 2]! * l;
          if (below && lit && tex2.data[k + 2]! > 60 && tex2.data[k]! < 60) { r += 18 * l; gg += 30 * l; b += 48 * l; } // puddle sheen
          px[i] = r * vg; px[i + 1] = gg * vg; px[i + 2] = b * vg; px[i + 3] = 255;
        }
      }
      // Film grain.
      for (let i = 0; i < px.length; i += 16) { const n = (Math.random() - 0.5) * 14; px[i] += n; px[i + 1] += n; px[i + 2] += n; }
      sctx.putImageData(img, 0, 0);

      // Particles in the beam: drips and motes.
      if (lit) {
        sctx.fillStyle = "rgba(200,220,255,0.55)";
        for (const d of drips) { d.y += d.v * dtS * 1.2; if (d.y > 1) { d.y = 0; d.x = rng(); } sctx.fillRect(40 + d.x * 240, d.y * INTERNAL_H, 1, 3); }
        sctx.fillStyle = `rgba(255,230,180,${0.35 * flicker})`;
        for (const m of motes) { m.x += (m.s - 0.5) * dtS * 0.05; m.y += 0.01 * dtS; if (m.y > 1) m.y = 0; sctx.fillRect(60 + m.x * 200, 30 + m.y * 120, 1, 1); }
      }
      // The eyes: blinking, drifting, closer with danger; a silhouette at the beam's edge when high.
      if (eyesVisible(state)) {
        const t = Math.min(1, (state.attention - DETECT_THRESHOLD) / (ATTENTION_CAUGHT - DETECT_THRESHOLD));
        const side = state.creatureSide * (state.eyesTurned && lit ? 0.75 : 1);
        const exGuess = INTERNAL_W / 2 + side * 30;
        const wallAhead = depth[Math.max(0, Math.min(INTERNAL_W - 1, exGuess | 0))]!;
        const d = Math.max(0.9, Math.min(6 - t * 4.5, wallAhead - 0.4));
        const scale = projH / d;
        const ex = INTERNAL_W / 2 + side * scale * 0.22 + Math.sin(nowMs / 900) * 3;
        const ey = horizon - scale * 0.08 + Math.cos(nowMs / 1300) * 2;
        const r = Math.max(1, scale * 0.018 * (1 + t));
        const blink = Math.sin(nowMs / 1500 + state.cell) > 0.96;
        if (!blink) {
          sctx.save();
          sctx.shadowColor = "rgba(255,215,140,0.9)";
          sctx.shadowBlur = 4 + t * 10;
          sctx.fillStyle = `rgba(255,222,150,${0.4 + 0.6 * t})`;
          sctx.beginPath(); sctx.arc(ex - r * 1.6, ey, r, 0, Math.PI * 2); sctx.arc(ex + r * 1.6, ey, r, 0, Math.PI * 2); sctx.fill();
          sctx.restore();
        }
        if (lit && t > 0.55 && Math.sin(nowMs / 150) > 0.9) {
          sctx.fillStyle = "rgba(0,0,0,0.9)";
          sctx.beginPath(); sctx.ellipse(ex, ey + scale * 0.12, scale * 0.06, scale * 0.2, 0, 0, Math.PI * 2); sctx.fill();
        }
      }
      if (panic > 0) {
        const rg = sctx.createRadialGradient(INTERNAL_W / 2, INTERNAL_H / 2, INTERNAL_W * 0.2, INTERNAL_W / 2, INTERNAL_H / 2, INTERNAL_W * 0.6);
        rg.addColorStop(0, "rgba(0,0,0,0)"); rg.addColorStop(1, `rgba(170,20,20,${0.5 * panic * (0.6 + 0.4 * Math.max(0, Math.sin(nowMs / 160)))})`);
        sctx.fillStyle = rg; sctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);
      }
      if (seq.flood > 0) { // daylight floods the screen
        sctx.fillStyle = `rgba(255,248,230,${Math.min(1, seq.flood * 1.1)})`;
        sctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);
      }
    }

    // Scale up with nearest-neighbour into a 16:9 box; darkness beyond.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const vw = Math.min(W, (H * 16) / 9), vh = Math.min(H, (W * 9) / 16);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, (W - vw) / 2, (H - vh) / 2, vw, vh);
    drawHud(ctx, state, W, H, nowMs);
  }

  return { draw, dispose() { small.width = 0; small.height = 0; texCache.clear(); } };
}

function drawHud(ctx: CanvasRenderingContext2D, state: TunnelState, W: number, H: number, nowMs: number): void {
  const m = Math.max(16, Math.min(W, H) * 0.035);
  const fs = Math.max(12, Math.round(Math.min(W, H) * 0.024));
  ctx.textBaseline = "middle";
  if (state.phase === "CAUGHT") {
    if (state.phaseMs > 250) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#ff6b57";
      ctx.font = `bold ${fs * 2.4}px ${FONT}`;
      ctx.fillText("CAUGHT", W / 2, H * 0.44);
      ctx.fillStyle = "#c8e6d0";
      ctx.font = `${fs * 1.1}px ${FONT}`;
      ctx.fillText(state.caughtReason === "light" ? "It followed your light." : "It found you.", W / 2, H * 0.52);
    }
  }
  if (state.phase === "SURFACE") return; // the door sequence is the whole screen
  // Lantern icon (top left).
  const on = state.lanternOn;
  ctx.save();
  if (on) { ctx.shadowColor = "rgba(255,190,100,0.9)"; ctx.shadowBlur = 14 + 4 * Math.sin(nowMs / 90); }
  ctx.fillStyle = on ? "#ffb347" : "rgba(120,130,125,0.6)";
  ctx.beginPath(); ctx.arc(m + fs, m + fs, fs * 0.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = "rgba(184,245,207,0.8)";
  ctx.font = `${fs}px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText(on ? "LANTERN ON" : "LANTERN OFF", m + fs * 2.2, m + fs);
  // Danger meter (top centre).
  const dw = Math.min(W * 0.3, 420), dx = (W - dw) / 2, dy = m;
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(dx, dy, dw, fs * 0.8);
  const a = state.attention / ATTENTION_CAUGHT;
  const g = ctx.createLinearGradient(dx, 0, dx + dw, 0);
  g.addColorStop(0, "#5cff9d"); g.addColorStop(0.5, "#ffb347"); g.addColorStop(1, "#ff3b2e");
  ctx.fillStyle = g;
  ctx.fillRect(dx, dy, dw * a, fs * 0.8);
  if (a > 0.7) { // pulse: it is nearly on you
    ctx.fillStyle = `rgba(255,60,50,${0.25 + 0.25 * Math.sin(nowMs / 90)})`;
    ctx.fillRect(dx - 3, dy - 3, dw + 6, fs * 0.8 + 6);
  }
  ctx.strokeStyle = "rgba(184,245,207,0.5)"; ctx.lineWidth = 1; ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, fs * 0.8 - 1);
  ctx.fillStyle = a > 0.7 ? "#ff6b57" : "rgba(184,245,207,0.8)";
  ctx.font = `bold ${Math.round(fs * 0.85)}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("DANGER", W / 2, dy + fs * 1.7);
  // Surface bar (top right).
  const bw = Math.min(W * 0.2, 300), bx = W - m - bw;
  ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(bx, dy, bw, fs * 0.5);
  ctx.fillStyle = "rgba(255,244,214,0.6)"; ctx.fillRect(bx, dy, bw * Math.min(1, state.cell / state.layout.length), fs * 0.5);
  ctx.fillStyle = "rgba(184,245,207,0.6)"; ctx.font = `${Math.round(fs * 0.8)}px ${FONT}`; ctx.textAlign = "right";
  ctx.fillText("SURFACE", bx + bw, dy + fs * 1.4);
  // Hint / prompt (centred above the labels).
  const promptY = H - m - fs * 3.6;
  const banner = (text: string, color: string) => {
    ctx.font = `bold ${fs * 1.25}px ${FONT}`; ctx.textAlign = "center";
    const w = ctx.measureText(text).width + fs * 2;
    ctx.fillStyle = "rgba(4,10,8,0.75)"; ctx.fillRect(W / 2 - w / 2, promptY - fs, w, fs * 2);
    ctx.strokeStyle = color; ctx.strokeRect(W / 2 - w / 2 + 0.5, promptY - fs + 0.5, w - 1, fs * 2 - 1);
    ctx.fillStyle = color; ctx.fillText(text, W / 2, promptY);
  };
  if (darkHintVisible(state)) banner(DARK_HINT_TEXT, "#ffb347");
  else { const p = tutorialPrompt(state); if (p) banner(PROMPT_TEXT[p], "#c8e6d0"); }
  // Control labels (bottom corners).
  const labels = labelsFor(state);
  const ly = H - m - fs;
  const pill = (text: string, x: number, align: "left" | "right", key: string) => {
    const dim = text === "—" || text === "Too dark";
    ctx.font = `bold ${fs}px ${FONT}`;
    const w = ctx.measureText(text).width + fs * 1.6;
    const pxx = align === "left" ? x : x - w;
    ctx.fillStyle = "rgba(4,10,8,0.7)"; ctx.fillRect(pxx, ly - fs, w, fs * 2);
    ctx.strokeStyle = dim ? "rgba(120,110,80,0.45)" : "rgba(92,255,157,0.5)"; ctx.strokeRect(pxx + 0.5, ly - fs + 0.5, w - 1, fs * 2 - 1);
    ctx.fillStyle = text === "—" ? "rgba(90,100,95,0.7)" : dim ? "rgba(255,179,71,0.75)" : "#c8e6d0"; ctx.textAlign = "center";
    ctx.fillText(text, pxx + w / 2, ly - fs * 0.15);
    ctx.fillStyle = "rgba(184,245,207,0.5)"; ctx.font = `${Math.round(fs * 0.7)}px ${FONT}`;
    ctx.fillText(key, pxx + w / 2, ly + fs * 0.6);
  };
  pill(labels.left, m, "left", "A / LEFT");
  pill(labels.right, W - m, "right", "D / RIGHT");
}
