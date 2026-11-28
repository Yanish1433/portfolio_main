// Pure clay-shaping maths (no three.js): a pot is 12 outer radii (bottom -> top) plus a height.
// Dragging moves the radii around the touched height, then a smoothing pass and clamps keep it a nice pot.
export const BANDS = 12;
export const R_MIN = 0.14;
export const R_MAX = 0.44;
export const R_START = 0.25;
export const H_MIN = 0.3;
export const H_MAX = 0.85;
export const H_START = 0.5;
/** Wall thickness (the inside of the pot is `r - WALL`, so the opening can never close up or invert). */
export const WALL = 0.045;
/** Largest radius difference between two neighbouring bands (no spikes or overhangs). */
export const MAX_STEP = 0.07;

export type Clay = { r: number[]; h: number };

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function newClay(): Clay {
  const r: number[] = [];
  for (let k = 0; k < BANDS; k++) r.push(R_START);
  return { r, h: H_START };
}

export const copyClay = (from: Clay, to: Clay): Clay => {
  for (let k = 0; k < BANDS; k++) to.r[k] = from.r[k];
  to.h = from.h;
  return to;
};

/** Continuous band position (0..BANDS-1) of a height fraction 0..1. */
export const bandAt = (yFrac: number) => clamp(yFrac, 0, 1) * (BANDS - 1);

/** Inner radius at a band (never below a sliver). */
export const innerR = (r: number) => Math.max(r - WALL, 0.03);

/** One smoothing pass in place (neighbour average, ends kept). */
export function smooth(c: Clay, amount = 0.3): void {
  const r = c.r;
  let prev = r[0];
  for (let k = 1; k < BANDS - 1; k++) {
    const cur = r[k];
    r[k] = cur + ((prev + r[k + 1]) / 2 - cur) * amount;
    prev = cur;
  }
}

/** Clamp every radius, limit the step between neighbours (both ways) and the height. Idempotent. */
export function clampClay(c: Clay): Clay {
  const r = c.r;
  for (let k = 0; k < BANDS; k++) r[k] = clamp(Number.isFinite(r[k]) ? r[k] : R_START, R_MIN, R_MAX);
  for (let k = 1; k < BANDS; k++) r[k] = clamp(r[k], r[k - 1] - MAX_STEP, r[k - 1] + MAX_STEP);
  for (let k = BANDS - 2; k >= 0; k--) r[k] = clamp(r[k], r[k + 1] - MAX_STEP, r[k + 1] + MAX_STEP);
  c.h = clamp(Number.isFinite(c.h) ? c.h : H_START, H_MIN, H_MAX);
  return c;
}

export const DRAG_R = 0.0016; // metres of radius per pixel dragged sideways
export const DRAG_H = 0.0018; // metres of height per pixel dragged up
export const SIGMA = 1.6; // bands

/**
 * One drag step: `dx` px right (+) widens / left (-) narrows the clay around `yFrac`; `dy` px down (+) lowers, up (-) raises.
 * In place, no allocation.
 */
export function applyDrag(c: Clay, yFrac: number, dx: number, dy: number): void {
  const pos = bandAt(yFrac);
  const dr = dx * DRAG_R;
  if (dr) {
    for (let k = 0; k < BANDS; k++) {
      const d = k - pos;
      const w = Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
      c.r[k] += dr * w;
    }
  }
  c.h -= dy * DRAG_H;
  smooth(c);
  clampClay(c);
}

/** Keyboard: nudge band `band` by `dir` (-1 narrower, +1 wider). */
export function nudgeBand(c: Clay, band: number, dir: -1 | 1, step = 0.018): void {
  const yFrac = clamp(band, 0, BANDS - 1) / (BANDS - 1);
  applyDrag(c, yFrac, (dir * step) / DRAG_R, 0);
}

/** Keyboard: raise / lower the whole pot a little. */
export function nudgeHeight(c: Clay, dir: -1 | 1, step = 0.04): void {
  c.h = clamp(c.h + dir * step, H_MIN, H_MAX);
}

/** Which band is selected after an up / down key (up = higher band). */
export const stepBand = (band: number, dir: -1 | 1) => clamp(band + dir, 0, BANDS - 1);

/** True when the clay is a valid, drawable pot. */
export function isValidClay(c: Clay): boolean {
  if (c.r.length !== BANDS || !Number.isFinite(c.h) || c.h < H_MIN - 1e-9 || c.h > H_MAX + 1e-9) return false;
  for (let k = 0; k < BANDS; k++) {
    if (!Number.isFinite(c.r[k]) || c.r[k] < R_MIN - 1e-9 || c.r[k] > R_MAX + 1e-9) return false;
    if (k && Math.abs(c.r[k] - c.r[k - 1]) > MAX_STEP + 1e-9) return false;
  }
  return true;
}
