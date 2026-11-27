// The floating island under the town: one big inverted rock mass (earth + grass lip over layered
// strata, tapering crags, hanging roots and vines, moss tufts), a handful of small floating rocks and
// the waterfalls that spill off the rim. Pure geometry (three.js only, no React), so it is testable.
// Everything is vertex-coloured and flat-shaded; the rock mass is ONE mesh, the floating rocks ONE
// geometry (instanced), the falls + mist ONE mesh.
import * as THREE from "three";
import { GATE_ANGLES, WALL } from "../zones";

const TAU = Math.PI * 2;
const SEG = 72;
/** Outer edge of the grass lip, a metre beyond the wall. */
export const RIM_R = WALL.outer + 1;
/** Height of the top surface of the rock mass: 6 cm under the town disc (y = 0), so they never z-fight. */
export const TOP_Y = -0.06;
/** Bottom tip of the rock mass. */
export const TIP_Y = -36;
/** Where the cloud sea starts (world y): a little under the tip. Sky.tsx uses the same number. */
export const CLOUD_Y = -40;

const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Smooth periodic noise around the circle: `freq` lumps, 0..1. */
function pnoise(th: number, freq: number, seed = 0) {
  const x = (((th / TAU) % 1) + 1) % 1 * freq;
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i % freq, seed) * (1 - u) + hash((i + 1) % freq, seed) * u;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type V = [number, number, number];
const C = (h: string) => new THREE.Color(h);

// --- Mesh accumulator (non-indexed, flat shaded) -----------------------------------------------------

class Acc {
  pos: number[] = [];
  col: number[] = [];
  tri(a: V, b: V, c: V, ca: THREE.Color, cb: THREE.Color = ca, cc: THREE.Color = ca) {
    this.pos.push(...a, ...b, ...c);
    this.col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
  }
  quad(a: V, b: V, c: V, d: V, ca: THREE.Color, cb: THREE.Color = ca, cc: THREE.Color = ca, cd: THREE.Color = ca) {
    this.tri(a, b, c, ca, cb, cc);
    this.tri(a, c, d, ca, cc, cd);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// --- Palette -------------------------------------------------------------------------------------------

const GRASS = [C("#6d8a3c"), C("#5d7b35"), C("#7c9445"), C("#52702f")];
const EARTH = [C("#5a3f2e"), C("#6b4a34")];
const STRATA = [C("#8d6f52"), C("#74695d"), C("#8a6a4a"), C("#665c52"), C("#977a5a")];
const DEEP = C("#4a423e");
const ROOT = C("#43301f");
const VINE = C("#4d7337");
const LEAF = [C("#5f8a3a"), C("#46702f"), C("#7a9a42")];
const _c = new THREE.Color();

// --- The rock mass --------------------------------------------------------------------------------------

/** Rows from the grass lip down to the tip (world y). */
const ROWS = [-0.06, -0.4, -1.1, -2.4, -3.3, -4.2, -5.6, -7, -8.5, -10, -12, -14, -16, -18, -20, -22, -24, -26, -28, -30, -32, -33.5, -35, TIP_Y];
/** Base radius at a few heights; linear in between. */
const PROFILE: [number, number][] = [
  [TOP_Y, RIM_R],
  [-0.4, RIM_R + 0.3],
  [-1.1, RIM_R - 0.05],
  [-2.4, RIM_R - 1],
  [-4.2, 26.6],
  [-7, 24.6],
  [-10, 21.8],
  [-14, 18],
  [-18, 14.2],
  [-22, 10.6],
  [-26, 7.2],
  [-30, 3.9],
  [-33.5, 1.5],
  [TIP_Y, 0],
];

function profileR(y: number) {
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [y0, r0] = PROFILE[i];
    const [y1, r1] = PROFILE[i + 1];
    if (y <= y0 && y >= y1) return lerp(r0, r1, (y0 - y) / (y0 - y1));
  }
  return y > TOP_Y ? RIM_R : 0;
}

/** Radius of the rock mass at angle `th` and height `y` (0 = +z, clockwise from above). */
export function islandRadius(th: number, y: number) {
  const depth = smooth(-1.6, -30, y);
  const amp = 0.36 * depth;
  const n = (pnoise(th, 5, 1) - 0.5) * 0.9 + (pnoise(th, 12, 2) - 0.5) * 0.55 + (pnoise(th, 29, 3) - 0.5) * 0.3;
  const ledge = Math.sin(y * 1.35 + pnoise(th, 7, 4) * 6) * 0.05 * depth;
  return profileR(y) * (1 + amp * n + ledge);
}

const surf = (th: number, y: number, extra = 0): V => {
  const r = islandRadius(th, y) + extra;
  return [Math.sin(th) * r, y, Math.cos(th) * r];
};

/** Strata colour at (th, y): grass lip, earth band, then alternating warm / grey rock bands. */
function rockColor(th: number, y: number, out: THREE.Color) {
  const j = hash(Math.round(th * 40), Math.round(-y * 3)) * 0.12;
  if (y > -0.3) return out.copy(GRASS[Math.floor(hash(th * 9, 3) * GRASS.length)]).multiplyScalar(0.9 + j);
  if (y > -2.7) return out.copy(EARTH[Math.floor(hash(th * 7, y) * EARTH.length)]).multiplyScalar(0.85 + j);
  const band = -y + (pnoise(th, 9, 6) - 0.5) * 2.4 + Math.sin(th * 3) * 0.4;
  out.copy(STRATA[((Math.floor(band / 2.8) % STRATA.length) + STRATA.length) % STRATA.length]);
  // cooler and darker with depth, darkest crevices near the tip
  out.lerp(DEEP, smooth(-8, -36, y) * 0.75);
  return out.multiplyScalar(0.85 + j);
}

function addRockMass(acc: Acc) {
  // top surface: a grass annulus from under the wall out to the lip (the town disc covers the inside)
  const rin = WALL.inner - 0.6;
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * TAU;
    const a1 = ((i + 1) / SEG) * TAU;
    const g = GRASS[i % GRASS.length];
    acc.quad(
      [Math.sin(a0) * rin, TOP_Y, Math.cos(a0) * rin],
      [Math.sin(a1) * rin, TOP_Y, Math.cos(a1) * rin],
      [Math.sin(a1) * RIM_R, TOP_Y, Math.cos(a1) * RIM_R],
      [Math.sin(a0) * RIM_R, TOP_Y, Math.cos(a0) * RIM_R],
      g,
    );
  }
  // the flank: ring by ring down to the tip
  const cols = new THREE.Color();
  const ring = (k: number, i: number): [V, THREE.Color] => {
    const th = ((i % SEG) / SEG) * TAU;
    const y = ROWS[k];
    return [surf(th, y), rockColor(th, y, cols).clone()];
  };
  for (let k = 0; k < ROWS.length - 1; k++) {
    for (let i = 0; i < SEG; i++) {
      const [a, ca] = ring(k, i);
      const [b, cb] = ring(k, i + 1);
      const [c, cc] = ring(k + 1, i + 1);
      const [d, cd] = ring(k + 1, i);
      acc.quad(a, d, c, b, ca, cd, cc, cb);
    }
  }
}

/** A cone / crag: base ring at (cx, cy, cz), apex at base + (ax, -len, az). */
function addCone(acc: Acc, cx: number, cy: number, cz: number, rad: number, len: number, sides: number, up: boolean, c0: THREE.Color, c1: THREE.Color, ax = 0, az = 0, jitter = 0.25, seed = 0) {
  const dir = up ? 1 : -1;
  const tip: V = [cx + ax, cy + dir * len, cz + az];
  const midY = cy + dir * len * 0.45;
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * TAU;
    const a1 = ((i + 1) / sides) * TAU;
    const j0 = 1 - jitter * hash(i, seed);
    const j1 = 1 - jitter * hash(i + 1, seed);
    const b0: V = [cx + Math.sin(a0) * rad, cy, cz + Math.cos(a0) * rad];
    const b1: V = [cx + Math.sin(a1) * rad, cy, cz + Math.cos(a1) * rad];
    const m0: V = [cx + ax * 0.45 + Math.sin(a0) * rad * 0.62 * j0, midY, cz + az * 0.45 + Math.cos(a0) * rad * 0.62 * j0];
    const m1: V = [cx + ax * 0.45 + Math.sin(a1) * rad * 0.62 * j1, midY, cz + az * 0.45 + Math.cos(a1) * rad * 0.62 * j1];
    acc.quad(b0, b1, m1, m0, c0, c0, c1, c1);
    acc.tri(m0, m1, tip, c1, c1, c1);
  }
}

/** Stalactite crags hanging from the flank. */
function addCrags(acc: Acc) {
  for (let i = 0; i < 14; i++) {
    const th = hash(i, 41) * TAU;
    const y0 = -5 - hash(i, 42) * 16;
    const r = islandRadius(th, y0) * 0.9;
    const len = 3 + hash(i, 43) * 5;
    const rad = 0.9 + hash(i, 44) * 1.3;
    rockColor(th, y0, _c);
    const c0 = _c.clone();
    const c1 = _c.clone().lerp(DEEP, 0.55);
    addCone(acc, Math.sin(th) * r, y0, Math.cos(th) * r, rad, len, 6, false, c0, c1, -Math.sin(th) * 0.5, -Math.cos(th) * 0.5, 0.3, i);
  }
}

/** A root or vine hanging from the rim, hugging the flank (3-sided tapered prism). */
function addRoot(acc: Acc, th: number, y0: number, len: number, vine: boolean, seed: number) {
  const N = 4;
  const col = vine ? VINE : ROOT;
  const nodes: V[][] = [];
  for (let k = 0; k <= N; k++) {
    const y = y0 - (len * k) / N;
    const sway = Math.sin(k * 1.7 + seed * 3.1) * 0.18;
    const w = (vine ? 0.07 : 0.11) * (1 - k / N) + 0.012;
    const p = surf(th + sway / 28, y, 0.1 + 0.05 * k);
    const ring: V[] = [];
    for (let s = 0; s < 3; s++) {
      const a = (s / 3) * TAU + seed;
      ring.push([p[0] + Math.sin(a) * w, p[1], p[2] + Math.cos(a) * w]);
    }
    nodes.push(ring);
  }
  for (let k = 0; k < N; k++) {
    const c = col.clone().multiplyScalar(0.8 + 0.4 * hash(seed, k));
    for (let s = 0; s < 3; s++) acc.quad(nodes[k][s], nodes[k][(s + 1) % 3], nodes[k + 1][(s + 1) % 3], nodes[k + 1][s], c);
  }
  if (vine) {
    for (let k = 1; k < N; k++) {
      const p = nodes[k][0];
      const l = LEAF[(seed + k) % LEAF.length];
      const sd = (seed + k) % 2 ? 1 : -1;
      acc.tri([p[0], p[1], p[2]], [p[0] + 0.3 * sd, p[1] - 0.15, p[2] + 0.1], [p[0] + 0.1 * sd, p[1] - 0.4, p[2] - 0.1], l);
    }
  }
}

/** A tuft of three grass blades. */
function addTuft(acc: Acc, x: number, y: number, z: number, s: number, seed: number) {
  for (let b = 0; b < 3; b++) {
    const a = hash(seed, b) * TAU;
    const lean = 0.35 * s;
    const bx = Math.sin(a) * 0.12 * s;
    const bz = Math.cos(a) * 0.12 * s;
    const col = GRASS[(seed + b) % GRASS.length];
    acc.tri([x + bx - 0.05 * s, y, z + bz], [x + bx + 0.05 * s, y, z + bz], [x + bx + Math.sin(a) * lean, y + 0.55 * s, z + bz + Math.cos(a) * lean], col.clone().multiplyScalar(0.8), col.clone().multiplyScalar(0.8), col.clone().multiplyScalar(1.2));
  }
}

/** Where the waterfalls leave the rim (angles, radians). Roots keep clear of them. */
export const FALL_ANGLES = [0.62, 2.45, 4.2];
const gateNear = (th: number, tol: number) => GATE_ANGLES.some((g) => Math.abs(Math.atan2(Math.sin(th - g), Math.cos(th - g))) < tol);
const fallNear = (th: number, tol: number) => FALL_ANGLES.some((g) => Math.abs(Math.atan2(Math.sin(th - g), Math.cos(th - g))) < tol);

export function buildIslandGeometry() {
  const acc = new Acc();
  addRockMass(acc);
  addCrags(acc);
  // roots + vines along the lip
  for (let i = 0; i < 38; i++) {
    const th = ((i + hash(i, 5) * 0.8) / 38) * TAU;
    if (fallNear(th, 0.1)) continue;
    const vine = i % 3 === 0;
    addRoot(acc, th, -1.0 - hash(i, 6) * 0.5, (vine ? 4 : 2.5) + hash(i, 7) * 4.5, vine, i);
  }
  // grass tufts on the lip (outside the wall, keeping the gates clear) and on the ledges below it
  for (let i = 0; i < 90; i++) {
    const th = hash(i, 11) * TAU;
    if (gateNear(th, 0.07)) continue;
    const r = WALL.outer + 0.35 + hash(i, 12) * (RIM_R - WALL.outer - 0.55);
    addTuft(acc, Math.sin(th) * r, TOP_Y, Math.cos(th) * r, 0.8 + hash(i, 13) * 0.9, i);
  }
  for (let i = 0; i < 36; i++) {
    const th = hash(i, 21) * TAU;
    const y = -2.8 - hash(i, 22) * 9;
    const p = surf(th, y, 0.05);
    addTuft(acc, p[0], p[1], p[2], 0.9 + hash(i, 23) * 0.7, i + 100);
  }
  return acc.geometry();
}

// --- Floating rocks -------------------------------------------------------------------------------------

/** One small floating rock (unit scale: radius ~1, depth ~1.9) with a little tree on top. Instanced. */
export function buildFloatRockGeometry() {
  const acc = new Acc();
  const rows: [number, number][] = [
    [0, 1],
    [-0.22, 1.05],
    [-0.6, 0.86],
    [-1.05, 0.58],
    [-1.5, 0.3],
    [-1.9, 0],
  ];
  const S = 10;
  const pt = (k: number, i: number): [V, THREE.Color] => {
    const th = ((i % S) / S) * TAU;
    const [y, r0] = rows[k];
    const r = r0 * (0.85 + 0.3 * hash(i % S, k + 3));
    const c = k === 0 ? GRASS[i % GRASS.length].clone() : k === 1 ? EARTH[i % 2].clone() : STRATA[(k + i) % STRATA.length].clone().lerp(DEEP, k * 0.12);
    return [[Math.sin(th) * r, y, Math.cos(th) * r], c];
  };
  for (let k = 0; k < rows.length - 1; k++) {
    for (let i = 0; i < S; i++) {
      const [a, ca] = pt(k, i);
      const [b, cb] = pt(k, i + 1);
      const [c, cc] = pt(k + 1, i + 1);
      const [d, cd] = pt(k + 1, i);
      acc.quad(a, d, c, b, ca, cd, cc, cb);
    }
  }
  // grass top
  for (let i = 0; i < S; i++) {
    const [a] = pt(0, i);
    const [b] = pt(0, i + 1);
    acc.tri([0, 0.02, 0], [a[0], 0.02, a[2]], [b[0], 0.02, b[2]], GRASS[i % GRASS.length]);
  }
  // placeholder tree: trunk + two stacked cones, and a couple of tufts
  addCone(acc, 0.1, 0, 0, 0.07, 0.5, 4, true, ROOT, ROOT, 0, 0, 0, 1);
  addCone(acc, 0.1, 0.35, 0, 0.42, 0.7, 7, true, LEAF[1], LEAF[0], 0, 0, 0.1, 2);
  addCone(acc, 0.1, 0.75, 0, 0.3, 0.6, 7, true, LEAF[1], LEAF[2], 0, 0, 0.1, 3);
  addTuft(acc, -0.55, 0.02, 0.3, 0.8, 7);
  addTuft(acc, 0.5, 0.02, -0.5, 0.7, 9);
  return acc.geometry();
}

/** Floating rock placements: [x, y, z, scale, yaw]. Clear of the island, the camera's south side and the sky dome. */
export const FLOAT_ROCKS: [number, number, number, number, number][] = [
  [-41, 5, -22, 3.2, 0.4],
  [47, -5, -12, 4.6, 2.1],
  [31, 13, -49, 2.6, 4.0],
  [-54, -11, 10, 3.6, 5.2],
  [6, -15, -60, 5.2, 1.0],
  [-44, 2, 36, 2.8, 3.1],
  [52, 8, 30, 3.4, 5.8],
];

// --- Waterfalls + mist ----------------------------------------------------------------------------------

/** Thin falls that leave the rim, drop clear of the rock and dissolve into mist. */
export function buildFallGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const kind: number[] = [];
  const size: number[] = [];
  const idx: number[] = [];
  const N = 16;
  const LEN = 25;
  for (const th of FALL_ANGLES) {
    const s = Math.sin(th);
    const c = Math.cos(th);
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const v = i / N;
      const dv = Math.pow(v, 1.5);
      const y = TOP_Y + 0.05 - dv * LEN;
      const r = RIM_R - 0.9 + smooth(0, 0.16, v) * 1.7;
      const w = 3.0 * (1 + 0.6 * v);
      for (let j = 0; j < 2; j++) {
        const off = (j - 0.5) * w;
        pos.push(s * r + c * off, y, c * r - s * off);
        uv.push(j, v);
        kind.push(0);
        size.push(0);
      }
    }
    for (let i = 0; i < N; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    // mist where the fall ends
    const rr = RIM_R + 0.8;
    const cy = TOP_Y - LEN - 0.5;
    for (const [dy, sz, dr] of [[0, 11, 0], [-3, 16, 1.5], [2.2, 8, -0.8]] as const) {
      const b = pos.length / 3;
      for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pos.push(s * (rr + dr), cy + dy, c * (rr + dr));
        uv.push(cx, cz);
        kind.push(1);
        size.push(sz);
      }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aUv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aKind", new THREE.Float32BufferAttribute(kind, 1));
  g.setAttribute("aSize", new THREE.Float32BufferAttribute(size, 1));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -12, 0), 45);
  return g;
}
