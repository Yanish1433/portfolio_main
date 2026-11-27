// Procedural trees (step9b). Pure TypeScript, seeded PRNG only (no Math.random), so a tree is the same every run.
//
//  - bark: tapered, fluted, buttressed tubes (trunk, forking limbs, twigs, hanging aerial roots) with vertex-colour
//    noise. Handed to the town's shared "wood" bucket (Parts.addRaw), so it costs no draw call.
//  - leaves: many small alpha-cut cards (2 tris each) clustered at the branch tips, so the crown is airy and the
//    light comes through. All cards of all trees share ONE texture atlas that is generated here pixel by pixel
//    (a heart-with-drip-tip peepal leaf, an oval broadleaf, a slim lanceolate ashoka leaf), no photo anywhere.
//
// Trees are built in local space: trunk axis = +y from the origin (the ground / platform top).
import * as THREE from "three";
import { seeded } from "./geom";

export type TreeId = "peepal" | "broadleaf" | "ashoka" | "chautari";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ------------------------------------------------------------------ species

type Spec = {
  trunkH: number; // height of the first fork
  r0: number; // trunk radius at the foot
  rFork: number; // trunk radius at the fork
  flare: number; // extra radius at the foot, as a fraction of r0 (root flare)
  flute: number; // fluting amplitude at the foot (fraction of the radius)
  fluteN: number; // number of flutes
  sides: number; // radial segments of the trunk
  lean: number; // sideways drift of the trunk top (m)
  buttress: number; // buttress roots
  buttressLen: number;
  buttressH: number; // how high up the trunk they start
  limbs: number; // primary limbs
  kids: [number, number]; // children per limb at level 1 and level 2
  levels: number; // 1 = limbs + branches, 2 = + twigs
  seg: [number, number, number]; // segments per level
  side: [number, number, number]; // radial sides per level
  crown: { cy: number; rx: number; ry: number };
  cards: number;
  card: number; // card edge (m)
  clump: number; // clump radius as a fraction of the crown radius
  cell: number[]; // atlas cells used by this species
  hue: number;
  sat: number;
  light: number;
  young: number; // fraction of coppery young leaves
  droop: number; // how much leaf tips hang
  aerial: number; // hanging aerial roots
  bark: string;
  barkNoise: number;
};

const SPECS: Record<TreeId, Spec> = {
  peepal: {
    trunkH: 1.7, r0: 0.3, rFork: 0.19, flare: 0.35, flute: 0.1, fluteN: 6, sides: 8, lean: 0.12,
    buttress: 4, buttressLen: 0.55, buttressH: 0.55,
    limbs: 4, kids: [2, 0], levels: 1, seg: [3, 2, 2], side: [5, 4, 3],
    crown: { cy: 3.9, rx: 2.0, ry: 1.5 }, cards: 290, card: 0.66, clump: 0.55, cell: [0, 3],
    hue: 0.255, sat: 0.5, light: 0.37, young: 0.02, droop: 0.4, aerial: 0, bark: "#9c9ea4", barkNoise: 0.14,
  },
  broadleaf: {
    trunkH: 1.5, r0: 0.23, rFork: 0.15, flare: 0.25, flute: 0.05, fluteN: 5, sides: 8, lean: 0.1,
    buttress: 3, buttressLen: 0.4, buttressH: 0.4,
    limbs: 4, kids: [2, 0], levels: 1, seg: [3, 2, 2], side: [5, 4, 3],
    crown: { cy: 3.45, rx: 1.75, ry: 1.4 }, cards: 270, card: 0.62, clump: 0.55, cell: [1],
    hue: 0.285, sat: 0.46, light: 0.34, young: 0, droop: 0.2, aerial: 0, bark: "#8f8c88", barkNoise: 0.16,
  },
  ashoka: {
    trunkH: 1.0, r0: 0.16, rFork: 0.1, flare: 0.2, flute: 0.03, fluteN: 5, sides: 7, lean: 0.05,
    buttress: 0, buttressLen: 0, buttressH: 0,
    limbs: 5, kids: [2, 0], levels: 1, seg: [3, 2, 2], side: [4, 4, 3],
    crown: { cy: 3.2, rx: 0.95, ry: 2.35 }, cards: 230, card: 0.8, clump: 0.45, cell: [2],
    hue: 0.31, sat: 0.5, light: 0.31, young: 0, droop: 0.95, aerial: 0, bark: "#9a9890", barkNoise: 0.1,
  },
  chautari: {
    trunkH: 2.6, r0: 0.64, rFork: 0.38, flare: 0.5, flute: 0.14, fluteN: 7, sides: 12, lean: 0.35,
    buttress: 6, buttressLen: 1.35, buttressH: 1.15,
    limbs: 5, kids: [3, 1], levels: 2, seg: [4, 4, 3], side: [6, 5, 4],
    crown: { cy: 5.15, rx: 2.9, ry: 2.55 }, cards: 920, card: 0.66, clump: 0.3, cell: [0, 3],
    hue: 0.255, sat: 0.5, light: 0.36, young: 0.02, droop: 0.4, aerial: 11, bark: "#8c8f95", barkNoise: 0.2,
  },
};

/** Which species each of the town's TREES entries (zones.ts) is, in order. */
export const TOWN_TREE_KINDS: TreeId[] = ["peepal", "broadleaf", "ashoka", "broadleaf"];

// ------------------------------------------------------------------ bark tubes

type TubeOpts = {
  sides: number;
  flute?: number;
  fluteN?: number;
  squash?: number; // vertical stretch of the cross-section (buttress planks)
  col: THREE.Color;
  noise: number;
  rng: () => number;
};

class Bark {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  vertices = 0;

  /** A tube along `pts` with radius `radii[i]` at each point. The ends are open (limb tips taper to nothing). */
  tube(pts: THREE.Vector3[], radii: number[], o: TubeOpts) {
    const n = pts.length;
    const S = o.sides;
    const A = o.flute ?? 0;
    const N = o.fluteN ?? 5;
    const tan: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) tan.push(new THREE.Vector3().subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize());
    // parallel-transport frames
    let nrm = Math.abs(tan[0].y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
    nrm = nrm.sub(tan[0].clone().multiplyScalar(nrm.dot(tan[0]))).normalize();
    const base = this.vertices;
    let len = 0;
    const phase = o.rng() * TAU;
    const tmp = V();
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        nrm = nrm.sub(tan[i].clone().multiplyScalar(nrm.dot(tan[i]))).normalize();
        len += pts[i].distanceTo(pts[i - 1]);
      }
      const bin = new THREE.Vector3().crossVectors(tan[i], nrm);
      const dR = i < n - 1 ? (radii[i + 1] - radii[i]) / Math.max(1e-4, pts[i + 1].distanceTo(pts[i])) : i > 0 ? (radii[i] - radii[i - 1]) / Math.max(1e-4, pts[i].distanceTo(pts[i - 1])) : 0;
      // flutes fade out up the tree: amplitude follows how far the radius has shrunk
      const amp = A * clamp01((radii[i] - radii[n - 1] * 0.6) / Math.max(1e-3, radii[0] - radii[n - 1] * 0.6));
      const circ = TAU * radii[i];
      for (let j = 0; j <= S; j++) {
        const th = (j / S) * TAU;
        const dir = nrm.clone().multiplyScalar(Math.cos(th)).addScaledVector(bin, Math.sin(th));
        const ph = th * N + phase + i * 0.09;
        const f = 1 + amp * Math.sin(ph);
        const rad = radii[i] * f;
        tmp.copy(pts[i]).addScaledVector(dir, rad);
        if (o.squash) tmp.y = pts[i].y + (tmp.y - pts[i].y) * o.squash;
        this.pos.push(tmp.x, tmp.y, tmp.z);
        // normal: radial, tilted by the fluting slope and by the taper
        const thetaTan = new THREE.Vector3().crossVectors(tan[i], dir);
        const nn = dir.clone().addScaledVector(thetaTan, -(amp * N * Math.cos(ph)) / f).addScaledVector(tan[i], -dR);
        if (o.squash) nn.y /= o.squash;
        nn.normalize();
        this.nor.push(nn.x, nn.y, nn.z);
        this.uv.push((j / S) * circ, len);
        // vertex colour: low-frequency drift + fissures along the flutes + per-vertex grain
        const crest = 0.5 + 0.5 * Math.sin(ph);
        const shade = 1 + o.noise * ((o.rng() - 0.5) * 1.3 + 0.7 * Math.sin(len * 1.9 + phase + th * 1.3) + (crest - 0.5) * (A > 0 ? 1.1 : 0.3));
        this.col.push(clamp01(o.col.r * shade), clamp01(o.col.g * shade * (0.99 + 0.02 * o.rng())), clamp01(o.col.b * shade * (0.97 + 0.05 * o.rng())));
        this.vertices++;
      }
    }
    const row = S + 1;
    for (let i = 0; i < n - 1; i++)
      for (let j = 0; j < S; j++) {
        const a = base + i * row + j;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        this.idx.push(a, b, c, b, d, c);
      }
  }

  tris() {
    return this.idx.length / 3;
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

// ------------------------------------------------------------------ leaf cards

export type Card = {
  c: THREE.Vector3; // centre
  n: THREE.Vector3; // card plane normal
  u: THREE.Vector3; // direction of the leaf tips
  bent: THREE.Vector3; // shading normal, bent outward from the crown centre
  s: number; // edge length
  col: THREE.Color;
  cell: number;
  flut: number;
};

export type TreeBuild = {
  id: TreeId;
  bark: THREE.BufferGeometry;
  barkTris: number;
  cards: Card[];
  /** The crown ellipsoid (local space), for the wall / canopy tests. */
  crown: { cy: number; rx: number; ry: number };
  /** Trunk radius at height h above the foot (mean, without fluting). */
  trunkRadiusAt: (h: number) => number;
  /** Trunk axis x/z at height h. */
  trunkAxisAt: (h: number) => { x: number; z: number };
  /** A point under the lowest big limb, for the hanging bell. */
  limbPoint: THREE.Vector3;
  height: number;
};

const atlasUv = (cell: number, x: number, y: number): [number, number] => [((cell % 2) + 0.03 + x * 0.94) / 2, (Math.floor(cell / 2) + 0.03 + y * 0.94) / 2];

export function growTree(id: TreeId, seed = 1): TreeBuild {
  const sp = SPECS[id];
  const rng = seeded(seed * 7919 + id.length * 131);
  const rand = (a = 0, b = 1) => a + (b - a) * rng();
  const bark = new Bark();
  const col = new THREE.Color(sp.bark);
  const tOpts = (sides: number, extra: Partial<TubeOpts> = {}): TubeOpts => ({ sides, col, noise: sp.barkNoise, rng, ...extra });
  const cc = V(0, sp.crown.cy, 0);

  // ---- trunk: tapered, leaning a little, root flare + flutes
  const rAt = (h: number) => {
    const t = clamp01(h / sp.trunkH);
    return sp.rFork + (sp.r0 - sp.rFork) * Math.pow(1 - t, 1.5) + sp.r0 * sp.flare * Math.exp(-h / 0.4);
  };
  const lx = rand(-1, 1) * sp.lean;
  const lz = rand(-1, 1) * sp.lean;
  const wob = rand(0, TAU);
  const axisAt = (h: number) => {
    const t = clamp01(h / sp.trunkH);
    return { x: lx * t * t + Math.sin(h * 1.7 + wob) * 0.04 * t, z: lz * t * t + Math.cos(h * 1.3 + wob) * 0.04 * t };
  };
  const nT = Math.max(6, Math.round(sp.trunkH / 0.3));
  const tp: THREE.Vector3[] = [];
  const tr: number[] = [];
  for (let i = 0; i <= nT; i++) {
    const h = (i / nT) * sp.trunkH;
    const a = axisAt(h);
    tp.push(V(a.x, h - (i === 0 ? 0.12 : 0), a.z));
    tr.push(rAt(h) * (i === 0 ? 1.04 : 1));
  }
  // close the top: the limbs start inside this dome
  const top = tp[tp.length - 1];
  tp.push(top.clone().add(V(0, 0.18, 0)), top.clone().add(V(0, 0.3, 0)));
  tr.push(sp.rFork * 0.7, sp.rFork * 0.12);
  bark.tube(tp, tr, tOpts(sp.sides, { flute: sp.flute, fluteN: sp.fluteN }));

  // ---- buttress roots: standing planks that run out and down into the ground
  for (let k = 0; k < sp.buttress; k++) {
    const a = (k / sp.buttress) * TAU + rand(-0.25, 0.25);
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const hb = sp.buttressH * rand(0.7, 1.05);
    const rb = sp.r0 * rand(0.2, 0.26);
    const pts: THREE.Vector3[] = [];
    const rr: number[] = [];
    const L = sp.buttressLen * rand(0.75, 1.15);
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const out = rAt(hb) * 0.55 + L * t;
      const y = hb * Math.pow(1 - t, 1.9) - 0.04 * t;
      const wig = Math.sin(t * 5 + k) * 0.06 * t;
      pts.push(V(dx * out - dz * wig, y, dz * out + dx * wig));
      rr.push(rb * (1 - 0.7 * t));
    }
    bark.tube(pts, rr, tOpts(5, { squash: 1.9, flute: 0 }));
  }

  // ---- limbs
  const sites: { p: THREE.Vector3; w: number }[] = [];
  const limbPts: THREE.Vector3[] = [];
  let limbPoint = V(0, sp.trunkH, 0);
  const aerialSeeds: { p: THREE.Vector3; r: number }[] = [];
  const crownPoint = (az: number, el: number, f: number) =>
    V(cc.x + Math.cos(az) * Math.cos(el) * sp.crown.rx * f, cc.y + Math.sin(el) * sp.crown.ry * f, cc.z + Math.sin(az) * Math.cos(el) * sp.crown.rx * f);

  const grow = (p0: THREE.Vector3, dir0: THREE.Vector3, target: THREE.Vector3, r0: number, level: number) => {
    const segs = sp.seg[level];
    const pts: THREE.Vector3[] = [p0.clone()];
    const rr: number[] = [r0];
    const dir = dir0.clone().normalize();
    const total = p0.distanceTo(target);
    const step = Math.max(0.18, total / segs);
    const p = p0.clone();
    for (let i = 0; i < segs; i++) {
      const toT = target.clone().sub(p).normalize();
      dir.multiplyScalar(0.6).addScaledVector(toT, 0.4).add(V(rand(-1, 1), rand(-0.4, 0.5), rand(-1, 1)).multiplyScalar(level === 0 ? 0.28 : 0.4)).normalize();
      p.addScaledVector(dir, step);
      pts.push(p.clone());
      const t = (i + 1) / segs;
      rr.push(r0 * (1 - 0.62 * t) * (i === segs - 1 && level === sp.levels ? 0.45 : 1));
    }
    bark.tube(pts, rr, tOpts(sp.side[level]));
    limbPts.push(...pts);
    if (level === 0 && limbPoint.y === sp.trunkH) limbPoint = pts[Math.min(2, pts.length - 1)].clone();
    if (level >= 1) sites.push({ p: pts[pts.length - 1].clone(), w: 1.4 }, { p: pts[Math.max(0, pts.length - 2)].clone(), w: 0.6 });
    else sites.push({ p: pts[pts.length - 1].clone(), w: 0.9 });
    if (level >= 1 && sp.aerial > 0) for (let i = 1; i < pts.length - 1; i++) aerialSeeds.push({ p: pts[i].clone(), r: rr[i] });
    if (level < sp.levels) {
      const nKids = sp.kids[level];
      for (let k = 0; k < nKids; k++) {
        const f = 0.4 + 0.55 * ((k + rng() * 0.6) / Math.max(1, nKids));
        const fi = Math.min(pts.length - 1, Math.max(1, Math.round(f * (pts.length - 1))));
        const at = pts[fi];
        const az = rand(0, TAU);
        const kt = crownPoint(az, rand(-0.15, 0.9), rand(0.8, 1.02));
        // children lean toward the open space away from the parent's end
        kt.lerp(target, 0.15);
        const kd = kt.clone().sub(at).normalize().lerp(dir, 0.25).normalize();
        grow(at, kd, kt, rr[fi] * 0.72, level + 1);
      }
    }
    if (level === sp.levels) sites.push({ p: pts[pts.length - 1].clone(), w: 1 });
  };

  const forkP = top.clone().add(V(0, 0.02, 0));
  for (let i = 0; i < sp.limbs; i++) {
    const az = (i / sp.limbs) * TAU + rand(-0.35, 0.35);
    const el = rand(0.35, 0.95);
    const tgt = crownPoint(az, el * (id === "ashoka" ? 1.2 : 1), rand(0.5, 0.75));
    const start = forkP.clone().add(V(Math.cos(az) * sp.rFork * 0.25, -0.12, Math.sin(az) * sp.rFork * 0.25));
    const dir = V(Math.cos(az) * 0.7, 0.8, Math.sin(az) * 0.7);
    grow(start, dir, tgt, sp.rFork * rand(0.55, 0.68), 0);
  }

  // ---- aerial roots: thin strands hanging from the limbs (banyan-like), clear of the front steps
  for (let k = 0; k < sp.aerial && aerialSeeds.length; k++) {
    const s = aerialSeeds[Math.floor(rng() * aerialSeeds.length)];
    const near = Math.hypot(s.p.x - top.x, s.p.z - top.z) < 1.7;
    if (s.p.z > 0.9) continue; // the south (+z) side faces the steps: keep it open
    const yEnd = near && s.p.z < 0.2 ? 0.03 : rand(2.1, 3.4);
    if (yEnd > s.p.y - 0.5) continue;
    const n = 4;
    const pts: THREE.Vector3[] = [];
    const rr: number[] = [];
    const w = rand(0, TAU);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(V(s.p.x + Math.sin(t * 4.5 + w) * 0.14 * t, s.p.y + (yEnd - s.p.y) * t, s.p.z + Math.cos(t * 3.6 + w) * 0.14 * t));
      rr.push(0.032 * (1 - 0.5 * t));
    }
    bark.tube(pts, rr, tOpts(4, { noise: 0.25 }));
  }

  // ---- leaf cards: clumps around the branch tips (+ a few along the outer limbs), clipped to the crown
  const cards: Card[] = [];
  const radii = V(sp.crown.rx, sp.crown.ry, sp.crown.rx);
  const clumpR = sp.clump * Math.max(sp.crown.rx, sp.crown.ry * 0.7);
  const wSum = sites.reduce((a, s) => a + s.w, 0);
  const pick = () => {
    let r = rng() * wSum;
    for (const s of sites) if ((r -= s.w) <= 0) return s.p;
    return sites[sites.length - 1].p;
  };
  const tmpC = new THREE.Color();
  for (let i = 0; i < sp.cards; i++) {
    const along = limbPts.length > 0 && rng() < 0.28;
    const base = along ? limbPts[Math.floor(rng() * limbPts.length)] : pick();
    const rad = (along ? 0.45 : 1) * clumpR * Math.sqrt(rng());
    const dirR = V(rand(-1, 1), rand(-0.7, 0.8), rand(-1, 1)).normalize();
    const c = base.clone().addScaledVector(dirR, rad);
    // keep inside the crown ellipsoid (soft)
    const rel = c.clone().sub(cc).divide(radii);
    const d = rel.length();
    if (d > 1.02) {
      const k = 1.02 / d;
      c.set(cc.x + rel.x * k * radii.x, cc.y + rel.y * k * radii.y, cc.z + rel.z * k * radii.z);
    }
    const relN = c.clone().sub(cc).divide(radii);
    const out = relN.clone().normalize();
    const f = clamp01(relN.length());
    const n = out.clone().multiplyScalar(0.5).add(V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(0.8)).add(V(0, 0.35, 0)).normalize();
    if (n.dot(out) < 0) n.negate();
    const want = out.clone().multiplyScalar(0.4).add(V(0, -sp.droop, 0)).add(V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(0.7)).normalize();
    const u = want.clone().sub(n.clone().multiplyScalar(want.dot(n)));
    if (u.lengthSq() < 1e-4) u.set(0, 1, 0).sub(n.clone().multiplyScalar(n.y));
    u.normalize();
    const bent = out.clone().multiplyScalar(0.72).addScaledVector(n, 0.28).normalize();
    // colour: darker inside, lighter and yellower toward the sunlit outside / top; some young coppery leaves
    const up = clamp01((c.y - (cc.y - sp.crown.ry)) / (2 * sp.crown.ry));
    let h = sp.hue + rand(-0.02, 0.02);
    let s = sp.sat + rand(-0.08, 0.08);
    let l = sp.light * (0.72 + 0.28 * f + 0.2 * up) + rand(-0.03, 0.04);
    if (rng() < 0.12) {
      h -= 0.03;
      l += 0.05;
    }
    if (rng() < sp.young) {
      h = 0.07;
      s = 0.5;
      l = sp.light * 1.2;
    }
    tmpC.setHSL(h, s, l, THREE.SRGBColorSpace);
    cards.push({ c, n, u, bent, s: sp.card * rand(0.8, 1.2), col: tmpC.clone(), cell: sp.cell[Math.floor(rng() * sp.cell.length)], flut: rand(0.5, 1) });
  }

  const g = bark.geometry();
  const out: TreeBuild = {
    id,
    bark: g,
    barkTris: bark.tris(),
    cards,
    crown: sp.crown,
    trunkRadiusAt: rAt,
    trunkAxisAt: axisAt,
    limbPoint,
    height: sp.crown.cy + sp.crown.ry,
  };
  return out;
}

const treeCache = new Map<string, TreeBuild>();
export function tree(id: TreeId, seed = 1): TreeBuild {
  const key = `${id}:${seed}`;
  let t = treeCache.get(key);
  if (!t) treeCache.set(key, (t = growTree(id, seed)));
  return t;
}

export type Placed = { tree: TreeBuild; x: number; y: number; z: number; rot: number; scale: number };

/**
 * All cards of the given trees as ONE indexed geometry: position, normal (bent outward), color, uv (atlas),
 * aCentre (card centre, for the flutter) and aFlut. Cards are interleaved between trees and each tree's cards are
 * in random order, so drawing only a leading fraction (setDrawRange, for lite devices) thins every tree evenly.
 */
export function leafGeometry(items: Placed[]): THREE.BufferGeometry {
  const order: { it: Placed; card: Card }[] = [];
  const most = Math.max(0, ...items.map((i) => i.tree.cards.length));
  for (let k = 0; k < most; k++) for (const it of items) if (k < it.tree.cards.length) order.push({ it, card: it.tree.cards[k] });
  const n = order.length;
  const pos = new Float32Array(n * 12);
  const nor = new Float32Array(n * 12);
  const col = new Float32Array(n * 12);
  const uv = new Float32Array(n * 8);
  const cen = new Float32Array(n * 12);
  const fl = new Float32Array(n * 4);
  const idx = new Uint32Array(n * 6);
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const v = V();
  order.forEach(({ it, card }, i) => {
    q.setFromAxisAngle(V(0, 1, 0), it.rot);
    m.compose(V(it.x, it.y, it.z), q, V(it.scale, it.scale, it.scale));
    const side = V().crossVectors(card.n, card.u);
    const cw = card.c.clone().applyMatrix4(m);
    const bn = card.bent.clone().applyQuaternion(q);
    for (let k = 0; k < 4; k++) {
      const x = k === 1 || k === 2 ? 1 : 0;
      const y = k >= 2 ? 1 : 0;
      v.copy(card.c).addScaledVector(side, (x - 0.5) * card.s).addScaledVector(card.u, (y - 0.3) * card.s).applyMatrix4(m);
      const o = i * 4 + k;
      pos.set([v.x, v.y, v.z], o * 3);
      nor.set([bn.x, bn.y, bn.z], o * 3);
      col.set([card.col.r, card.col.g, card.col.b], o * 3);
      cen.set([cw.x, cw.y, cw.z], o * 3);
      uv.set(atlasUv(card.cell, x, y), o * 2);
      fl[o] = card.flut;
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setAttribute("aCentre", new THREE.BufferAttribute(cen, 3));
  g.setAttribute("aFlut", new THREE.BufferAttribute(fl, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ leaf atlas (generated, no photo)

type LeafDef = { ang: number; pet: number; len: number };
type Shape = "peepal" | "broad" | "ashoka";
const CLUSTERS: { shape: Shape; leaves: LeafDef[]; wide: number }[] = [
  // 0: peepal cluster, long petioles, 5 heart-shaped leaves with drip tips
  { shape: "peepal", wide: 1, leaves: [[-58, 0.2, 0.34], [58, 0.2, 0.34], [-22, 0.24, 0.36], [22, 0.24, 0.36], [0, 0.26, 0.4]].map(([a, p, l]) => ({ ang: (a * Math.PI) / 180, pet: p, len: l })) },
  // 1: a generic broadleaf twig: oval leaves with a short point
  { shape: "broad", wide: 1, leaves: [[-62, 0.05, 0.4], [62, 0.05, 0.4], [-34, 0.09, 0.45], [34, 0.09, 0.45], [0, 0.12, 0.5]].map(([a, p, l]) => ({ ang: (a * Math.PI) / 180, pet: p, len: l })) },
  // 2: ashoka: long, narrow, rippled leaves in a drooping fan
  { shape: "ashoka", wide: 1, leaves: [[-36, 0.03, 0.68], [-24, 0.03, 0.76], [-12, 0.03, 0.82], [0, 0.03, 0.86], [12, 0.03, 0.82], [24, 0.03, 0.76], [36, 0.03, 0.68]].map(([a, p, l]) => ({ ang: (a * Math.PI) / 180, pet: p, len: l })) },
  // 3: peepal, smaller and denser (young shoots)
  { shape: "peepal", wide: 1, leaves: [[-62, 0.14, 0.28], [62, 0.14, 0.28], [-34, 0.2, 0.3], [34, 0.2, 0.3], [0, 0.26, 0.34]].map(([a, p, l]) => ({ ang: (a * Math.PI) / 180, pet: p, len: l })) },
];

/** Half width of a leaf (in leaf lengths) at t = 0 (base) .. 1 (tip); 0 outside. */
function halfWidth(shape: Shape, t: number): number {
  if (t < -0.05 || t > 1) return 0;
  if (shape === "peepal") {
    // broad heart: widest low down, rounded lobes under the base, then a long concave drip tip
    const tb = 0.3;
    const W = 0.36;
    if (t < tb) {
      const x = (tb - t) / (tb + 0.05);
      let w = W * Math.sqrt(Math.max(0, 1 - x * x));
      if (t < 0.05) w *= 0.6 + 0.4 * (t + 0.05) * 10 * 0.5; // the notch where the petiole joins
      return w;
    }
    // ovate shoulders narrowing smoothly into a long drip tip
    const s = (t - tb) / (1 - tb);
    return W * Math.pow(1 - s, 1.1) * (1 - s * s * s);
  }
  if (shape === "broad") return t < 0 ? 0 : 0.22 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.82)), 0.85);
  // ashoka: very narrow, wavy margin
  return t < 0 ? 0 : 0.058 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.7) * (1 + 0.14 * Math.sin(t * 46));
}

/** RGBA pixels (size x size, row 0 = v 0) of the 2x2 leaf atlas. Neutral grey-green shading; the card's vertex colour tints it. */
export function leafAtlasPixels(size = 512): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const cell = size / 2;
  for (let i = 0; i < size * size; i++) px.set([200, 205, 190, 0], i * 4);
  const rng = seeded(4242);
  CLUSTERS.forEach((cl, ci) => {
    const x0 = (ci % 2) * cell;
    const y0 = Math.floor(ci / 2) * cell;
    const jitter = cl.leaves.map(() => 0.9 + rng() * 0.2);
    const org = { x: 0.5, y: 0.05 };
    for (let py = 0; py < cell; py++)
      for (let pxl = 0; pxl < cell; pxl++) {
        const X = (pxl + 0.5) / cell;
        const Y = (py + 0.5) / cell;
        let r = 200, g = 205, b = 190, a = 0;
        cl.leaves.forEach((lf, li) => {
          const sa = Math.sin(lf.ang);
          const ca = Math.cos(lf.ang);
          const bx = org.x + sa * lf.pet;
          const by = org.y + ca * lf.pet;
          // petiole: a thin capsule from the cluster origin to the leaf base
          {
            const vx = bx - org.x;
            const vy = by - org.y;
            const tt = clamp01(((X - org.x) * vx + (Y - org.y) * vy) / (vx * vx + vy * vy));
            const dd = Math.hypot(X - org.x - vx * tt, Y - org.y - vy * tt);
            const cov = clamp01((0.006 - dd) * cell + 0.5);
            if (cov > a) {
              r = 150; g = 160; b = 120; a = cov;
            }
          }
          const dx = X - bx;
          const dy = Y - by;
          const t = (dx * sa + dy * ca) / lf.len;
          const u = (dx * ca - dy * sa) / lf.len;
          const hw = halfWidth(cl.shape, t);
          if (hw <= 0) return;
          const dist = (hw - Math.abs(u)) * lf.len;
          let cov = clamp01(dist * cell + 0.5);
          cov *= clamp01(((t + 0.05) * lf.len) * cell + 0.5);
          if (cov <= 0) return;
          // shading: darker base, brighter tip, light midrib, faint side veins, darker rim
          let sh = (0.78 + 0.16 * t) * jitter[li];
          const au = Math.abs(u);
          if (au < 0.013) sh += 0.14;
          const vein = Math.abs(Math.sin((t * 11 - au * 7) * Math.PI));
          if (au > 0.02 && vein < 0.12) sh += 0.05;
          sh *= 0.9 + 0.1 * clamp01(dist * lf.len * cell * 0.5);
          sh = Math.min(1, sh);
          const lr = 255 * sh * 0.97;
          const lg = 255 * sh;
          const lb = 255 * sh * 0.9;
          if (a > cov) {
            r += (lr - r) * cov;
            g += (lg - g) * cov;
            b += (lb - b) * cov;
          } else {
            r = lr; g = lg; b = lb; a = cov;
          }
        });
        const o = ((y0 + py) * size + x0 + pxl) * 4;
        px[o] = r;
        px[o + 1] = g;
        px[o + 2] = b;
        px[o + 3] = Math.round(a * 255);
      }
  });
  return px;
}
