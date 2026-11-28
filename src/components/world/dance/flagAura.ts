// Pure parts of the glowing-flag dance backdrop (no three.js): the mask raster built from `flagDesign()` and the
// animation timeline. Mask channels: R = blue border, G = crimson field, B = moon (the SUN is procedural in the
// shader so its rays can turn), A = 0..1 distance along the border from the hoist's lower corner (draw-on).
import { flagDesign, flagPolys, type Pt } from "./nepalFlag";

export const MASK_H = 512;

export interface FlagMask {
  width: number;
  height: number;
  /** RGBA, row 0 = the BOTTOM of the flag (matches a non-flipped texture). */
  data: Uint8Array;
}

type Poly = readonly Pt[];
interface Bbox { x0: number; y0: number; x1: number; y1: number }

function bbox(p: Poly): Bbox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of p) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

function inside(p: Poly, b: Bbox, x: number, y: number): boolean {
  if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) return false;
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Polygon area (shoelace), flag units. */
export function polyArea(p: Poly): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return Math.abs(a) / 2;
}

/** Index range of the moon pieces inside `flagPolys().white` (lune, half-sun disc, 8 half-sun rays). */
export const MOON_POLYS = 10;

/** Arc length position (0..1) of the nearest point on the closed polyline, folded so 0 = the hoist's lower corner. */
function makeTrace(outline: Poly) {
  const n = outline.length;
  const len: number[] = [0];
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    len.push(len[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = len[n];
  return (x: number, y: number) => {
    let best = Infinity;
    let at = 0;
    for (let i = 0; i < n; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % n];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy;
      const u = Math.min(1, Math.max(0, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
      const d = Math.hypot(x - (a[0] + dx * u), y - (a[1] + dy * u));
      if (d < best) {
        best = d;
        at = len[i] + u * Math.sqrt(l2);
      }
    }
    const s = at / total;
    return Math.min(s, 1 - s) * 2; // both ways from the hoist corner, meeting at the far end
  };
}

/** Rasterise the flag once (2x2 supersampled, no canvas so it runs under node tests too). */
export function buildFlagMask(h: number = MASK_H): FlagMask {
  const d = flagDesign();
  const polys = flagPolys(d);
  const w = Math.round(h / d.height);
  const data = new Uint8Array(w * h * 4);
  const outerB = bbox(polys.outer);
  const innerB = bbox(polys.inner);
  const moon = polys.white.slice(0, MOON_POLYS);
  const moonB = moon.map(bbox);
  const trace = makeTrace(polys.inner);
  const px = 1 / w; // flag units per pixel (flag is 1 wide)
  const sub = [0.25, 0.75];
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      let o = 0, i = 0, m = 0;
      for (const sy of sub) {
        for (const sx of sub) {
          const x = (col + sx) * px;
          const y = (row + sy) * px;
          const inOuter = inside(polys.outer, outerB, x, y);
          const inInner = inOuter && inside(polys.inner, innerB, x, y);
          if (inOuter) o++;
          if (inInner) i++;
          if (inInner) for (let k = 0; k < moon.length; k++) if (inside(moon[k], moonB[k], x, y)) { m++; break; }
        }
      }
      const idx = (row * w + col) * 4;
      const border = Math.max(0, o - i);
      data[idx] = Math.round((border / 4) * 255);
      data[idx + 1] = Math.round((i / 4) * 255);
      data[idx + 2] = Math.round((m / 4) * 255);
      if (border > 0) data[idx + 3] = Math.max(1, Math.round(trace((col + 0.5) * px, (row + 0.5) * px) * 255));
    }
  }
  return { width: w, height: h, data };
}

/** Fraction of the mask area covered by channel `c` (0 = R, 1 = G, 2 = B). */
export function channelCoverage(mask: FlagMask, c: 0 | 1 | 2): number {
  let s = 0;
  for (let i = c; i < mask.data.length; i += 4) s += mask.data[i];
  return s / 255 / (mask.width * mask.height);
}

// --- Timeline ------------------------------------------------------------------

export const DRAW_START = 0.15;
export const DRAW_SECS = 0.8; // blue border traces on
export const FILL_SECS = 0.9; // crimson fills in after the border
export const IGNITE_START = 1.6;
export const IGNITE_SECS = 0.7; // moon + sun light up
export const FLASH_DECAY = 4.5; // 1/s
export const DISSOLVE_SECS = 1.3;

export interface AuraPhase {
  draw: number;
  fill: number;
  ignite: number;
  /** 0..1 brightness pulse from the latest pole strike. */
  flash: number;
  /** Seconds since the latest strike (-1 before the first); drives the outward ripple. */
  sinceImpact: number;
  /** 0 = whole, 1 = gone (reaches 1 exactly at `duration`). */
  dissolve: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function auraTimeline(t: number, duration: number, impacts: readonly number[]): AuraPhase {
  let since = -1;
  for (const im of impacts) if (t >= im && (since < 0 || t - im < since)) since = t - im;
  return {
    draw: clamp01((t - DRAW_START) / DRAW_SECS),
    fill: clamp01((t - DRAW_START - DRAW_SECS * 0.9) / FILL_SECS),
    ignite: clamp01((t - IGNITE_START) / IGNITE_SECS),
    flash: since < 0 ? 0 : Math.exp(-since * FLASH_DECAY),
    sinceImpact: since,
    dissolve: clamp01((t - (duration - DISSOLVE_SECS)) / DISSOLVE_SECS),
  };
}

/** Beat pulse (0..1) at 100 bpm. */
export function beatPulse(t: number, bpm = 100): number {
  const ph = (t * bpm) / 60;
  const f = ph - Math.floor(ph);
  return Math.exp(-f * 5);
}
