// Pure path generators for the hand-drawn Nepali scenery (no React, no fs). Every shape is computed
// once on the server and ships as plain SVG, so the landing page needs no JavaScript for its art.

export type Pt = [number, number];

/** Small seeded random numbers, so the mountains are identical on every render. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => Math.round(n * 10) / 10;

/**
 * A jagged mountain ridge through `pts` (left to right) filled down to `bottom`.
 * Extra small points are added between the main ones so the edge looks like rock, not a polygon.
 */
export function ridge(pts: Pt[], bottom: number, seed: number, jag = 7): string {
  const rand = rng(seed);
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    out.push(pts[i]);
    const next = pts[i + 1];
    if (!next) continue;
    const dx = next[0] - pts[i][0];
    const steps = Math.max(0, Math.floor(dx / 34) - 1);
    for (let s = 1; s <= steps; s++) {
      const t = s / (steps + 1);
      out.push([pts[i][0] + dx * t, pts[i][1] + (next[1] - pts[i][1]) * t + (rand() - 0.5) * 2 * jag]);
    }
  }
  const first = out[0];
  const last = out[out.length - 1];
  return `M${f(first[0])},${bottom} L${out.map((p) => `${f(p[0])},${f(p[1])}`).join(" L")} L${f(last[0])},${bottom} Z`;
}

/** A snow cap on the peak `pts[i]`: a zig-zag hem `depth` below the summit, following the two slopes. */
export function snowCap(pts: Pt[], i: number, depth: number): string {
  const [px, py] = pts[i];
  const l = pts[i - 1] ?? [px - 120, py + depth * 2];
  const r = pts[i + 1] ?? [px + 120, py + depth * 2];
  const at = (n: Pt, d: number): Pt => {
    const t = Math.min(1, d / Math.max(1, n[1] - py));
    return [px + (n[0] - px) * t, py + d];
  };
  const a = at(l, depth);
  const b = at(r, depth);
  const hem: Pt[] = [];
  const n = 5;
  for (let k = 1; k < n; k++) {
    const t = k / n;
    hem.push([b[0] + (a[0] - b[0]) * t, b[1] + (k % 2 ? depth * 0.34 : -depth * 0.06)]);
  }
  return `M${f(px)},${f(py)} L${f(b[0])},${f(b[1])} ${hem.map((p) => `L${f(p[0])},${f(p[1])}`).join(" ")} L${f(a[0])},${f(a[1])} Z`;
}

/** Deterministic star positions for the night sky. */
export function stars(count: number, w: number, h: number, seed: number): { x: number; y: number; r: number }[] {
  const rand = rng(seed);
  return Array.from({ length: count }, () => ({ x: f(rand() * w), y: f(rand() * h), r: f(0.6 + rand() * 1.3) }));
}

/**
 * A multi-tier Newari pagoda (silhouette). Returns the dark body and the gold pinnacle separately,
 * both centred on `cx` and standing on `base`.
 */
export function pagoda(cx: number, base: number, width: number, tiers: number, tierH: number): { body: string; gold: string } {
  const body: string[] = [];
  const gold: string[] = [];
  // stepped plinth
  const plinth = [
    [width * 1.12, 8],
    [width * 0.98, 8],
    [width * 0.84, 8],
  ];
  let y = base;
  for (const [w, h] of plinth) {
    body.push(`M${f(cx - w / 2)},${f(y)} L${f(cx + w / 2)},${f(y)} L${f(cx + w / 2)},${f(y - h)} L${f(cx - w / 2)},${f(y - h)} Z`);
    y -= h;
  }
  for (let t = 0; t < tiers; t++) {
    const w = width * (1 - t * (0.62 / Math.max(1, tiers)));
    const wall = w * 0.6;
    const wallH = tierH * 0.42;
    // wall (with a lit window handled by the caller)
    body.push(`M${f(cx - wall / 2)},${f(y)} L${f(cx + wall / 2)},${f(y)} L${f(cx + wall / 2)},${f(y - wallH)} L${f(cx - wall / 2)},${f(y - wallH)} Z`);
    y -= wallH;
    // curved roof, tips turned up
    const th = tierH * 0.62;
    const yt = y - th;
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    body.push(
      `M${f(x0)},${f(y - 7)} Q${f(x0 + w * 0.05)},${f(y + 3)} ${f(x0 + w * 0.12)},${f(y + 1)} L${f(x1 - w * 0.12)},${f(y + 1)} Q${f(x1 - w * 0.05)},${f(y + 3)} ${f(x1)},${f(y - 7)} Q${f(x1 - w * 0.13)},${f(yt + th * 0.42)} ${f(cx + w * 0.25)},${f(yt)} L${f(cx - w * 0.25)},${f(yt)} Q${f(x0 + w * 0.13)},${f(yt + th * 0.42)} ${f(x0)},${f(y - 7)} Z`,
    );
    y = yt;
  }
  // gajur: gold vase, stacked rings and a spike
  gold.push(`M${f(cx - 4)},${f(y)} L${f(cx + 4)},${f(y)} L${f(cx + 2.4)},${f(y - 9)} L${f(cx - 2.4)},${f(y - 9)} Z`);
  gold.push(`M${f(cx - 6)},${f(y - 9)} L${f(cx + 6)},${f(y - 9)} L${f(cx + 3)},${f(y - 15)} L${f(cx - 3)},${f(y - 15)} Z`);
  gold.push(`M${f(cx - 1)},${f(y - 15)} L${f(cx + 1)},${f(y - 15)} L${f(cx)},${f(y - 34)} Z`);
  return { body: body.join(" "), gold: gold.join(" ") };
}

/** A shikhara temple (stacked, tapering tower with a curved top), as in Krishna Mandir. */
export function shikhara(cx: number, base: number, width: number, height: number): { body: string; gold: string } {
  const levels = 4;
  const parts: string[] = [];
  let y = base;
  const lh = (height * 0.62) / levels;
  parts.push(`M${f(cx - width / 2)},${f(y)} L${f(cx + width / 2)},${f(y)} L${f(cx + width / 2)},${f(y - height * 0.2)} L${f(cx - width / 2)},${f(y - height * 0.2)} Z`);
  y -= height * 0.2;
  for (let i = 0; i < levels; i++) {
    const w = width * (0.9 - i * 0.14);
    parts.push(`M${f(cx - w / 2)},${f(y)} L${f(cx + w / 2)},${f(y)} L${f(cx + w * 0.4)},${f(y - lh)} L${f(cx - w * 0.4)},${f(y - lh)} Z`);
    y -= lh;
  }
  // curved spire
  const w = width * 0.34;
  parts.push(`M${f(cx - w / 2)},${f(y)} Q${f(cx - w * 0.45)},${f(y - height * 0.12)} ${f(cx)},${f(y - height * 0.2)} Q${f(cx + w * 0.45)},${f(y - height * 0.12)} ${f(cx + w / 2)},${f(y)} Z`);
  const top = y - height * 0.2;
  return {
    body: parts.join(" "),
    gold: `M${f(cx - 3)},${f(top)} L${f(cx + 3)},${f(top)} L${f(cx)},${f(top - 22)} Z M${f(cx - 4)},${f(top - 4)} a4,4 0 1 0 8,0 a4,4 0 1 0 -8,0 Z`,
  };
}

/** A small stupa (whitewashed dome, gold harmika) as on Swayambhu hill. */
export function stupa(cx: number, base: number, size: number): { body: string; gold: string } {
  const r = size / 2;
  return {
    body: `M${f(cx - r)},${f(base)} A${f(r)},${f(r * 0.9)} 0 0 1 ${f(cx + r)},${f(base)} Z`,
    gold: `M${f(cx - r * 0.3)},${f(base - r * 0.9)} L${f(cx + r * 0.3)},${f(base - r * 0.9)} L${f(cx + r * 0.3)},${f(base - r * 1.25)} L${f(cx - r * 0.3)},${f(base - r * 1.25)} Z M${f(cx - r * 0.2)},${f(base - r * 1.25)} L${f(cx + r * 0.2)},${f(base - r * 1.25)} L${f(cx)},${f(base - r * 2.1)} Z`,
  };
}

/** The Dhaka-topi pattern as a tiny SVG tile (red ground, white diamonds, black hearts), as a CSS url(). */
const DHAKA_TILE =
  `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>` +
  `<rect width='28' height='28' fill='#b3122b'/>` +
  `<path d='M14 2 L26 14 L14 26 L2 14 Z' fill='#fbf5e8'/>` +
  `<path d='M14 7 L21 14 L14 21 L7 14 Z' fill='#16100f'/>` +
  `<path d='M14 11 L17 14 L14 17 L11 14 Z' fill='#e9a52c'/>` +
  `<path d='M0 0 L5 0 L0 5 Z M28 0 L23 0 L28 5 Z M0 28 L5 28 L0 23 Z M28 28 L23 28 L28 23 Z' fill='#16100f'/>` +
  `</svg>`;

export const DHAKA_URL = `url("data:image/svg+xml,${encodeURIComponent(DHAKA_TILE)}")`;
