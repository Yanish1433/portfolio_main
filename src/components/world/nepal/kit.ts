// Procedural Newari architecture kit (pure geometry builders, no React).
// Each builder works in local space with its front facing +z, returns Parts
// (per-material geometry) plus anchors for instanced props (bells, diyos,
// lanterns, garlands). Results are cached by their props.
import * as THREE from "three";
import { Parts, T, beam, box, hipRoof, lathe, plane, seeded } from "./geom";
import { PALACE } from "../zones";

export const COL = {
  brick: "#ffffff",
  brickDark: "#86584c",
  brickWarm: "#f2d6c8",
  wood: "#6b4a36",
  woodDark: "#4a3022",
  stone: "#a39d92",
  stoneDark: "#857f76",
  plaster: "#efe4d0",
  dark: "#1b110c",
  gold: "#ffffff",
  bronze: "#b98a52",
  red: "#b3261e",
  saffron: "#e0761c",
  marigold: "#f39a1b",
};

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export type Anchors = {
  bells: THREE.Vector3[];
  diyos: THREE.Vector3[];
  lanterns: THREE.Vector3[];
  garlands: { a: THREE.Vector3; b: THREE.Vector3; drop: number }[];
};

export type Built = { parts: Parts; anchors: Anchors; height: number };

const emptyAnchors = (): Anchors => ({ bells: [], diyos: [], lanterns: [], garlands: [] });

const cache = new Map<string, Built>();
function cached(key: string, make: () => Built): Built {
  let b = cache.get(key);
  if (!b) cache.set(key, (b = make()));
  return b;
}

/** Transform anchors by a matrix (into world space). */
export function transformAnchors(a: Anchors, m: THREE.Matrix4, into: Anchors) {
  for (const k of ["bells", "diyos", "lanterns"] as const) into[k].push(...a[k].map((p) => p.clone().applyMatrix4(m)));
  into.garlands.push(...a.garlands.map((g) => ({ a: g.a.clone().applyMatrix4(m), b: g.b.clone().applyMatrix4(m), drop: g.drop })));
}

// ---------------------------------------------------------------- windows

export type WindowKind = "jhyal" | "sai" | "door" | "shop";

/**
 * Carved window in local space (+z out of the wall, centred). Lattice in front,
 * a "window" glow plane behind it (lit at night when `lit` = 1), and a wooden
 * frame with the typical extended lintel and sill wings.
 */
export function windowParts(P: Parts, m: THREE.Matrix4, ww: number, wh: number, kind: WindowKind, lit: number) {
  const at = (x: number, y: number, z: number) => m.clone().multiply(T(x, y, z));
  P.add("window", plane(ww, wh), "#fff", at(0, 0, 0.012), lit);
  if (kind === "jhyal" || kind === "sai") P.add("lattice", plane(ww, wh, 1, true), "#fff", at(0, 0, 0.045));
  if (kind === "door") {
    // two wooden door leaves, slightly ajar look
    P.add("wood", box(ww / 2 - 0.03, wh - 0.04, 0.05), COL.woodDark, at(-ww / 4, 0, 0.03));
    P.add("wood", box(ww / 2 - 0.03, wh - 0.04, 0.05), COL.woodDark, at(ww / 4, 0, 0.02));
  }
  if (kind === "shop") {
    P.add("wood", box(ww, 0.5, 0.06), COL.woodDark, at(0, -wh / 2 + 0.25, 0.04)); // counter shutter
    P.add("wood", box(0.12, wh, 0.12), COL.wood, at(0, 0, 0.06)); // centre post
  }
  const t = kind === "sai" ? 0.12 : 0.09;
  P.add("wood", box(t, wh + 0.1, 0.12), COL.wood, at(-ww / 2 - t / 2, 0, 0.05));
  P.add("wood", box(t, wh + 0.1, 0.12), COL.wood, at(ww / 2 + t / 2, 0, 0.05));
  const wing = kind === "door" || kind === "shop" ? 0.3 : 0.55;
  P.add("wood", box(ww + wing, 0.12, 0.17), COL.wood, at(0, wh / 2 + 0.06, 0.07));
  if (kind !== "door" && kind !== "shop") P.add("wood", box(ww + wing - 0.1, 0.1, 0.19), COL.wood, at(0, -wh / 2 - 0.05, 0.08));
  if (kind === "sai") {
    // projecting bay window: hood, side cheeks, mullions and a carved apron
    P.add("wood", box(ww + 0.36, 0.09, 0.55), COL.woodDark, at(0, wh / 2 + 0.17, 0.24));
    P.add("wood", box(0.08, wh, 0.42), COL.wood, at(-ww / 2 - 0.1, 0, 0.24));
    P.add("wood", box(0.08, wh, 0.42), COL.wood, at(ww / 2 + 0.1, 0, 0.24));
    for (const x of [-ww / 6, ww / 6]) P.add("wood", box(0.07, wh, 0.08), COL.wood, at(x, 0, 0.08));
    P.add("wood", box(ww + 0.2, 0.3, 0.36), COL.wood, at(0, -wh / 2 - 0.22, 0.17));
  }
}

type Face = "front" | "back" | "left" | "right";
function faceMatrix(face: Face, w: number, d: number, x: number, y: number) {
  switch (face) {
    case "front":
      return T(x, y, d / 2);
    case "back":
      return T(-x, y, -d / 2, Math.PI);
    case "right":
      return T(w / 2, y, -x, Math.PI / 2);
    case "left":
      return T(-w / 2, y, x, -Math.PI / 2);
  }
}

/** Angled carved struts (tunala) from the wall up to the eave, along one side. */
function struts(P: Parts, side: Face, w: number, d: number, n: number, wallY: number, eaveY: number, reach: number, carved = false) {
  const span = side === "front" || side === "back" ? w : d;
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : -span / 2 + 0.25 + ((span - 0.5) * i) / (n - 1);
    const m = faceMatrix(side, w, d, x, 0);
    const a = V(0, wallY, 0.05).applyMatrix4(m);
    const b = V(0, eaveY, reach).applyMatrix4(m);
    // thin carved struts sit under the eave, already in shade: they skip the shadow pass
    P.small(() => P.add("wood", beam(a, b, 0.09, 0.16), i % 2 ? COL.wood : COL.woodDark));
    if (carved) {
      // carved strut: a gilded knop between wall and eave
      P.small(() => {
      });
    }
  }
}

// ---------------------------------------------------------------- house

export type HouseOpts = { w: number; d: number; floors: number; seed: number; ornate?: boolean; shop?: boolean; ghar?: boolean };

const GROUND_H = 2.3;
const FLOOR_H = [2.0, 1.9, 1.8, 1.7];

/**
 * The carved photo window of "Yanish's Ghar", in the house's local space (front = +z): an
 * ankhijhyal-style frame whose middle holds the photo, drawn by nepal/Ghar.tsx as one quad.
 */
export function gharWindow(o: Pick<HouseOpts, "d" | "floors">) {
  const f = o.floors - 1;
  const y = GROUND_H + FLOOR_H.slice(0, f - 1).reduce((a, b) => a + b, 0) + FLOOR_H[f - 1] * 0.5;
  return { y, z: o.d / 2, frameW: 1.3, frameH: 1.2, photoW: 0.9, photoH: 1.0, photoZ: 0.075 };
}

/** The Ghar's extras: carved window hood and bead, doorway lamp and garland, potted plants, doormat. */
function gharDetails(P: Parts, A: Anchors, o: HouseOpts) {
  const { w, d } = o;
  const win = gharWindow(o);
  const m = faceMatrix("front", w, d, 0, win.y);
  const at = (x: number, y: number, z: number) => m.clone().multiply(T(x, y, z));
  const { frameW: fw, frameH: fh, photoW: pw, photoH: ph, photoZ: pz } = win;
  // carved hood over the window, with two little brackets, and a deeper apron under it
  P.add("wood", box(fw + 0.55, 0.09, 0.4), COL.woodDark, at(0, fh / 2 + 0.2, 0.22));
  for (const s of [-1, 1]) P.add("wood", box(0.07, 0.2, 0.3), COL.wood, at(s * (fw / 2 + 0.12), fh / 2 + 0.05, 0.16));
  P.add("wood", box(fw + 0.3, 0.2, 0.26), COL.wood, at(0, -fh / 2 - 0.2, 0.15));
  // a gold bead round the photo
  P.small(() => {
    P.add("gold", box(pw + 0.08, 0.04, 0.03), COL.gold, at(0, ph / 2 + 0.02, pz - 0.005));
    P.add("gold", box(pw + 0.08, 0.04, 0.03), COL.gold, at(0, -ph / 2 - 0.02, pz - 0.005));
    P.add("gold", box(0.04, ph, 0.03), COL.gold, at(-pw / 2 - 0.02, 0, pz - 0.005));
    P.add("gold", box(0.04, ph, 0.03), COL.gold, at(pw / 2 + 0.02, 0, pz - 0.005));
  });
  // the doorway lamp (an instanced lantern, glow and flicker come from nepal/Props.tsx) and a marigold garland
  A.lanterns.push(V(0, 2.12, d / 2 + 0.3));
  A.garlands.push({ a: V(-0.72, 1.84, d / 2 + 0.18), b: V(0.72, 1.84, d / 2 + 0.18), drop: 0.2 });
  A.diyos.push(V(-w / 2 + 0.3, 0.18, d / 2 + 0.38));
  // potted plants on the step, either side of the door
  P.small(() => {
    for (const [x, leaf, bloom] of [[-1.05, "#4f7f3a", "#f39a1b"], [1.05, "#5f8f3c", "#e0761c"]] as const) {
      P.add("clay", new THREE.CylinderGeometry(0.17, 0.12, 0.26, 8), "#b0643c", T(x, 0.31, d / 2 + 0.3));
      P.add("plain", new THREE.IcosahedronGeometry(0.27, 0), leaf, T(x, 0.62, d / 2 + 0.3));
      P.add("plain", new THREE.IcosahedronGeometry(0.19, 0), leaf, T(x + 0.1, 0.84, d / 2 + 0.34));
      for (const [dx, dy, dz] of [[-0.12, 0.92, 0.07], [0.16, 0.76, 0.12], [0.02, 1.02, -0.04]] as const)
        P.add("plain", new THREE.IcosahedronGeometry(0.06, 0), bloom, T(x + dx, dy, d / 2 + 0.3 + dz));
    }
    // doormat at the foot of the step: red with a saffron border
    P.box("plain", 1.15, 0.03, 0.7, 0, 0.015, d / 2 + 0.9, "#d9a21b");
    P.box("plain", 1.0, 0.04, 0.55, 0, 0.02, d / 2 + 0.9, "#8e2f26");
  });
}

/**
 * Shopfront dressing on a house's front wall (matrix m = the wall's centre at y 0): open painted shutter
 * leaves either side, a half-rolled shutter slat set, a striped cloth awning on two poles and a hanging lamp.
 */
function shopFront(P: Parts, A: Anchors, m: THREE.Matrix4, sw: number, r: () => number) {
  const at = (x: number, y: number, z: number, ry = 0) => m.clone().multiply(T(x, y, z, ry));
  const paint = ["#2f6f8f", "#3f7a3a", "#8e2f26", "#c8981f"][Math.floor(r() * 4)];
  for (const s of [-1, 1]) {
    // each leaf is a framed board swung open about 70 degrees from the jamb
    P.add("wood", box(0.5, 1.6, 0.05), paint, at(s * (sw / 2 + 0.09), 1.0, 0.3, s * 1.15));
    P.small(() => P.add("wood", box(0.5, 0.06, 0.07), COL.woodDark, at(s * (sw / 2 + 0.09), 1.5, 0.3, s * 1.15)));
  }
  // rolled-down slats over the upper part of the opening
  for (let i = 0; i < 4; i++) P.small(() => P.add("wood", box(sw, 0.05, 0.05), i % 2 ? COL.wood : COL.woodDark, at(0, 1.86 - i * 0.07, 0.08)));
  // awning
  const stripes = 6;
  const c1 = paint;
  const slope = Math.atan2(0.4, 0.95);
  for (let i = 0; i < stripes; i++) {
    const g = plane(sw / stripes + 0.15 / stripes + 0.003, 1.0).rotateX(-(Math.PI / 2 - slope));
    P.add("cloth", g, i % 2 ? "#f1e6c8" : c1, at(-sw / 2 - 0.075 + ((i + 0.5) * (sw + 0.15)) / stripes, 2.2, 0.55));
  }
  for (const s of [-1, 1]) P.small(() => P.add("wood", beam(V(0, 0, 0), V(0, 2.0, 0), 0.07), COL.wood, at(s * (sw / 2 + 0.05), 0, 0.98)));
  A.lanterns.push(V(0, 1.95, 0.9).applyMatrix4(m));
}

export function buildHouse(o: HouseOpts): Built {
  return cached(`house:${JSON.stringify(o)}`, () => {
    const P = new Parts();
    const A = emptyAnchors();
    const r = seeded(o.seed * 7919);
    const { w, d } = o;
    const ys = [0, GROUND_H];
    for (let i = 0; i < o.floors - 1; i++) ys.push(ys[ys.length - 1] + FLOOR_H[i]);
    const H = ys[ys.length - 1];
    const tone = 0.88 + r() * 0.16;
    const tint = new THREE.Color(tone, tone * (0.97 + r() * 0.05), tone * (0.95 + r() * 0.06));
    P.box("brick", w, H, d, 0, H / 2, 0, tint);
    P.box("plain", w + 0.3, 0.18, 0.55, 0, 0.09, d / 2 + 0.27, COL.stone); // front step
    for (let i = 1; i < ys.length - 1; i++) P.box("brick", w + 0.08, 0.15, d + 0.08, 0, ys[i], 0, COL.brickDark);
    P.box("brick", w + 0.06, 0.4, d + 0.06, 0, 0.2, 0, COL.brickDark); // plinth course
    P.box("wood", w + 0.12, 0.2, d + 0.12, 0, H - 0.1, 0, COL.woodDark); // cornice

    // ground floor
    const gy = 1.05;
    if (o.shop) {
      const sw = Math.min(w * 0.6, 2.6);
      windowParts(P, faceMatrix("front", w, d, 0, gy), sw, 1.7, "shop", 1);
      shopFront(P, A, faceMatrix("front", w, d, 0, 0), sw, r);
    } else {
      // the Ghar's doorway always glows at night
      windowParts(P, faceMatrix("front", w, d, 0, 0.95), 0.9, 1.7, "door", o.ghar ? 1 : r() > 0.5 ? 1 : 0);
      if (w > 3.2)
        for (const x of [-w * 0.32, w * 0.32]) windowParts(P, faceMatrix("front", w, d, x, 1.3), 0.5, 0.6, "jhyal", r() < 0.6 ? 1 : 0);
    }
    // upper floors
    for (let f = 1; f < o.floors; f++) {
      const y = ys[f] + FLOOR_H[f - 1] * 0.5;
      const top = f === o.floors - 1;
      const saiFloor = o.ornate && f === Math.min(2, o.floors - 1);
      if (o.ghar && top) {
        const g = gharWindow(o);
        windowParts(P, faceMatrix("front", w, d, 0, g.y), g.frameW, g.frameH, "jhyal", 1);
      } else if (saiFloor) {
        const sw = Math.min(2.4, w * 0.5);
        windowParts(P, faceMatrix("front", w, d, 0, y), sw, 0.95, "sai", r() < 0.6 ? 1 : 0);
        for (const x of [-(sw / 2 + (w / 2 - sw / 2) / 2), sw / 2 + (w / 2 - sw / 2) / 2])
          if (w / 2 - sw / 2 > 0.7) windowParts(P, faceMatrix("front", w, d, x, y), 0.5, 0.75, "jhyal", r() < 0.6 ? 1 : 0);
      } else {
        const n = Math.max(1, Math.floor(w / 1.35));
        const ww = top ? 0.62 : 0.55;
        const wh = top ? 0.6 : 0.8;
        for (let i = 0; i < n; i++) {
          const x = -w / 2 + (w * (i + 0.5)) / n;
          windowParts(P, faceMatrix("front", w, d, x, y), ww, wh, "jhyal", r() < 0.6 ? 1 : 0);
        }
      }
      for (const face of ["left", "right", "back"] as Face[]) {
        const span = face === "back" ? w : d;
        const n = Math.max(1, Math.floor(span / 2));
        for (let i = 0; i < n; i++) {
          const x = -span / 2 + (span * (i + 0.5)) / n;
          windowParts(P, faceMatrix(face, w, d, x, y), 0.5, 0.65, "jhyal", r() < 0.5 ? 1 : 0);
        }
      }
    }
    // roof with deep overhang + struts
    const ov = 0.85;
    const rise = 1.25;
    const roof = hipRoof(w + 2 * ov, d + 2 * ov, w * 0.45, 0.12, rise, 0.08, [w, d]);
    const base = H - roof.yIn;
    P.add("roof", roof.top, "#fff", T(0, base, 0));
    P.add("wood", roof.under, COL.woodDark, T(0, base, 0));
    const eaveUnder = base + roof.yIn + (-0.1 - roof.yIn) * 0.8;
    struts(P, "front", w, d, Math.round(w / 0.8) + 1, H - 0.85, eaveUnder, ov * 0.8);
    struts(P, "back", w, d, Math.round(w / 1.2) + 1, H - 0.85, eaveUnder, ov * 0.8);
    struts(P, "left", w, d, 2, H - 0.85, eaveUnder, ov * 0.8);
    struts(P, "right", w, d, 2, H - 0.85, eaveUnder, ov * 0.8);
    if (o.ghar) gharDetails(P, A, o);
    // a pot or two by the door
    if (r() > 0.4) A.diyos.push(V(w / 2 - 0.35, 0.18, d / 2 + 0.35));
    return { parts: P, anchors: A, height: base + rise };
  });
}

// ---------------------------------------------------------------- guardians

export type GuardianKind = "wrestler" | "elephant" | "lion" | "griffin" | "goddess";
export const GUARDIAN_ORDER: GuardianKind[] = ["wrestler", "elephant", "lion", "griffin", "goddess"];

/** Abstract stone guardian silhouette (no faces). Faces +z, sits on y=0. */
export function guardian(P: Parts, kind: GuardianKind, m: THREE.Matrix4) {
  const S = COL.stone;
  const SD = COL.stoneDark;
  const at = (x: number, y: number, z: number, ry = 0) => m.clone().multiply(T(x, y, z, ry));
  P.add("plain", box(0.5, 0.14, 0.6), SD, at(0, 0.07, 0));
  switch (kind) {
    case "wrestler": {
      for (const x of [-0.1, 0.1]) P.add("plain", box(0.12, 0.42, 0.14), S, at(x, 0.35, 0));
      P.add("plain", box(0.36, 0.42, 0.22), S, at(0, 0.76, 0));
      P.add("plain", new THREE.SphereGeometry(0.12, 8, 6), S, at(0, 1.09, 0));
      P.add("plain", beam(V(0.2, 0.9, 0), V(0.26, 0.55, 0.16), 0.08), S, m);
      P.add("plain", beam(V(-0.2, 0.9, 0), V(-0.2, 0.62, 0.18), 0.08), S, m);
      P.add("plain", beam(V(-0.2, 0.62, 0.18), V(-0.2, 1.25, 0.24), 0.05), SD, m); // staff
      break;
    }
    case "elephant": {
      P.add("plain", box(0.36, 0.34, 0.5), S, at(0, 0.5, -0.04));
      for (const [x, z] of [[-0.12, 0.14], [0.12, 0.14], [-0.12, -0.2], [0.12, -0.2]])
        P.add("plain", new THREE.CylinderGeometry(0.06, 0.07, 0.34, 6), S, at(x, 0.3, z));
      P.add("plain", box(0.28, 0.26, 0.2), S, at(0, 0.66, 0.26));
      for (const x of [-0.17, 0.17]) P.add("plain", box(0.05, 0.22, 0.16), SD, at(x, 0.66, 0.22));
      P.add("plain", beam(V(0, 0.6, 0.36), V(0, 0.2, 0.44), 0.07), S, m); // trunk
      break;
    }
    case "lion":
    case "griffin": {
      P.add("plain", box(0.32, 0.3, 0.42), S, at(0, 0.3, -0.06)); // haunches
      P.add("plain", box(0.28, 0.42, 0.22), S, at(0, 0.5, 0.12)); // chest
      for (const x of [-0.09, 0.09]) P.add("plain", box(0.08, 0.3, 0.08), S, at(x, 0.29, 0.22));
      P.add("plain", box(0.32, 0.3, 0.26), SD, at(0, 0.82, 0.14)); // mane
      P.add("plain", box(0.2, 0.18, 0.14), S, at(0, 0.8, 0.3)); // muzzle
      if (kind === "griffin") {
        for (const s of [-1, 1]) P.add("plain", box(0.04, 0.4, 0.34), SD, at(s * 0.19, 0.66, -0.06));
        P.add("plain", new THREE.ConeGeometry(0.06, 0.16, 5).rotateX(Math.PI / 2), SD, at(0, 0.76, 0.42));
      }
      break;
    }
    case "goddess": {
      P.add("plain", new THREE.CylinderGeometry(0.1, 0.24, 0.6, 8), S, at(0, 0.44, 0));
      P.add("plain", box(0.24, 0.3, 0.16), S, at(0, 0.88, 0));
      P.add("plain", new THREE.SphereGeometry(0.1, 8, 6), S, at(0, 1.12, 0));
      P.add("plain", new THREE.ConeGeometry(0.08, 0.18, 6), SD, at(0, 1.27, 0));
      for (const s of [-1, 1]) P.add("plain", beam(V(s * 0.13, 1.0, 0), V(s * 0.2, 0.74, 0.12), 0.06), S, m);
      P.add("plain", box(0.44, 0.05, 0.05), SD, at(0, 1.02, -0.1)); // halo bar (abstract)
      break;
    }
  }
}

// ---------------------------------------------------------------- pagoda

export type PagodaOpts = { tiers: number; steps: number; base: number; guardians?: boolean };

/**
 * Tiered Newar pagoda on a stepped brick plinth with front stairs. Stacked hip
 * roofs with a slight eave lift, carved struts, bells along the eaves and a
 * golden gajur on top.
 */
export function buildPagoda(o: PagodaOpts): Built {
  return cached(`pagoda:${JSON.stringify(o)}`, () => {
    const P = new Parts();
    const A = emptyAnchors();
    const { tiers, steps, base } = o;
    const big = tiers >= 4;
    const top = big ? base * 0.5 : base * 0.62;
    const inset = steps > 1 ? (base - top) / (steps - 1) / 2 : 0;
    // plinth
    let y = 0;
    const stepH: number[] = [];
    const widths: number[] = [];
    for (let i = 0; i < steps; i++) {
      const wi = base - i * inset * 2;
      const hi = (big ? 1.0 : 0.62) - i * 0.06;
      widths.push(wi);
      stepH.push(hi);
      P.box("brick", wi, hi, wi, 0, y + hi / 2, 0, i % 2 ? COL.brick : COL.brickWarm);
      P.box("plain", wi + 0.05, 0.07, wi + 0.05, 0, y + hi - 0.02, 0, COL.stone);
      // diyos on the exposed ledge of this step
      const ledge = i < steps - 1 ? (wi - inset) / 2 : wi / 2 - 0.25;
      const n = Math.max(2, Math.floor((ledge * 2) / 1.15));
      for (let k = 0; k <= n; k++) {
        const t = -ledge + (2 * ledge * k) / n;
        for (const [px, pz] of [
          [t, ledge],
          [t, -ledge],
          [ledge, t],
          [-ledge, t],
        ]) {
          if (pz > 0 && Math.abs(px) < 0.95 && Math.abs(pz - ledge) < 0.01) continue; // stairs
          A.diyos.push(V(px, y + hi + 0.02, pz));
        }
      }
      y += hi;
    }
    const plinthTop = y;
    // stairs on the front, cut through the steps
    const stairW = big ? 1.5 : 1.1;
    const zStart = base / 2 + 0.55;
    const zEnd = top / 2;
    const nSteps = Math.max(3, Math.round(plinthTop / 0.2));
    const run = (zStart - zEnd) / nSteps;
    for (let k = 0; k < nSteps; k++) {
      const h = (plinthTop * (k + 1)) / nSteps;
      P.box("plain", stairW, h, run + 0.01, 0, h / 2, zStart - k * run - run / 2, k % 2 ? COL.stone : COL.stoneDark);
    }
    // stair cheeks (brick) for the guardians to stand on
    for (const s of [-1, 1]) {
      for (let i = 0; i < steps; i++) {
        const zf = widths[i] / 2 + (i === 0 ? 0.55 : 0);
        const yTop = stepH.slice(0, i + 1).reduce((a, b) => a + b, 0);
        P.box("brick", 0.55, yTop, 0.6, s * (stairW / 2 + 0.27), yTop / 2, zf - 0.3, COL.brickWarm);
        if (o.guardians) {
          const kind = GUARDIAN_ORDER[i % GUARDIAN_ORDER.length];
          const sc = o.tiers >= 4 ? 0.82 + i * 0.07 : 0.95 - i * 0.05; // Nyatapola's guardians grow stronger up the stair
          guardian(P, kind, T(s * (stairW / 2 + 0.27), yTop, zf - 0.3, 0, sc));
        }
      }
    }

    // temple body and roofs
    let wallBase = plinthTop;
    let size = big ? top * 0.66 : top * 0.68;
    let roofTop = 0;
    for (let k = 0; k < tiers; k++) {
      const wallH = k === 0 ? (big ? 2.0 : 1.6) : big ? 1.2 - k * 0.05 : 0.85;
      const last = k === tiers - 1;
      P.box("brick", size, wallH + 0.3, size, 0, wallBase + (wallH + 0.3) / 2 - 0.3 * (k > 0 ? 1 : 0), 0, k === 0 ? COL.brick : COL.brickWarm);
      P.box("wood", size + 0.08, 0.16, size + 0.08, 0, wallBase + wallH - 0.08, 0, COL.woodDark);
      if (k === 0) {
        // doors on all four sides with a golden torana above the front one
        for (const face of ["front", "back", "left", "right"] as Face[]) {
          const m = faceMatrix(face, size, size, 0, wallBase + 0.75);
          windowParts(P, m, 0.62, 1.3, "door", face === "front" ? 1 : 0);
          if (face === "front") {
            const tor = new THREE.CircleGeometry(0.42, 14, 0, Math.PI);
            P.add("gold", tor, COL.gold, m.clone().multiply(T(0, 0.73, 0.08)));
            A.garlands.push({ a: V(-0.5, 1.42, 0.12).applyMatrix4(m), b: V(0.5, 1.42, 0.12).applyMatrix4(m), drop: 0.18 });
            A.lanterns.push(V(0, 0.1, 0.5).applyMatrix4(m));
          }
        }
      } else {
        for (const face of ["front", "back", "left", "right"] as Face[])
          windowParts(P, faceMatrix(face, size, size, 0, wallBase + wallH * 0.5), size * 0.35, wallH * 0.55, "jhyal", face === "front" ? 1 : 0);
      }
      const ov = (big ? 1.05 : 0.85) - k * 0.07;
      const next = last ? 0.28 : size * 0.8;
      const rise = (big ? 1.1 : 0.85) - k * 0.05;
      const eave = size + 2 * ov;
      const roof = hipRoof(eave, eave, next, next, rise, 0.12, [size, size]);
      const rb = wallBase + wallH - roof.yIn;
      P.add("roof", roof.top, k % 2 ? "#e8d8d0" : "#ffffff", T(0, rb, 0));
      P.add("wood", roof.under, COL.woodDark, T(0, rb, 0));
      const eaveUnder = rb + roof.yIn + (-0.1 - roof.yIn) * 0.8;
      const ns = Math.max(2, Math.round(size / 0.5));
      for (const face of ["front", "back", "left", "right"] as Face[])
        struts(P, face, size, size, ns, wallBase + wallH - 0.85 * (k === 0 ? 1 : 0.7), eaveUnder, ov * 0.8, big);
      // bells along the eave edge (corners + every ~0.6 m)
      const he = eave / 2;
      const nb = Math.max(2, Math.round(eave / 0.6));
      for (let i = 0; i <= nb; i++) {
        const t = -he + (eave * i) / nb;
        const lift = 0.12 * (Math.abs(t) / he) ** 2;
        for (const [bx, bz] of [
          [t, he],
          [t, -he],
          [he, t],
          [-he, t],
        ]) {
          if (i === 0 || i === nb) {
            if (bz !== he && bz !== -he) continue; // corners only once
          }
          A.bells.push(V(bx, rb - 0.14 + lift, bz));
        }
      }
      if (big) {
        // gilded trim along the eave edge, bronze hip ridges, up-turned corner horns with a hanging bell,
        // and (on the lower tiers) a lantern at each corner that glows at night
        const eaveY = rb + 0.03;
        P.small(() => {
          for (const [ax, az, bx2, bz2] of [[-he, he, he, he], [-he, -he, he, -he], [he, -he, he, he], [-he, -he, -he, he]] as const) {
            const mx = (ax + bx2) / 2;
            const mz = (az + bz2) / 2;
            P.add("gold", beam(V(ax, eaveY + 0.14, az), V(mx, eaveY + 0.03, mz), 0.06, 0.1), COL.bronze);
            P.add("gold", beam(V(mx, eaveY + 0.03, mz), V(bx2, eaveY + 0.14, bz2), 0.06, 0.1), COL.bronze);
          }
          for (const [hx, hz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
            const corner = V(hx * he, eaveY + 0.14, hz * he);
            const apex = V(hx * (next / 2 + 0.05), rb + rise - 0.03, hz * (next / 2 + 0.05));
            P.add("gold", beam(corner, apex, 0.09, 0.09), "#8a7048");
            P.add("gold", new THREE.ConeGeometry(0.075, 0.34, 6).rotateX(-0.5 * hz).rotateZ(0.5 * hx).translate(corner.x + hx * 0.1, corner.y + 0.16, corner.z + hz * 0.1), COL.bronze);
            P.add("gold", lathe([[0, 0], [0.075, 0.07], [0.06, 0.12], [0, 0.14]], 5), COL.bronze, T(corner.x + hx * 0.2, corner.y - 0.2, corner.z + hz * 0.2));
            if (k < 3) A.lanterns.push(V(corner.x + hx * 0.2, corner.y - 0.6, corner.z + hz * 0.2));
          }
        });
      }
      roofTop = rb + rise;
      wallBase = rb + rise * 0.72;
      size = next;
    }
    // golden gajur finial (a stack of flared discs under a pointed bud) + a golden pataka ribbon down the front of the top roof
    const gp: [number, number][] = [[0, 0], [0.3, 0], [0.34, 0.08], [0.2, 0.18], [0.0, 0.2]];
    let gy = 0.2;
    for (let i = 0; i < 6; i++) {
      const rr = 0.3 - i * 0.04;
      gp.push([rr * 0.5, gy], [rr, gy + 0.03], [rr * 0.9, gy + 0.07], [rr * 0.4, gy + 0.1]);
      gy += 0.13;
    }
    gp.push([0.17, gy + 0.04], [0.2, gy + 0.2], [0.1, gy + 0.36], [0.12, gy + 0.46], [0.04, gy + 0.62], [0, gy + 0.9]);
    const k0 = big ? 1 : 0.75;
    const g = lathe(gp.map(([rr, yy]) => [rr * k0, yy * k0]) as [number, number][], 10);
    P.add("gold", g, COL.gold, T(0, roofTop - 0.02, 0));
    if (big) {
      P.add("gold", beam(V(0, roofTop - 0.1, 0.12), V(0, roofTop - 1.05, 1.0), 0.16, 0.02), COL.gold);
      // a thin banner on the finial
      P.add("cloth", plane(0.36, 0.9).translate(0.18, -0.45, 0), COL.red, T(0, roofTop + gy * k0 + 0.9, 0));
    }
    return { parts: P, anchors: A, height: roofTop + (big ? 2.4 : 1.05) };
  });
}

// ---------------------------------------------------------------- palace

export type PalaceOpts = { w: number; d: number };
/** The golden gate is centred, behind the pagoda; the project dalan wings flank it (halls/). */
export const PALACE_GATE_X = PALACE.gateX;

/** Long palace: dalan wall below, a gallery of ~55 carved windows on top, golden gate in the centre. */
export function buildPalace(o: PalaceOpts): Built {
  return cached(`palace:${JSON.stringify(o)}`, () => {
    const P = new Parts();
    const A = emptyAnchors();
    const { w, d } = o;
    const r = seeded(55);
    const plinth = 0.45;
    const f0 = 2.7;
    const f1 = 2.2;
    const f2 = 2.1;
    const H = plinth + f0 + f1 + f2;
    P.box("plain", w + 0.5, plinth, d + 0.5, 0, plinth / 2, 0, COL.plaster);
    P.box("brick", w, H - plinth, d, 0, plinth + (H - plinth) / 2, 0, "#fff");
    P.box("brick", w + 0.1, 0.16, d + 0.1, 0, plinth + f0, 0, COL.brickDark);
    P.box("brick", w + 0.1, 0.16, d + 0.1, 0, plinth + f0 + f1, 0, COL.brickDark);
    P.box("wood", w + 0.14, 0.22, d + 0.14, 0, H - 0.11, 0, COL.woodDark);
    // ground floor: the dalan (halls/hallParts.ts) stands against this wall
    // first floor: evenly spaced carved windows
    const n1 = Math.floor(w / 1.45);
    for (let i = 0; i < n1; i++) {
      const x = -w / 2 + (w * (i + 0.5)) / n1;
      windowParts(P, faceMatrix("front", w, d, x, plinth + f0 + f1 * 0.5), 0.6, 0.85, i === Math.floor(n1 / 2) ? "sai" : "jhyal", r() < 0.6 ? 1 : 0);
      windowParts(P, faceMatrix("back", w, d, x, plinth + f0 + f1 * 0.5), 0.5, 0.7, "jhyal", 0);
    }
    // top floor: the long gallery of 55 narrow lattice windows
    const gy = plinth + f0 + f1 + f2 * 0.48;
    const gw = w - 0.8;
    const gh = 1.05;
    const count = 55;
    const cell = gw / count;
    const seg = 11;
    for (let i = 0; i < seg; i++) {
      const x = -gw / 2 + (gw * (i + 0.5)) / seg;
      P.add("window", plane(gw / seg, gh), "#fff", T(x, gy, d / 2 + 0.3), r() < 0.6 ? 1 : 0);
    }
    P.add("lattice", plane(gw, gh, 1, true), "#fff", T(0, gy, d / 2 + 0.34));
    for (let i = 0; i <= count; i++) P.add("wood", box(0.05, gh, 0.08), COL.wood, T(-gw / 2 + i * cell, gy, d / 2 + 0.36));
    P.add("wood", box(gw + 0.4, 0.12, 0.6), COL.woodDark, T(0, gy + gh / 2 + 0.06, d / 2 + 0.2));
    P.add("wood", box(gw + 0.3, 0.32, 0.5), COL.wood, T(0, gy - gh / 2 - 0.16, d / 2 + 0.17));
    // side windows
    for (const face of ["left", "right"] as Face[])
      for (const yy of [plinth + 1.5, plinth + f0 + f1 * 0.5, gy]) windowParts(P, faceMatrix(face, w, d, 0, yy), 0.55, 0.7, "jhyal", r() < 0.5 ? 1 : 0);
    // roof
    const ov = 1.0;
    const roof = hipRoof(w + 2 * ov, d + 2 * ov, w * 0.8, 0.15, 1.5, 0.12, [w, d]);
    const base = H - roof.yIn;
    P.add("roof", roof.top, "#fff", T(0, base, 0));
    P.add("wood", roof.under, COL.woodDark, T(0, base, 0));
    const eaveUnder = base + roof.yIn + (-0.1 - roof.yIn) * 0.8;
    struts(P, "front", w, d, 24, H - 0.9, eaveUnder, ov * 0.8);
    struts(P, "back", w, d, 16, H - 0.9, eaveUnder, ov * 0.8);
    struts(P, "left", w, d, 4, H - 0.9, eaveUnder, ov * 0.8);
    struts(P, "right", w, d, 4, H - 0.9, eaveUnder, ov * 0.8);
    // small gold finials along the ridge
    for (const x of [-w * 0.4, 0, w * 0.4])
      P.small(() => P.add("gold", lathe([[0, 0], [0.14, 0], [0.16, 0.12], [0.07, 0.3], [0.1, 0.4], [0, 0.65]], 8), COL.gold, T(x, base + 1.5, 0)));

    // Golden gate (simplified): brick frame, gilded door surround and torana, little roof.
    const gz = d / 2;
    const G = new Parts();
    const GA = emptyAnchors();
    G.box("brick", 3.4, 3.9, 0.6, 0, plinth + 1.95 - 0.45 + 0.45, gz + 0.3, COL.brickWarm);
    G.add("window", plane(1.3, 2.3), "#fff", T(0, plinth + 1.15, gz + 0.61), 1);
    G.add("wood", box(0.62, 2.22, 0.06), COL.woodDark, T(-0.33, plinth + 1.15, gz + 0.64));
    G.add("wood", box(0.62, 2.22, 0.06), COL.woodDark, T(0.33, plinth + 1.15, gz + 0.63));
    for (const s of [-1, 1]) G.add("gold", box(0.22, 2.5, 0.1), COL.gold, T(s * 0.76, plinth + 1.25, gz + 0.66));
    G.add("gold", box(1.74, 0.2, 0.12), COL.gold, T(0, plinth + 2.42, gz + 0.66));
    const arch = new THREE.Shape();
    arch.moveTo(-1.05, 0);
    arch.lineTo(1.05, 0);
    arch.quadraticCurveTo(1.05, 0.75, 0.3, 1.05);
    arch.lineTo(0, 1.35);
    arch.lineTo(-0.3, 1.05);
    arch.quadraticCurveTo(-1.05, 0.75, -1.05, 0);
    const hole = new THREE.Path();
    hole.absarc(0, 0.38, 0.28, 0, Math.PI * 2, false);
    arch.holes.push(hole);
    const archG = new THREE.ExtrudeGeometry(arch, { depth: 0.06, bevelEnabled: false, curveSegments: 6 });
    G.add("gold", archG, COL.gold, T(0, plinth + 2.52, gz + 0.62));
    G.add("gold", new THREE.CircleGeometry(0.28, 16), "#d9b25a", T(0, plinth + 2.9, gz + 0.65)); // abstract medallion
    const gr = hipRoof(4.0, 1.6, 2.4, 0.2, 0.55, 0.06, [3.4, 0.6]);
    G.add("roof", gr.top, "#fff", T(0, plinth + 3.9 - gr.yIn + 0.1, gz + 0.3));
    G.add("wood", gr.under, COL.woodDark, T(0, plinth + 3.9 - gr.yIn + 0.1, gz + 0.3));
    for (const x of [-1, 0, 1])
      G.small(() => G.add("gold", lathe([[0, 0], [0.08, 0], [0.09, 0.08], [0.04, 0.2], [0, 0.34]], 6), COL.gold, T(x, plinth + 3.9 - gr.yIn + 0.65, gz + 0.3)));
    GA.garlands.push({ a: V(-1.6, plinth + 3.55, gz + 0.65), b: V(1.6, plinth + 3.55, gz + 0.65), drop: 0.35 });
    GA.lanterns.push(V(-1.9, plinth + 2.2, gz + 0.8), V(1.9, plinth + 2.2, gz + 0.8));
    const gm = T(PALACE_GATE_X, 0, 0);
    P.append(G, gm);
    transformAnchors(GA, gm, A);
    return { parts: P, anchors: A, height: base + 1.5 };
  });
}

// ---------------------------------------------------------------- pati & tea stall

export type PatiOpts = { w: number; d: number; tea?: boolean };

/** Open rest house: brick plinth, back wall, wooden pillars and a tiled roof. */
export function buildPati(o: PatiOpts): Built {
  return cached(`pati:${JSON.stringify(o)}`, () => {
    const P = new Parts();
    const A = emptyAnchors();
    const { w, d } = o;
    const ph = 0.5;
    const h = 2.1;
    P.box("brick", w, ph, d, 0, ph / 2, 0, COL.brickWarm);
    P.box("plain", w + 0.06, 0.06, d + 0.06, 0, ph, 0, COL.stone);
    P.box("plain", 1.0, 0.25, 0.4, 0, 0.125, d / 2 + 0.2, COL.stone); // step
    P.box("brick", w, h, 0.3, 0, ph + h / 2, -d / 2 + 0.15, "#fff");
    const n = Math.max(3, Math.round(w / 1.1) + 1);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.15 + ((w - 0.3) * i) / (n - 1);
      P.box("wood", 0.16, h, 0.16, x, ph + h / 2, d / 2 - 0.15, COL.wood);
      P.box("wood", 0.34, 0.16, 0.24, x, ph + h - 0.12, d / 2 - 0.15, COL.woodDark); // carved capital
    }
    P.box("wood", w + 0.1, 0.2, 0.22, 0, ph + h + 0.04, d / 2 - 0.15, COL.woodDark);
    const ov = 0.6;
    const roof = hipRoof(w + 2 * ov, d + 2 * ov, w * 0.55, 0.12, 0.85, 0.08, [w, d]);
    const base = ph + h + 0.14 - roof.yIn;
    P.add("roof", roof.top, "#fff", T(0, base, 0));
    P.add("wood", roof.under, COL.woodDark, T(0, base, 0));
    const eaveUnder = base + roof.yIn + (-0.1 - roof.yIn) * 0.8;
    struts(P, "front", w, d, n, ph + h - 0.6, eaveUnder, ov * 0.75);
    A.lanterns.push(V(-w / 2 + 0.2, ph + h - 0.45, d / 2 + 0.1), V(w / 2 - 0.2, ph + h - 0.45, d / 2 + 0.1));
    A.garlands.push({ a: V(-w / 2 + 0.15, ph + h - 0.05, d / 2 + 0.02), b: V(w / 2 - 0.15, ph + h - 0.05, d / 2 + 0.02), drop: 0.3 });
    if (o.tea) {
      P.box("wood", w * 0.7, 0.85, 0.45, 0, ph + 0.42, d / 2 - 0.5, COL.wood); // counter
      P.box("wood", w * 0.74, 0.06, 0.55, 0, ph + 0.87, d / 2 - 0.5, COL.woodDark);
      P.add("plain", new THREE.CylinderGeometry(0.13, 0.15, 0.24, 10), "#6d6a66", T(-0.5, ph + 1.02, d / 2 - 0.5)); // kettle
      P.add("plain", beam(V(-0.36, ph + 1.08, d / 2 - 0.5), V(-0.24, ph + 1.16, d / 2 - 0.5), 0.04), "#6d6a66");
      for (let i = 0; i < 4; i++)
        P.add("plain", new THREE.CylinderGeometry(0.035, 0.03, 0.09, 8), "#f3ead8", T(0.05 + i * 0.13, ph + 0.94, d / 2 - 0.45));
      P.box("wood", w * 0.6, 0.08, 0.28, 0, ph + 1.4, -d / 2 + 0.45, COL.woodDark); // shelf
      A.diyos.push(V(0.6, ph + 0.92, d / 2 - 0.5));
    } else {
      A.diyos.push(V(-w / 2 + 0.25, ph + 0.02, d / 2 - 0.2), V(w / 2 - 0.25, ph + 0.02, d / 2 - 0.2));
    }
    return { parts: P, anchors: A, height: base + 0.85 };
  });
}

// ---------------------------------------------------------------- small landmarks

/** Sunken stone water spout (dhunge dhara). The ground has a hole cut for it. */
export function buildDhara(w: number, d: number): Built {
  return cached(`dhara:${w}:${d}`, () => {
    const P = new Parts();
    const A = emptyAnchors();
    const depth = 1.3;
    const t = 0.25;
    // pit walls
    P.box("plain", w, depth, t, 0, -depth / 2, -d / 2 + t / 2, COL.stoneDark);
    P.box("plain", w, depth, t, 0, -depth / 2, d / 2 - t / 2, COL.stoneDark);
    P.box("plain", t, depth, d, -w / 2 + t / 2, -depth / 2, 0, COL.stoneDark);
    P.box("plain", t, depth, d, w / 2 - t / 2, -depth / 2, 0, COL.stoneDark);
    P.box("plain", w, 0.1, d, 0, -depth - 0.05, 0, COL.stone);
    // steps down from the front
    for (let k = 0; k < 5; k++) {
      const h = depth - (k + 1) * (depth / 6);
      P.box("plain", 0.9, 0.12, 0.3, 0, -depth + h, d / 2 - t - 0.15 - k * 0.22, COL.stone);
    }
    // kerb
    P.box("plain", w + 0.3, 0.2, 0.2, 0, 0.1, -d / 2 - 0.05, COL.stone);
    P.box("plain", w + 0.3, 0.2, 0.2, 0, 0.1, d / 2 + 0.05, COL.stone);
    P.box("plain", 0.2, 0.2, d + 0.3, -w / 2 - 0.05, 0.1, 0, COL.stone);
    P.box("plain", 0.2, 0.2, d + 0.3, w / 2 + 0.05, 0.1, 0, COL.stone);
    // spout (abstract makara form) on the back wall
    const sy = -0.45;
    P.box("plain", 0.6, 0.5, 0.12, 0, sy + 0.1, -d / 2 + t + 0.06, COL.stone);
    P.add("gold", beam(V(0, sy, -d / 2 + t + 0.1), V(0, sy + 0.05, -d / 2 + t + 0.55), 0.12, 0.14), COL.bronze);
    P.small(() => P.add("gold", lathe([[0, 0], [0.09, 0.02], [0.07, 0.12], [0, 0.16]], 6).rotateX(Math.PI / 2), COL.bronze, T(0, sy + 0.05, -d / 2 + t + 0.55)));
    P.add("water", box(0.05, 0.75, 0.05), "#ffffff", T(0, sy - 0.38, -d / 2 + t + 0.62));
    P.add("water", plane(w - 2 * t, d - 2 * t - 1.1).rotateX(-Math.PI / 2), "#ffffff", T(0, -depth + 0.18, -0.55 + 0.0));
    A.diyos.push(V(-w / 2 - 0.05, 0.22, -d / 2 - 0.05), V(w / 2 + 0.05, 0.22, -d / 2 - 0.05));
    return { parts: P, anchors: A, height: 0.2 };
  });
}

/** Decorative temple bell between two stone pillars. */
export function buildBell(): Built {
  return cached("bell", () => {
    const P = new Parts();
    P.box("brick", 1.6, 0.35, 0.9, 0, 0.175, 0, COL.brickWarm);
    for (const s of [-1, 1]) P.box("plain", 0.22, 2.1, 0.22, s * 0.6, 0.35 + 1.05, 0, COL.stone);
    P.box("plain", 1.5, 0.18, 0.3, 0, 2.5, 0, COL.stoneDark);
    P.add("gold", beam(V(0, 2.4, 0), V(0, 2.2, 0), 0.04), COL.bronze);
    const bell = lathe(
      [
        [0, 0.62],
        [0.1, 0.6],
        [0.2, 0.5],
        [0.24, 0.25],
        [0.3, 0.05],
        [0.34, 0],
        [0.3, 0.0],
      ],
      10,
    );
    P.small(() => P.add("gold", bell, COL.bronze, T(0, 1.58, 0)));
    return { parts: P, anchors: emptyAnchors(), height: 2.6 };
  });
}

/** Red Nepali post box (Hulak) on a brick pillar. Faces +z. */
export function buildHulak(): Built {
  return cached("hulak", () => {
    const P = new Parts();
    P.box("brick", 0.42, 1.0, 0.42, 0, 0.5, 0, COL.brickWarm);
    P.box("plain", 0.5, 0.06, 0.5, 0, 1.03, 0, COL.stone);
    P.box("plain", 0.6, 0.62, 0.48, 0, 1.37, 0, COL.red);
    P.add("plain", new THREE.CylinderGeometry(0.24, 0.24, 0.6, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), COL.red, T(0, 1.68, 0));
    P.box("plain", 0.36, 0.05, 0.02, 0, 1.52, 0.245, COL.dark);
    P.box("plain", 0.3, 0.16, 0.02, 0, 1.3, 0.245, "#f2e6c8");
    return { parts: P, anchors: emptyAnchors(), height: 1.95 };
  });
}

/** Stone milestone (stele) for the work lane. */
export function milestone(P: Parts, m: THREE.Matrix4) {
  P.add("plain", box(0.55, 0.16, 0.4), COL.stoneDark, m.clone().multiply(T(0, 0.08, 0)));
  const shape = new THREE.Shape();
  shape.moveTo(-0.2, 0);
  shape.lineTo(0.2, 0);
  shape.lineTo(0.2, 0.7);
  shape.quadraticCurveTo(0.2, 0.95, 0, 1.0);
  shape.quadraticCurveTo(-0.2, 0.95, -0.2, 0.7);
  shape.lineTo(-0.2, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false, curveSegments: 4 });
  P.add("plain", g, COL.stone, m.clone().multiply(T(0, 0.16, -0.07)));
}
