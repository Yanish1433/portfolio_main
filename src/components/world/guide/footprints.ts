// Pure helpers for the golden footprints: path → footprint positions, how far Lakhey has got, arrival.
// No React, no three.js.
import type { Vec2 } from "@/store/world";

export type Footprint = { x: number; z: number; /** radians about +Y, 0 = +Z */ heading: number; left: boolean };

/** Distance between two footprints along the path (m). */
export const STRIDE = 0.6;
/** How far each foot sits to the side of the path centre line (m). */
export const FOOT_SIDE = 0.16;
/** Never more than this many (the mesh is allocated once at this size). */
export const MAX_FOOTPRINTS = 200;
/** The footprints vanish by themselves after this long. */
export const GUIDE_TTL_MS = 20_000;

/**
 * Resample a path into footprints every `stride` metres of arc length, alternating left / right of the
 * centre line. The first one is one stride from the start (not under Lakhey's feet); none go past the end.
 */
export function footprintsAlong(path: readonly Vec2[], stride = STRIDE, side = FOOT_SIDE, max = MAX_FOOTPRINTS): Footprint[] {
  const out: Footprint[] = [];
  let carry = stride; // distance still to walk before the next footprint
  let left = true;
  for (let i = 0; i + 1 < path.length && out.length < max; i++) {
    const [ax, az] = path[i];
    const [bx, bz] = path[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    const heading = Math.atan2(dx, dz);
    // perpendicular pointing to the walker's left: for heading h (forward = (sin h, cos h)), left = (cos h, -sin h)
    const lx = dz;
    const lz = -dx;
    let d = carry;
    while (d <= len && out.length < max) {
      const k = left ? side : -side;
      out.push({ x: ax + dx * d + lx * k, z: az + dz * d + lz * k, heading, left });
      left = !left;
      d += stride;
    }
    carry = d - len;
  }
  return out;
}

/**
 * Index of the footprint Lakhey is at: the nearest one, searched only forward from `prev` (a short
 * window), so it never jumps back when the path doubles over itself. Monotonic.
 */
export function passedIndex(fps: readonly Footprint[], px: number, pz: number, prev: number, window = 8): number {
  let best = prev;
  let bestD = Infinity;
  const end = Math.min(fps.length - 1, prev + window);
  for (let i = prev; i <= end; i++) {
    const d = Math.hypot(fps[i].x - px, fps[i].z - pz);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** True once the avatar stands inside the section's ring. */
export const arrivedAt = (px: number, pz: number, at: Vec2, radius: number): boolean => Math.hypot(px - at[0], pz - at[1]) <= radius;

/** Total length of a path (m). */
export const pathLength = (path: readonly Vec2[]): number => {
  let t = 0;
  for (let i = 0; i + 1 < path.length; i++) t += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
  return t;
};
