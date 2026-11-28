// Pure geometry of the national flag of Nepal, built from the Schedule 1 construction (Constitution of
// Nepal), no three.js. ONE function (`flagDesign`) feeds the canvas texture, the SVG export and the tests.
//
// Construction in AB = 1 units (A origin, x toward the fly, y up):
//   AC = 4/3 AB; D on AC with AD = AB; E on BD with BE = AB; FG through E, parallel to AB, FG = AB; join CG.
//   Inner crimson outline = A B E G C. Both inner tips share x = 1. The blue border is a mitred outward
//   offset of that outline (width TN), so the outer upper tip (sharper, ~32 deg) reaches further than the
//   lower one (45 deg). The outer H/W is the constitutional 1.2190.
//   Moon: H on AB, AH = 1/4 AB, HI up. J bisects CF, L = JK/HI, M = JG/HI, N below M on HI at the
//   distance from M to BD; arcs about L, M, N give the crescent and the half-sun of 8 rays.
//   Sun: U bisects AF, W = HI/UV; circles of radius MN and LN, twelve rays.
// Output units: the OUTER (bordered) outline is 1 wide, hoist-bottom corner at (0, 0).

export const FLAG_CRIMSON = "#DC143C";
export const FLAG_BLUE = "#003893";
export const FLAG_WHITE = "#FFFFFF";
/** Outer height of the flag when its width is 1 (constitutional ratio 1 : 1.2190). */
export const FLAG_HEIGHT = 1.219;

export type Pt = readonly [number, number];
export interface Circle { cx: number; cy: number; r: number }

export interface FlagDesign {
  /** Crimson field outline (inner), counter-clockwise: A, B(lower tip), E(notch), G(upper tip), C. */
  inner: Pt[];
  /** Outer blue outline, same vertex order. */
  outer: Pt[];
  /** Border width (perpendicular to every edge). */
  border: number;
  width: number;
  height: number;
  moon: {
    /** Crescent: arc about `outerArc` (the big lower arc), cut by `bowl` (the inner arc); tips P and Q. */
    arcM: Circle; // outer (convex) lower arc, from P to Q
    arcL: Circle; // inner (bowl) lower arc, from Q back to P
    P: Pt;
    Q: Pt;
    /** Half-sun on the bowl: centre T, inner radius, outer radius, 8 rays on the upper half. */
    half: Circle & { rIn: number; rays: number };
  };
  sun: Circle & { rIn: number; rays: number };
}

let cache: FlagDesign | null = null;

export function flagDesign(): FlagDesign {
  if (cache) return cache;
  const B: Pt = [1, 0];
  const AC = 4 / 3;
  const C: Pt = [0, AC];
  const bd = Math.SQRT2; // |BD|, D = (0, 1)
  const E: Pt = [1 - 1 / bd, 1 / bd];
  const F: Pt = [0, E[1]];
  const G: Pt = [1, E[1]];
  const inner: Pt[] = [[0, 0], B, E, G, C];

  // --- Moon ---------------------------------------------------------------
  const hx = 0.25;
  const J: Pt = [0, (AC + F[1]) / 2];
  const L: Pt = [hx, J[1]];
  const M: Pt = [hx, J[1] + (G[1] - J[1]) * hx]; // JG meets HI
  const dMBD = Math.abs(M[0] + M[1] - 1) / Math.SQRT2; // shortest distance M to BD
  const N: Pt = [hx, M[1] - dMBD];
  const rL = L[1] - N[1];
  const h = L[1] - M[1];
  const dx = Math.sqrt(rL * rL - h * h); // P, Q lie on the horizontal through M
  const rN = dMBD;
  const Ty = ((rL * rL - rN * rN) / (N[1] - L[1]) + L[1] + N[1]) / 2; // RS meets HI
  const T: Pt = [hx, Ty];
  const rOut = Math.sqrt(rN * rN - (Ty - N[1]) ** 2); // TS
  const rIn = M[1] - Ty; // TM
  const border = Ty - N[1]; // TN
  // --- Sun ----------------------------------------------------------------
  const W: Pt = [hx, F[1] / 2]; // UV at half of AF, HI crosses it at W

  // --- Outer outline: mitred offset of the inner one ------------------------
  const n = inner.length;
  const outer: Pt[] = inner.map((p, i) => {
    const a = inner[(i + n - 1) % n];
    const b = inner[(i + 1) % n];
    const n0 = edgeNormal(a, p);
    const n1 = edgeNormal(p, b);
    const k = border / (1 + n0[0] * n1[0] + n0[1] * n1[1]);
    return [p[0] + (n0[0] + n1[0]) * k, p[1] + (n0[1] + n1[1]) * k] as Pt;
  });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of outer) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const s = 1 / (maxX - minX);
  const f = (p: Pt): Pt => [(p[0] - minX) * s, (p[1] - minY) * s];
  const circ = (c: Pt, r: number): Circle => ({ cx: (c[0] - minX) * s, cy: (c[1] - minY) * s, r: r * s });

  cache = {
    inner: inner.map(f),
    outer: outer.map(f),
    border: border * s,
    width: 1,
    height: (maxY - minY) * s,
    moon: {
      arcM: circ(M, dx),
      arcL: circ(L, rL),
      P: f([M[0] - dx, M[1]]),
      Q: f([M[0] + dx, M[1]]),
      half: { ...circ(T, rOut), rIn: rIn * s, rays: 8 },
    },
    sun: { ...circ(W, rL), rIn: rN * s, rays: 12 },
  };
  return cache;
}

/** Outward unit normal of the counter-clockwise edge a -> b. */
function edgeNormal(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy);
  return [dy / l, -dx / l];
}

/** Outer outline (kept as the flag's silhouette). */
export function nepalFlagShape(): Pt[] {
  return flagDesign().outer;
}

/** Bounding box of a polygon. */
export function flagBounds(pts: readonly Pt[] = nepalFlagShape()) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function arc(c: Circle, a0: number, a1: number, steps: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push([c.cx + Math.cos(a) * c.r, c.cy + Math.sin(a) * c.r]);
  }
  return out;
}

/** A star: `rays` triangles with bases on the inner circle and tips on the outer, over `span` radians. */
function rayTriangles(c: Circle, rIn: number, rays: number, a0: number, span: number): Pt[][] {
  const tris: Pt[][] = [];
  const at = (a: number, r: number): Pt => [c.cx + Math.cos(a) * r, c.cy + Math.sin(a) * r];
  for (let k = 0; k < rays; k++) {
    const b0 = a0 + (span * k) / rays;
    const b1 = a0 + (span * (k + 1)) / rays;
    tris.push([at(b0, rIn), at(b1, rIn), at((b0 + b1) / 2, c.r)]);
  }
  return tris;
}

/** Everything the texture draws, as polygons (arcs sampled): blue outer, crimson inner, white emblems. */
export function flagPolys(d: FlagDesign = flagDesign()) {
  const { moon, sun } = d;
  const aQ = Math.atan2(moon.Q[1] - moon.arcL.cy, moon.Q[0] - moon.arcL.cx);
  const lune: Pt[] = [
    ...arc(moon.arcM, Math.PI, 2 * Math.PI, 48), // P -> Q along the big lower arc
    ...arc(moon.arcL, aQ, -Math.PI - aQ, 48), // Q -> P back along the bowl
  ];
  const half = moon.half;
  const white: Pt[][] = [
    lune,
    arc({ cx: half.cx, cy: half.cy, r: half.rIn }, 0, Math.PI, 32),
    ...rayTriangles(half, half.rIn, half.rays, 0, Math.PI),
    arc({ cx: sun.cx, cy: sun.cy, r: sun.rIn }, 0, 2 * Math.PI, 64),
    ...rayTriangles(sun, sun.rIn, sun.rays, Math.PI / 2 - Math.PI / sun.rays, 2 * Math.PI),
  ];
  return { outer: d.outer, inner: d.inner, white };
}

/** The flat flag as an SVG string (units scaled to `px` wide), for review without a browser. */
export function flagSvg(px = 840): string {
  const d = flagDesign();
  const h = d.height * px;
  const pts = (poly: readonly Pt[]) => poly.map(([x, y]) => `${(x * px).toFixed(2)},${(h - y * px).toFixed(2)}`).join(" ");
  const p = flagPolys(d);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${h.toFixed(0)}" viewBox="0 0 ${px} ${h.toFixed(2)}">` +
    `<polygon points="${pts(p.outer)}" fill="${FLAG_BLUE}"/>` +
    `<polygon points="${pts(p.inner)}" fill="${FLAG_CRIMSON}"/>` +
    p.white.map((w) => `<polygon points="${pts(w)}" fill="${FLAG_WHITE}"/>`).join("") +
    `</svg>`
  );
}
