// The floating island under the town: one big inverted rock mass (an eroded "root" of layered strata
// with ledges, overhangs, cracks, hanging spurs, moss, roots and vines), a handful of small floating
// rocks and the waterfalls that spill off the rim. Pure geometry (three.js only, no React), so it is
// testable and deterministic (seeded hashes only, no Math.random).
// The rock mass is ONE mesh (smooth normals + baked AO in vertex colour), the floating rocks ONE
// geometry (instanced), the falls + spray + mist ONE mesh.
import * as THREE from "three";
import { GATE_ANGLES, WALL } from "../zones";

const TAU = Math.PI * 2;
const SEG = 96;
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
/** 2D value noise, periodic around the circle (`fx` lumps) and free along `yy`. 0..1. */
function pn2(th: number, yy: number, fx: number, seed = 0) {
  const x = (((th / TAU) % 1) + 1) % 1 * fx;
  const i = Math.floor(x);
  const fi = x - i;
  const j = Math.floor(yy);
  const fj = yy - j;
  const u = fi * fi * (3 - 2 * fi);
  const w = fj * fj * (3 - 2 * fj);
  const L = (a: number, b: number) => hash((a % fx) + seed * 17, b);
  return (L(i, j) * (1 - u) + L(i + 1, j) * u) * (1 - w) + (L(i, j + 1) * (1 - u) + L(i + 1, j + 1) * u) * w;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

type V = [number, number, number];
const C = (h: string) => new THREE.Color(h);

// --- Mesh accumulator (non-indexed) -------------------------------------------------------------------

class Acc {
  pos: number[] = [];
  col: number[] = [];
  nor: number[] = [];
  /** A flat-shaded triangle (face normal). */
  tri(a: V, b: V, c: V, ca: THREE.Color, cb: THREE.Color = ca, cc: THREE.Color = ca) {
    const n = faceNormal(a, b, c);
    this.push(a, b, c, ca, cb, cc, n, n, n);
  }
  quad(a: V, b: V, c: V, d: V, ca: THREE.Color, cb: THREE.Color = ca, cc: THREE.Color = ca, cd: THREE.Color = ca) {
    this.tri(a, b, c, ca, cb, cc);
    this.tri(a, c, d, ca, cc, cd);
  }
  /** A smooth-shaded triangle; the winding is flipped if it disagrees with the given normals. */
  triN(a: V, b: V, c: V, ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, na: V, nb: V, nc: V) {
    const f = faceNormal(a, b, c);
    if (f[0] * (na[0] + nb[0] + nc[0]) + f[1] * (na[1] + nb[1] + nc[1]) + f[2] * (na[2] + nb[2] + nc[2]) < 0) this.push(a, c, b, ca, cc, cb, na, nc, nb);
    else this.push(a, b, c, ca, cb, cc, na, nb, nc);
  }
  private push(a: V, b: V, c: V, ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, na: V, nb: V, nc: V) {
    this.pos.push(...a, ...b, ...c);
    this.col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
    this.nor.push(...na, ...nb, ...nc);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.computeBoundingSphere();
    return g;
  }
}

function faceNormal(a: V, b: V, c: V): V {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
  const l = Math.hypot(x, y, z);
  return l < 1e-9 ? [0, 1, 0] : [x / l, y / l, z / l];
}

/** A cheap, stable fingerprint of a geometry's positions: the same seed must give the same value. */
export function geometryHash(g: THREE.BufferGeometry): number {
  const p = g.attributes.position;
  let h = 2166136261;
  for (let i = 0; i < p.count; i++) {
    for (const v of [p.getX(i), p.getY(i), p.getZ(i)]) {
      h ^= Math.round(v * 1000) | 0;
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

// --- Palette -------------------------------------------------------------------------------------------

const GRASS = [C("#6d8a3c"), C("#5d7b35"), C("#7c9445"), C("#52702f")];
const EARTH = [C("#5a3f2e"), C("#6b4a34")];
const STRATA = [C("#a08060"), C("#7d7266"), C("#94704c"), C("#6e655c"), C("#a98a66"), C("#5f5850")];
const DEEP = C("#3a3431");
const MOSS = [C("#58763a"), C("#3f5f2f"), C("#6b8a40")];
const ROOT = C("#43301f");
const VINE = C("#4d7337");
const LEAF = [C("#5f8a3a"), C("#46702f"), C("#7a9a42")];
const _c = new THREE.Color();

// --- The rock mass --------------------------------------------------------------------------------------

/** Rows from the grass lip down to the tip (world y): fine under the lip, ~0.9 m apart below it. */
const ROWS: number[] = (() => {
  const r = [-0.06, -0.4, -1.1, -2.4];
  for (let y = -3.3; y > TIP_Y + 0.5; y -= 0.9) r.push(Math.round(y * 100) / 100);
  r.push(TIP_Y);
  return r;
})();
/** Base radius at a few heights; linear in between. A bulging crown that tapers into a long root. */
const PROFILE: [number, number][] = [
  [TOP_Y, RIM_R],
  [-0.4, RIM_R + 0.3],
  [-1.1, RIM_R - 0.05],
  [-2.4, RIM_R - 1],
  [-4.2, 26.6],
  [-7, 25],
  [-10, 22],
  [-14, 18.4],
  [-18, 14.2],
  [-22, 10.6],
  [-26, 7],
  [-30, 3.7],
  [-33.5, 1.4],
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

/** Sedimentary layer at (th, y): index, phase 0..1 inside the layer (0 = its top), and the radial step (m). */
export function strata(th: number, y: number) {
  const u = -y / 2.6 + (pn2(th, -y * 0.1, 5, 21) - 0.5) * 1.6;
  const k = Math.floor(u);
  const f = u - k;
  // hard layers jut out, soft ones recess; the step happens in the last quarter of a layer, so ledges + overhangs
  const p = lerp(hash(k, 31), hash(k + 1, 31), smooth(0.72, 1, f));
  return { k, f, step: (p - 0.5) * 2.6 };
}

/** Radius of the rock mass at angle `th` and height `y` (0 = +z, clockwise from above). */
export function islandRadius(th: number, y: number) {
  const base = profileR(y);
  const depth = smooth(-1.6, -12, y);
  if (depth <= 0) return base;
  // everything below is in metres, fading in under the lip and out toward the tip
  const k = depth * smooth(0, 9, base);
  const lobes = (pnoise(th, 3, 5) - 0.5) * 0.28 * base * smooth(-1.6, -30, y);
  const fbm =
    (pn2(th, -y * 0.12, 6, 11) - 0.5) * 3 +
    (pn2(th, -y * 0.3, 14, 12) - 0.5) * 1.7 +
    (pn2(th, -y * 0.8, 31, 13) - 0.5) * 0.8 +
    (pn2(th, -y * 2.2, 64, 14) - 0.5) * 0.3;
  const ridge = Math.abs(pn2(th, -y * 0.05, 12, 41) - 0.5);
  const crack = (1 - smooth(0, 0.05, ridge)) * smooth(0.45, 0.6, pn2(th, -y * 0.07, 9, 42));
  const r = base + lobes + k * (fbm + strata(th, y).step - crack * 1.4);
  return clamp(r, 0, RIM_R + 0.4);
}

const surf = (th: number, y: number, extra = 0): V => {
  const r = islandRadius(th, y) + extra;
  return [Math.sin(th) * r, y, Math.cos(th) * r];
};

/** Flank colour at (th, y): grass lip, earth, then strata bands with moss on ledges, AO and depth shading. */
function rockColor(th: number, y: number, ny: number, ao: number, out: THREE.Color) {
  const j = hash(Math.round(th * 40), Math.round(-y * 3)) * 0.12;
  const wob = (pn2(th, 0.5, 28, 7) - 0.5) * 1.6;
  if (y > -0.3) return out.copy(GRASS[Math.floor(hash(th * 9, 3) * GRASS.length)]).multiplyScalar(0.9 + j);
  if (y + wob > -2.6) return out.copy(EARTH[Math.floor(hash(th * 7, y) * EARTH.length)]).multiplyScalar((0.85 + j) * (0.8 + 0.2 * ao));
  const s = strata(th, y);
  out.copy(STRATA[((s.k % STRATA.length) + STRATA.length) % STRATA.length]);
  // cooler and darker with depth
  out.lerp(DEEP, smooth(-6, -36, y) * 0.8);
  out.multiplyScalar((0.85 + j) * (1 - 0.35 * smooth(-10, -36, y)));
  // shadow right under a ledge
  out.multiplyScalar(1 - 0.3 * (1 - smooth(0, 0.2, s.f)) * smooth(-2.5, -8, y));
  // moss: flat-ish ledges, and a green drip line under the lip
  const patch = pn2(th, -y * 0.5, 17, 9);
  const moss = Math.max(smooth(0.3, 0.65, ny) * smooth(-34, -4, y) * smooth(0.3, 0.7, patch), smooth(-9, -3, y) * smooth(0.45, 0.8, pn2(th, -y * 0.35, 23, 10)) * 0.8);
  if (moss > 0) out.lerp(MOSS[Math.floor(hash(th * 11, y) * MOSS.length)], moss * 0.85);
  return out.multiplyScalar(ao);
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
  // the flank: a displaced grid with smooth normals, baked ambient occlusion in the vertex colour
  const K = ROWS.length;
  const th = (i: number) => (((i % SEG) + SEG) % SEG / SEG) * TAU;
  const P: V[][] = [];
  const R: number[][] = [];
  for (let k = 0; k < K; k++) {
    P.push([]);
    R.push([]);
    for (let i = 0; i < SEG; i++) {
      const p = surf(th(i), ROWS[k]);
      P[k].push(p);
      R[k].push(Math.hypot(p[0], p[2]));
    }
  }
  const N: V[][] = [];
  const COL: THREE.Color[][] = [];
  for (let k = 0; k < K; k++) {
    N.push([]);
    COL.push([]);
    for (let i = 0; i < SEG; i++) {
      const k0 = Math.max(0, k - 1);
      const k1 = Math.min(K - 1, k + 1);
      const pa = P[k][(i + SEG - 1) % SEG];
      const pb = P[k][(i + 1) % SEG];
      const pu = P[k0][i];
      const pd = P[k1][i];
      const t1: V = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
      const t2: V = [pd[0] - pu[0], pd[1] - pu[1], pd[2] - pu[2]];
      let n: V = [t1[1] * t2[2] - t1[2] * t2[1], t1[2] * t2[0] - t1[0] * t2[2], t1[0] * t2[1] - t1[1] * t2[0]];
      const p = P[k][i];
      if (n[0] * p[0] + n[2] * p[2] < 0) n = [-n[0], -n[1], -n[2]];
      const l = Math.hypot(...n);
      n = l < 1e-6 ? [0, -1, 0] : [n[0] / l, n[1] / l, n[2] / l];
      N[k].push(n);
      // concavity: how far this vertex sits behind the average of its four neighbours
      const avg = (R[k0][i] + R[k1][i] + R[k][(i + SEG - 1) % SEG] + R[k][(i + 1) % SEG]) / 4;
      const conc = avg - R[k][i];
      const ao = 1 - clamp(conc * 0.55, 0, 0.55) + clamp(-conc * 0.12, 0, 0.1);
      COL[k].push(rockColor(th(i), ROWS[k], n[1], ao, new THREE.Color()));
    }
  }
  for (let k = 0; k < K - 1; k++) {
    for (let i = 0; i < SEG; i++) {
      const j = (i + 1) % SEG;
      acc.triN(P[k][i], P[k + 1][i], P[k + 1][j], COL[k][i], COL[k + 1][i], COL[k + 1][j], N[k][i], N[k + 1][i], N[k + 1][j]);
      acc.triN(P[k][i], P[k + 1][j], P[k][j], COL[k][i], COL[k + 1][j], COL[k][j], N[k][i], N[k + 1][j], N[k][j]);
    }
  }
}

/** A jagged spur: a faceted cone with an offset, kinked middle and a ragged base. Base ring at (cx, cy, cz). */
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

/** Stalactite spurs hanging from the flank. */
function addCrags(acc: Acc) {
  for (let i = 0; i < 18; i++) {
    const th = hash(i, 41) * TAU;
    const y0 = -4 - hash(i, 42) * 18;
    const r = islandRadius(th, y0) * 0.92;
    const len = 3 + hash(i, 43) * 6;
    const rad = 0.8 + hash(i, 44) * 1.3;
    rockColor(th, y0, 0, 0.8, _c);
    const c0 = _c.clone();
    const c1 = _c.clone().lerp(DEEP, 0.5);
    addCone(acc, Math.sin(th) * r, y0, Math.cos(th) * r, rad, len, 6, false, c0, c1, -Math.sin(th) * 0.6, -Math.cos(th) * 0.6, 0.3, i);
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
  for (let i = 0; i < 44; i++) {
    const th = ((i + hash(i, 5) * 0.8) / 44) * TAU;
    if (fallNear(th, 0.2)) continue;
    const vine = i % 3 === 0;
    addRoot(acc, th, -1.0 - hash(i, 6) * 0.5, (vine ? 5 : 2.5) + hash(i, 7) * 5, vine, i);
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

/** Floating rock placements: [x, y, z, scale, yaw]. Clear of the island, the camera's south side and the sky dome.
 *  The vertex shader orbits each one slowly around the island's axis, so the ring radius stays put. */
export const FLOAT_ROCKS: [number, number, number, number, number][] = [
  [-41, 5, -22, 3.2, 0.4],
  [47, -5, -12, 4.6, 2.1],
  [31, 13, -49, 2.6, 4.0],
  [-54, -11, 10, 3.6, 5.2],
  [6, -15, -60, 5.2, 1.0],
  [-44, 2, 36, 2.8, 3.1],
  [52, 8, 30, 3.4, 5.8],
];

// --- Waterfalls + spray + mist -------------------------------------------------------------------------

/** Shape of every fall. `pool` is the share of the path (0..1) spent in the rapids on the lip before the drop. */
export const FALL = { segments: 30, across: 5, pool: 0.1, drop: 44, width: 6.5, spread: 0.7, throw: 4.2 };

export interface FallAnchor {
  th: number;
  /** On the rim, at RIM_R. */
  x: number;
  z: number;
  /** Outward (radial) unit vector. */
  nx: number;
  nz: number;
  /** Width of the water at the lip (m). */
  width: number;
}

/** Where each fall meets the rim. Pure; every anchor sits on the rim circle and clear of the wall gates. */
export function fallAnchors(): FallAnchor[] {
  return FALL_ANGLES.map((th) => ({ th, x: Math.sin(th) * RIM_R, z: Math.cos(th) * RIM_R, nx: Math.sin(th), nz: Math.cos(th), width: FALL.width }));
}

/** Point on a fall's centre line at path parameter s (0 = upstream end of the rapids, 1 = fully faded). */
export function fallPath(s: number) {
  if (s <= FALL.pool) {
    const q = s / FALL.pool;
    return { r: RIM_R - 1.0 + 0.95 * q, y: TOP_Y + 0.05, t: 0, width: FALL.width * (0.8 + 0.2 * q) };
  }
  const t = (s - FALL.pool) / (1 - FALL.pool);
  // leaves the lip with a little horizontal speed, then drops: the throw grows like sqrt(depth)
  return { r: RIM_R - 0.05 + FALL.throw * Math.sqrt(t), y: TOP_Y + 0.05 - FALL.drop * t, t, width: FALL.width * (1 + FALL.spread * t) };
}

/**
 * Rapids + falls (water ribbons, kind 0), lip spray (kind 2) and mist (kind 1) cards. One mesh, one shader.
 * Per vertex: `aUv` (x across the water 0..1 / path param 0..1; or the card corner -1..1), `aKind`, `aSize`
 * (card half-size in m) and `aSeed`. `lite` leaves out the spray + mist cards.
 */
export function buildFallGeometry(lite = false): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const kind: number[] = [];
  const size: number[] = [];
  const seed: number[] = [];
  const idx: number[] = [];
  const { segments: N, across: M } = FALL;
  fallAnchors().forEach((an, fi) => {
    const s = an.nx;
    const c = an.nz;
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const v = i / N;
      const p = fallPath(v);
      for (let j = 0; j < M; j++) {
        const x = j / (M - 1);
        const u = 2 * x - 1;
        const off = (x - 0.5) * p.width;
        // the stream is a little domed across its width, flatter in the rapids
        const r = p.r + 0.35 * (1 - u * u) * (v <= FALL.pool ? 0.3 : 1 - 0.5 * p.t);
        pos.push(s * r + c * off, p.y, c * r - s * off);
        uv.push(x, v);
        kind.push(0);
        size.push(0);
        seed.push(fi);
      }
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M - 1; j++) {
        const a = base + i * M + j;
        idx.push(a, a + 1, a + M + 1, a, a + M + 1, a + M);
      }
    }
    if (lite) return;
    // spray at the lip, a veil down the fall and mist where it dissolves into the clouds: [path t, size, kind, throw]
    const cards: [number, number, number][] = [
      [0.0, 4.5, 2],
      [0.42, 9, 1],
      [0.93, 20, 1],
      [1.1, 26, 1],
    ];
    cards.forEach(([t, sz, k], ci) => {
      const y = k === 2 ? TOP_Y + 1.1 : TOP_Y - FALL.drop * t;
      const r = RIM_R + (k === 2 ? 0.4 : 0.6 + FALL.throw * Math.sqrt(t));
      const b = pos.length / 3;
      for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pos.push(s * r, y, c * r);
        uv.push(cx, cz);
        kind.push(k);
        size.push(sz);
        seed.push(fi * 4 + ci + 1);
      }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aUv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aKind", new THREE.Float32BufferAttribute(kind, 1));
  g.setAttribute("aSize", new THREE.Float32BufferAttribute(size, 1));
  g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 1));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -14, 0), 55);
  return g;
}
