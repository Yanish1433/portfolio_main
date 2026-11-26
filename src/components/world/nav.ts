// Grid navigation + collision. Pure functions, no three.js.
// - blockedAt(): precise analytic collision (used while walking with keys/joystick)
// - findPath(): A* over a 0.5 m grid (cells inflated by avatar radius), then string-pulled
import { ISLAND_RADIUS, STATIC_OBSTACLES, zones, type Obstacle } from "./zones";
import { HALL_OBSTACLES } from "./halls/layout";
import type { Vec2 } from "@/store/world";

export const AVATAR_RADIUS = 0.45;
const CELL = 0.5;
const HALF = 24; // grid covers [-24, 24]
const N = (HALF * 2) / CELL; // 96
const EDGE_MARGIN = 0.9;

// Project stands, plaques, easels and the bookshelf are laid out from profile.ts (halls/layout.ts),
// at module load, so the grid below always matches what is drawn.
const obstacles: Obstacle[] = [...zones.flatMap((z) => z.obstacles), ...STATIC_OBSTACLES, ...HALL_OBSTACLES];

/** True if a circle of radius `pad` at (x,z) overlaps an obstacle or leaves the island. */
export function blockedAt(x: number, z: number, pad = AVATAR_RADIUS): boolean {
  if (Math.hypot(x, z) > ISLAND_RADIUS - EDGE_MARGIN) return true;
  for (const o of obstacles) {
    if (o.kind === "circle") {
      if (Math.hypot(x - o.x, z - o.z) < o.r + pad) return true;
    } else if (Math.abs(x - o.x) < o.w / 2 + pad && Math.abs(z - o.z) < o.d / 2 + pad) {
      return true;
    }
  }
  return false;
}

const cellCentre = (i: number) => -HALF + (i + 0.5) * CELL;
const toCell = (v: number) => Math.min(N - 1, Math.max(0, Math.floor((v + HALF) / CELL)));

const blocked = new Uint8Array(N * N);
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    blocked[j * N + i] = blockedAt(cellCentre(i), cellCentre(j), AVATAR_RADIUS + 0.12) ? 1 : 0;
  }
}

/** Nearest unblocked cell to (x,z), by expanding square rings. */
function nearestFree(x: number, z: number): [number, number] | null {
  const ci = toCell(x);
  const cj = toCell(z);
  if (!blocked[cj * N + ci]) return [ci, cj];
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (let r = 1; r < N; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= N || j >= N || blocked[j * N + i]) continue;
        const d = Math.hypot(cellCentre(i) - x, cellCentre(j) - z);
        if (d < bestD) {
          bestD = d;
          best = [i, j];
        }
      }
    }
    // Check one extra ring so a diagonal-closer cell isn't missed.
    if (best && r >= Math.ceil(bestD / CELL) - 0) return best;
  }
  return best;
}

/** Move with axis-separated sliding. */
export function resolveMove(x: number, z: number, dx: number, dz: number): Vec2 {
  if (!blockedAt(x + dx, z + dz)) return [x + dx, z + dz];
  if (!blockedAt(x + dx, z)) return [x + dx, z];
  if (!blockedAt(x, z + dz)) return [x, z + dz];
  return [x, z];
}

function lineFree(a: Vec2, b: Vec2): boolean {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(len / 0.1));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    // small extra margin so smoothed paths never graze a corner between samples
    if (blockedAt(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, AVATAR_RADIUS + 0.08)) return false;
  }
  return true;
}

class MinHeap {
  private items: number[] = [];
  constructor(private score: Float32Array) {}
  get size() {
    return this.items.length;
  }
  push(v: number) {
    const a = this.items;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.score[a[p]] <= this.score[a[i]]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.score[a[l]] < this.score[a[m]]) m = l;
        if (r < a.length && this.score[a[r]] < this.score[a[m]]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const NEIGHBOURS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * Path from `from` to `to` around obstacles. Returns waypoints starting at `from`
 * and ending at `to` (or the nearest walkable point if `to` is blocked), or null.
 */
export function findPath(from: Vec2, to: Vec2): Vec2[] | null {
  const s = nearestFree(from[0], from[1]);
  const g = nearestFree(to[0], to[1]);
  if (!s || !g) return null;
  const goal: Vec2 = blockedAt(to[0], to[1]) ? [cellCentre(g[0]), cellCentre(g[1])] : to;

  // Straight line is free: no search needed.
  if (lineFree(from, goal)) return [from, goal];

  const start = s[1] * N + s[0];
  const end = g[1] * N + g[0];
  const gScore = new Float32Array(N * N).fill(Infinity);
  const fScore = new Float32Array(N * N).fill(Infinity);
  const came = new Int32Array(N * N).fill(-1);
  const closed = new Uint8Array(N * N);
  const open = new MinHeap(fScore);
  const h = (idx: number) => Math.hypot((idx % N) - g[0], Math.floor(idx / N) - g[1]);
  gScore[start] = 0;
  fScore[start] = h(start);
  open.push(start);

  let found = false;
  while (open.size) {
    const cur = open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === end) {
      found = true;
      break;
    }
    const ci = cur % N;
    const cj = (cur - ci) / N;
    for (const [di, dj, cost] of NEIGHBOURS) {
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const ni = j * N + i;
      if (blocked[ni] || closed[ni]) continue;
      // no corner cutting on diagonals
      if (di !== 0 && dj !== 0 && (blocked[cj * N + i] || blocked[j * N + ci])) continue;
      const tentative = gScore[cur] + cost;
      if (tentative < gScore[ni]) {
        gScore[ni] = tentative;
        fScore[ni] = tentative + h(ni);
        came[ni] = cur;
        open.push(ni);
      }
    }
  }
  if (!found) return null;

  const cells: Vec2[] = [];
  for (let c = end; c !== -1; c = came[c]) {
    cells.push([cellCentre(c % N), cellCentre(Math.floor(c / N))]);
  }
  cells.reverse();
  const raw: Vec2[] = [from, ...cells.slice(1, -1), goal];

  // String-pull: from each anchor jump to the furthest point with clear line of sight.
  const out: Vec2[] = [raw[0]];
  let anchor = 0;
  while (anchor < raw.length - 1) {
    let next = anchor + 1;
    for (let k = raw.length - 1; k > anchor + 1; k--) {
      if (lineFree(raw[anchor], raw[k])) {
        next = k;
        break;
      }
    }
    out.push(raw[next]);
    anchor = next;
  }
  return out;
}
