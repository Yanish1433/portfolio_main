// Geometry helpers for the procedural architecture kit. Builders push small
// primitives into per-material buckets; `Parts.merge()` turns each bucket into
// one BufferGeometry, so a whole town costs about one draw call per material.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type MatKey = "brick" | "wood" | "roof" | "plain" | "gold" | "lattice" | "window" | "clay" | "cloth" | "water" | "slab";

export const MAT_KEYS: MatKey[] = ["brick", "wood", "roof", "plain", "gold", "lattice", "window", "clay", "cloth", "water", "slab"];

const _c = new THREE.Color();

/** Ensure a geometry is non-indexed and has position/normal/uv/color (+aLit for windows). */
function normalise(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, lit?: number) {
  const geo = g.index ? g.toNonIndexed() : g.clone();
  geo.clearGroups();
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const n = geo.attributes.position.count;
  if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  for (const k of Object.keys(geo.attributes)) {
    if (!["position", "normal", "uv"].includes(k)) geo.deleteAttribute(k);
  }
  _c.set(color);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r;
    col[i * 3 + 1] = _c.g;
    col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  if (lit !== undefined) geo.setAttribute("aLit", new THREE.Float32BufferAttribute(new Float32Array(n).fill(lit), 1));
  return geo;
}

/** Materials whose meshes never cast shadows, so splitting them into a "small" bucket would only cost a draw call. */
const NEVER_CASTS = new Set<MatKey>(["lattice", "window", "cloth", "water", "slab"]);

export class Parts {
  buckets = new Map<MatKey, THREE.BufferGeometry[]>();
  /** Geometry of small props that must not cast shadows (kept in separate meshes from `buckets`). */
  noCast = new Map<MatKey, THREE.BufferGeometry[]>();
  private smallDepth = 0;

  /** Everything added inside `fn` is a small prop: it is drawn normally but skipped by the shadow pass. */
  small(fn: () => void) {
    this.smallDepth++;
    try {
      fn();
    } finally {
      this.smallDepth--;
    }
    return this;
  }

  add(key: MatKey, g: THREE.BufferGeometry, color: THREE.ColorRepresentation = "#ffffff", m?: THREE.Matrix4, lit?: number) {
    const geo = normalise(g, color, key === "window" ? (lit ?? 0) : undefined);
    if (m) geo.applyMatrix4(m);
    const map = this.smallDepth > 0 && !NEVER_CASTS.has(key) ? this.noCast : this.buckets;
    let list = map.get(key);
    if (!list) map.set(key, (list = []));
    list.push(geo);
    return this;
  }

  /** Like add(), but keeps the geometry's own vertex colours (it needs position, normal, uv and color). Used by the procedural trees. */
  addRaw(key: MatKey, g: THREE.BufferGeometry, m?: THREE.Matrix4) {
    const geo = g.index ? g.toNonIndexed() : g.clone();
    geo.clearGroups();
    for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) geo.deleteAttribute(k);
    if (m) geo.applyMatrix4(m);
    const map = this.smallDepth > 0 && !NEVER_CASTS.has(key) ? this.noCast : this.buckets;
    let list = map.get(key);
    if (!list) map.set(key, (list = []));
    list.push(geo);
    return this;
  }

  /** Box centred at (x,y,z), rotated by ry about Y. UVs in metres. */
  box(key: MatKey, w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation = "#fff", ry = 0) {
    return this.add(key, box(w, h, d), color, T(x, y, z, ry));
  }

  /** Append another Parts, transformed. */
  append(other: Parts, m: THREE.Matrix4) {
    for (const [from, to] of [[other.buckets, this.buckets], [other.noCast, this.noCast]] as const) {
      for (const [key, list] of from) {
        let mine = to.get(key);
        if (!mine) to.set(key, (mine = []));
        for (const g of list) mine.push(g.clone().applyMatrix4(m));
      }
    }
    return this;
  }

  merge(): Map<MatKey, THREE.BufferGeometry> {
    return mergeBuckets(this.buckets);
  }

  /** Big and small pieces together: one geometry per material. */
  mergeAll(): Map<MatKey, THREE.BufferGeometry> {
    const all = new Map<MatKey, THREE.BufferGeometry[]>();
    for (const m of [this.buckets, this.noCast]) for (const [k, l] of m) all.set(k, [...(all.get(k) ?? []), ...l]);
    return mergeBuckets(all);
  }

  /** The small, shadow-free props, merged one mesh per material. */
  mergeNoCast(): Map<MatKey, THREE.BufferGeometry> {
    return mergeBuckets(this.noCast);
  }
}

function mergeBuckets(buckets: Map<MatKey, THREE.BufferGeometry[]>): Map<MatKey, THREE.BufferGeometry> {
  const out = new Map<MatKey, THREE.BufferGeometry>();
  for (const [key, list] of buckets) {
    if (!list.length) continue;
    const merged = mergeGeometries(list, false);
    if (merged) {
      merged.computeBoundingSphere();
      out.set(key, merged);
    }
  }
  return out;
}

/** Translation + Y rotation + uniform/xyz scale. */
export function T(x = 0, y = 0, z = 0, ry = 0, s: number | [number, number, number] = 1) {
  const m = new THREE.Matrix4();
  const sc = typeof s === "number" ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), sc);
  return m;
}

/** BoxGeometry with UVs in metres (so tiled textures keep their scale). */
export function box(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
    }
  }
  return g;
}

/** Plane facing +z, uv 0..1 (or metres if `metres`). */
export function plane(w: number, h: number, segY = 1, metres = false) {
  const g = new THREE.PlaneGeometry(w, h, 1, segY);
  if (metres) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  }
  return g;
}

/** A thin box from a to b (struts, poles, ropes). */
export function beam(a: THREE.Vector3, b: THREE.Vector3, tx: number, tz = tx) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = box(tx, len, tz);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const m = new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

/** Triangle soup builder with auto-flipped winding (faces point along `hint`). */
class Soup {
  pos: number[] = [];
  uv: number[] = [];
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ua: number[], ub: number[], uc: number[], hint: THREE.Vector3) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.dot(hint) < 0) {
      [b, c] = [c, b];
      [ub, uc] = [uc, ub];
    }
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.uv.push(...ua, ...ub, ...uc);
  }
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ua: number[], ub: number[], uc: number[], ud: number[], hint: THREE.Vector3) {
    this.tri(a, b, c, ua, ub, uc, hint);
    this.tri(a, c, d, ua, uc, ud, hint);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return g;
  }
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Newar hip roof: straight slopes from a W x D eave down at y=0 to a w x d top
 * at y=h, eave corners lifted by `up` (a subtle upturn, not a Chinese curve).
 * Returns the tiled top surface and the wooden underside/fascia separately.
 * `wall` is the wall footprint the underside meets.
 */
export function hipRoof(W: number, D: number, w: number, d: number, h: number, up: number, wall: [number, number]) {
  const top = new Soup();
  const under = new Soup();
  const hw = W / 2;
  const hd = D / 2;
  const tw = Math.max(w / 2, 0.001);
  const td = Math.max(d / 2, 0.001);
  // corners CCW from (-,-)
  const sx = [-1, 1, 1, -1];
  const sz = [-1, -1, 1, 1];
  const yIn = h * Math.min(1, (hw - wall[0] / 2) / Math.max(hw - tw, 0.01)) - 0.12;
  const thick = 0.1;
  for (let s = 0; s < 4; s++) {
    const n = (s + 1) % 4;
    const b0 = V(sx[s] * hw, up, sz[s] * hd);
    const b1 = V(sx[n] * hw, up, sz[n] * hd);
    const bm = V((b0.x + b1.x) / 2, 0, (b0.z + b1.z) / 2);
    const t0 = V(sx[s] * tw, h, sz[s] * td);
    const t1 = V(sx[n] * tw, h, sz[n] * td);
    const tm = V((t0.x + t1.x) / 2, h, (t0.z + t1.z) / 2);
    const out = V(bm.x, 0, bm.z).normalize();
    const hint = V(out.x, 1, out.z);
    const along = (p: THREE.Vector3) => (Math.abs(out.x) > 0.5 ? p.z : p.x);
    const slope = Math.hypot(h, Math.abs(Math.abs(out.x) > 0.5 ? hw - tw : hd - td));
    const uvOf = (p: THREE.Vector3, v: number) => [along(p), v];
    top.quad(b0, bm, tm, t0, uvOf(b0, 0), uvOf(bm, 0), uvOf(tm, slope), uvOf(t0, slope), hint);
    top.quad(bm, b1, t1, tm, uvOf(bm, 0), uvOf(b1, 0), uvOf(t1, slope), uvOf(tm, slope), hint);
    // fascia (edge thickness)
    const f0 = V(b0.x, b0.y - thick, b0.z);
    const f1 = V(b1.x, b1.y - thick, b1.z);
    const fm = V(bm.x, bm.y - thick, bm.z);
    const fh = V(out.x, 0, out.z);
    under.quad(f0, fm, bm, b0, [0, 0], [1, 0], [1, 1], [0, 1], fh);
    under.quad(fm, f1, b1, bm, [0, 0], [1, 0], [1, 1], [0, 1], fh);
    // underside from eave to wall
    const i0 = V(sx[s] * (wall[0] / 2), yIn, sz[s] * (wall[1] / 2));
    const i1 = V(sx[n] * (wall[0] / 2), yIn, sz[n] * (wall[1] / 2));
    const down = V(out.x * 0.3, -1, out.z * 0.3);
    under.quad(f0, f1, i1, i0, [b0.x, b0.z], [b1.x, b1.z], [i1.x, i1.z], [i0.x, i0.z], down);
  }
  if (w > 0.01 && d > 0.01) {
    top.quad(V(-tw, h, -td), V(tw, h, -td), V(tw, h, td), V(-tw, h, td), [0, 0], [w, 0], [w, d], [0, d], V(0, 1, 0));
  }
  return { top: top.build(), under: under.build(), yIn };
}

/** Lathe from [radius, y] pairs. */
export function lathe(profile: [number, number][], seg = 10) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );
}

/** Points of a hanging rope (catenary-ish parabola) from a to b. */
export function sag(a: THREE.Vector3, b: THREE.Vector3, drop: number, step: number) {
  const len = a.distanceTo(b);
  const n = Math.max(2, Math.round(len / step));
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= drop * 4 * t * (1 - t);
    pts.push(p);
  }
  return pts;
}

export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
