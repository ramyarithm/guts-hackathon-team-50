/**
 * Dead Line - the tunnel as a tile grid. The run is still a line of cells 0..length, but
 * the line snakes through a 2D grid: every junction is a real T where the corridor ends
 * in a facing wall (the chalk goes there) and opens left and right. The correct branch is
 * the next segment of the path; the wrong one is a short dark stub the player never
 * enters. The raycaster walks this grid; the camera pose comes from the cell index.
 */

/** 0: +y, 1: +x, 2: -y, 3: -x. */
export type Heading = 0 | 1 | 2 | 3;
export const DIRS: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 0], [0, -1], [-1, 0]];
/** World angle (radians, y up) for each heading. */
export const HEADING_ANGLE: ReadonlyArray<number> = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];
export const turnLeft = (h: Heading): Heading => (((h + 3) % 4) as Heading);
export const turnRight = (h: Heading): Heading => (((h + 1) % 4) as Heading);
export const opposite = (h: Heading): Heading => (((h + 2) % 4) as Heading);

export interface Tile { x: number; y: number }
export interface Junction { cell: number; correct: "LEFT" | "RIGHT" }

export interface Layout {
  length: number;
  junctions: Junction[];
  /** Corridor tiles 0..length-1; path[length] is the door tile (solid). */
  path: Tile[];
  /** Heading leaving each cell 0..length-1 (the last one faces the door). */
  headings: Heading[];
  /** Wrong-branch tiles per junction, in order from the junction outward. */
  stubs: Tile[][];
}

/** How far the wrong branch is carved before it ends in a wall. */
export const STUB_DEPTH = 3;
/** The final step is short: how far past the last tile centre the player stands at the door. */
export const DOOR_STAND = 0.05;

export const tileKey = (t: Tile): string => `${t.x},${t.y}`;
const add = (t: Tile, h: Heading, k = 1): Tile => ({ x: t.x + DIRS[h]![0] * k, y: t.y + DIRS[h]![1] * k });

/** Every walkable tile: the path cells and the stubs. */
export function carvedTiles(l: Layout): Tile[] {
  return [...l.path.slice(0, l.length), ...l.stubs.flat()];
}

/**
 * Lay the path through the grid. Returns null when it would cross or touch itself (an
 * opening that is not a junction), so the generator can re-roll the branch directions.
 */
export function buildGeometry(length: number, junctions: Junction[]): Layout | null {
  let h: Heading = 0;
  let p: Tile = { x: 0, y: 0 };
  const path: Tile[] = [p];
  const headings: Heading[] = [];
  const stubs: Tile[][] = [];
  const links = new Set<string>();
  const link = (a: Tile, b: Tile): void => { links.add(`${tileKey(a)}|${tileKey(b)}`); links.add(`${tileKey(b)}|${tileKey(a)}`); };
  for (let i = 0; i < length; i++) {
    const j = junctions.find((x) => x.cell === i);
    if (j && i > 0) {
      const hin: Heading = h;
      h = j.correct === "LEFT" ? turnLeft(hin) : turnRight(hin);
      const wrong = j.correct === "LEFT" ? turnRight(hin) : turnLeft(hin);
      const stub: Tile[] = [];
      for (let k = 1; k <= STUB_DEPTH; k++) stub.push(add(p, wrong, k));
      link(p, stub[0]!);
      for (let k = 1; k < stub.length; k++) link(stub[k - 1]!, stub[k]!);
      stubs.push(stub);
    }
    headings.push(h);
    const next = add(p, h);
    link(p, next);
    path.push(next);
    p = next;
  }
  const layout: Layout = { length, junctions, path, headings, stubs };
  const carved = carvedTiles(layout);
  const keys = new Set(carved.map(tileKey));
  if (keys.size !== carved.length) return null;
  const door = path[length]!;
  if (keys.has(tileKey(door))) return null;
  // No two walkable tiles may touch unless the path or a stub links them: anything else
  // would be an opening in a wall that is not a junction.
  for (const t of carved) {
    for (let d = 0; d < 4; d++) {
      const n = add(t, d as Heading);
      if (keys.has(tileKey(n)) && !links.has(`${tileKey(t)}|${tileKey(n)}`)) return null;
    }
  }
  // The door must only be reachable from the last corridor tile.
  for (let d = 0; d < 4; d++) {
    const n = add(door, d as Heading);
    if (keys.has(tileKey(n)) && tileKey(n) !== tileKey(path[length - 1]!)) return null;
  }
  return layout;
}

/** Heading the player faces when standing in `cell` (after any turn there). */
export function headingAt(l: Layout, cell: number): Heading {
  return l.headings[Math.max(0, Math.min(l.length - 1, cell))]!;
}

/** Camera position for a cell: the tile centre, or the standing spot just short of the door. */
export function posAt(l: Layout, cell: number): { x: number; y: number } {
  if (cell >= l.length) {
    const last = l.path[l.length - 1]!;
    const h = l.headings[l.length - 1]!;
    return { x: last.x + 0.5 + DIRS[h]![0] * DOOR_STAND, y: last.y + 0.5 + DIRS[h]![1] * DOOR_STAND };
  }
  const t = l.path[Math.max(0, cell)]!;
  return { x: t.x + 0.5, y: t.y + 0.5 };
}

// ---- Grid for the raycaster -------------------------------------------------------------

export const SOLID = 0;
export const CORRIDOR = 1;
export const STUB = 2;

/** Which way a walkable tile runs, for floor and ceiling detail. */
export const AXIS_Y = 0;
export const AXIS_X = 1;
export const AXIS_CROSS = 2;

export type Deco =
  | { kind: "panel"; variant: number }
  | { kind: "box"; variant: number }
  | { kind: "cabinet" }
  | { kind: "sign"; text: number; arrow: -1 | 0 | 1 }
  | { kind: "lamp"; alive: boolean }
  | { kind: "chalk"; arrow: -1 | 1 }
  | { kind: "door" };

export interface Grid {
  x0: number;
  y0: number;
  w: number;
  h: number;
  /** SOLID / CORRIDOR / STUB per tile. */
  cells: Uint8Array;
  /** AXIS_* per tile (only meaningful for walkable tiles). */
  axis: Uint8Array;
  /** Decoration per wall face, keyed by faceKey(tile, normal heading). */
  deco: Map<number, Deco>;
  /** Door tile and the heading of its visible face's normal (pointing back down the corridor). */
  door: { tile: Tile; normal: Heading };
}

export function faceKey(x: number, y: number, normal: Heading): number {
  return ((y + 128) * 512 + (x + 128)) * 4 + normal;
}

export function cellAt(g: Grid, x: number, y: number): number {
  const gx = x - g.x0, gy = y - g.y0;
  if (gx < 0 || gy < 0 || gx >= g.w || gy >= g.h) return SOLID;
  return g.cells[gy * g.w + gx]!;
}
export function axisAt(g: Grid, x: number, y: number): number {
  const gx = x - g.x0, gy = y - g.y0;
  if (gx < 0 || gy < 0 || gx >= g.w || gy >= g.h) return AXIS_Y;
  return g.axis[gy * g.w + gx]!;
}

function hash(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Number of stencil texts the renderer provides (indices used by sign decos). */
export const SIGN_COUNT = 5;

/**
 * Build the grid: carve the path and stubs, mark each tile's axis and assign a decoration
 * to every wall face a player can see. Deterministic for a layout.
 */
export function buildGrid(l: Layout): Grid {
  const carved = carvedTiles(l);
  const all = [...carved, l.path[l.length]!];
  const margin = 2;
  const x0 = Math.min(...all.map((t) => t.x)) - margin;
  const y0 = Math.min(...all.map((t) => t.y)) - margin;
  const w = Math.max(...all.map((t) => t.x)) + margin + 1 - x0;
  const h = Math.max(...all.map((t) => t.y)) + margin + 1 - y0;
  const cells = new Uint8Array(w * h);
  const axis = new Uint8Array(w * h);
  const idx = (t: Tile): number => (t.y - y0) * w + (t.x - x0);
  const junctionCells = new Set(l.junctions.map((j) => j.cell));
  for (let i = 0; i < l.length; i++) {
    const t = l.path[i]!;
    cells[idx(t)] = CORRIDOR;
    axis[idx(t)] = junctionCells.has(i) ? AXIS_CROSS : (l.headings[i]! % 2 === 0 ? AXIS_Y : AXIS_X);
  }
  l.stubs.forEach((stub, si) => {
    const j = l.junctions[si]!;
    const hin = l.headings[j.cell - 1]!;
    const wrong = j.correct === "LEFT" ? turnRight(hin) : turnLeft(hin);
    for (const t of stub) { cells[idx(t)] = STUB; axis[idx(t)] = wrong % 2 === 0 ? AXIS_Y : AXIS_X; }
  });

  const deco = new Map<number, Deco>();
  const solid = (t: Tile): boolean => cells[idx(t)] === SOLID;
  // Lamps: every few cells on alternating sides; two of them are still alive, far down the run.
  const lampCells: number[] = [];
  for (let i = 1; i < l.length; i++) if (i % 4 === 1 && !junctionCells.has(i)) lampCells.push(i);
  const alive = new Set<number>([lampCells[lampCells.length - 1] ?? -1, lampCells[Math.floor(lampCells.length / 2)] ?? -1]);
  for (let i = 0; i < l.length; i++) {
    const t = l.path[i]!;
    const hd = l.headings[i]!;
    const sides: Array<[Heading, number]> = [[turnLeft(hd), 0], [turnRight(hd), 1]];
    for (const [side, sideIdx] of sides) {
      const wall = add(t, side);
      if (!solid(wall)) continue;
      const normal = opposite(side); // points from the wall back into the corridor
      const key = faceKey(wall.x, wall.y, normal);
      if (deco.has(key)) continue;
      const r = hash(wall.x, wall.y, normal);
      // Arrows on signs point the way the corridor runs: +1 when that is screen-right.
      const sr = [-DIRS[normal]![1], DIRS[normal]![0]]; // screen-right when facing this wall
      const along = DIRS[hd]![0] * sr[0]! + DIRS[hd]![1] * sr[1]!;
      const arrow: -1 | 0 | 1 = along > 0 ? 1 : along < 0 ? -1 : 0;
      let d: Deco;
      if (lampCells.includes(i) && sideIdx === (i >> 2) % 2) d = { kind: "lamp", alive: alive.has(i) };
      else if (i % 5 === 3 && sideIdx === 1) d = { kind: "sign", text: (r >>> 3) % SIGN_COUNT, arrow };
      else if (i % 7 === 2 && sideIdx === 0) d = { kind: "cabinet" };
      else if ((r & 7) < 2) d = { kind: "box", variant: (r >>> 4) & 3 };
      else if ((r & 15) === 2) d = { kind: "sign", text: (r >>> 3) % SIGN_COUNT, arrow };
      else d = { kind: "panel", variant: (r >>> 5) & 3 };
      deco.set(key, d);
    }
  }
  // Chalk on the wall facing the player at every junction, pointing down the correct branch.
  for (const j of l.junctions) {
    const p = l.path[j.cell]!;
    const hin = l.headings[j.cell - 1]!;
    const wall = add(p, hin);
    deco.set(faceKey(wall.x, wall.y, opposite(hin)), { kind: "chalk", arrow: j.correct === "LEFT" ? -1 : 1 });
  }
  // The door at the end of the last segment.
  const doorTile = l.path[l.length]!;
  const doorNormal = opposite(l.headings[l.length - 1]!);
  deco.set(faceKey(doorTile.x, doorTile.y, doorNormal), { kind: "door" });
  return { x0, y0, w, h, cells, axis, deco, door: { tile: doorTile, normal: doorNormal } };
}
