// Pure geometry of the national flag of Nepal (Constitution of Nepal, Schedule 1), no three.js.
// Units: hoist (pole side) on x = 0, x grows toward the fly, y grows up. The flag is 1 wide.

export const FLAG_CRIMSON = "#DC143C";
export const FLAG_BLUE = "#003893";
/** Height of the whole flag when its width is 1 (constitutional ratio 1 : 1.2190). */
export const FLAG_HEIGHT = 1.219;
/** Blue border width as a fraction of the flag width. */
export const FLAG_BORDER = 0.055;

export type Pt = readonly [number, number];

/**
 * Outline of the double pennant, counter-clockwise from the hoist foot:
 * A hoist foot, B lower fly tip, E inner notch tip, F notch corner, C upper fly tip(top of hoist).
 *
 * Construction: AB = base (1). AC = hoist height (1.219). D on AC with AD = AB. Join BD; E on BD with
 * BE = AB / sqrt(2)... i.e. E sits where the notch of the lower pennant begins; F is where the
 * horizontal through E meets CB. The outline is A, B, E, F, C.
 */
export function nepalFlagShape(): Pt[] {
  const A: Pt = [0, 0];
  const B: Pt = [1, 0];
  const C: Pt = [0, FLAG_HEIGHT];
  // E: on BD (D = (0, 1)) at distance 1 from B.
  const bd = Math.SQRT2;
  const E: Pt = [1 - 1 / bd, 1 / bd];
  // F: horizontal from E meets the slanted hoist-to-tip edge CB.
  const fx = 1 - E[1] / FLAG_HEIGHT;
  const F: Pt = [fx, E[1]];
  return [A, B, E, F, C];
}

/** Bounding box of the outline. */
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

/** Moon (upper pennant) and sun (lower pennant) centres / radii, in the same units. */
export function flagEmblems() {
  const pts = nepalFlagShape();
  const E = pts[2];
  return {
    moon: { cx: 0.2, cy: E[1] + (FLAG_HEIGHT - E[1]) * 0.36, r: 0.115 },
    sun: { cx: 0.2, cy: E[1] * 0.4, r: 0.105, rays: 12 },
  };
}
