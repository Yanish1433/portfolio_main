// Shared walk-up spot types and the small layout helper used by the dalan and the pathshala.

export type SpotKind = "project" | "more" | "education" | "certificate" | "shelf" | "workshop";

/** Something the avatar can walk up to. */
export type Spot = {
  key: string;
  kind: SpotKind;
  zone: "project-hall" | "education";
  /** Index into its HALL list (for "more": the first project it holds). */
  index: number;
  /** Item centre on the ground and the direction it faces (radians about +Y, 0 = +z). */
  x: number;
  z: number;
  yaw: number;
  /** Where the avatar stands to read it. */
  ring: [number, number];
};

/** Open a panel within this distance of a spot's ring... */
export const OPEN_R = 0.9;
/** ...and close it again beyond this one (hysteresis, so neighbours never flicker). */
export const CLOSE_R = 1.6;
/** Opening also needs the avatar to have (nearly) stopped, so running past stands doesn't flash panels. */
export const OPEN_SPEED = 1.0;

/** A clickable box over a display (raycast only, never drawn), in world space. */
export type ClickBox = { spot: Spot; w: number; h: number; d: number; y: number; /** offset toward +z from the spot */ dz?: number; /** offset toward +x from the spot */ dx?: number; part?: "diorama"; /** which item of the spot this box opens (Workshop: a repo id) */ item?: string };

/** n centres spread over [a, b], at most `maxSpacing` apart, centred. */
export function wingCentres(n: number, [a, b]: [number, number], maxSpacing = 2.3): { xs: number[]; spacing: number } {
  if (n <= 0) return { xs: [], spacing: b - a };
  const mid = (a + b) / 2;
  if (n === 1) return { xs: [mid], spacing: b - a };
  const spacing = Math.min(maxSpacing, (b - a) / (n - 1));
  return { xs: Array.from({ length: n }, (_, i) => mid + (i - (n - 1) / 2) * spacing), spacing };
}

/** The flagship's screen is this much wider than its neighbours' (and FLAG_H taller). */
export const FLAG_W = 1.4;
export const FLAG_H = 1.25;
/** Narrowest gap left between two stands (a dalan pillar stands in it). */
export const MIN_GAP = 0.45;
const MAX_W = 1.6;
const MAX_FLAG_W = 2.2;
const SCREEN_INSET = 0.22;

/**
 * Stand centres and widths for one wing. Without a flagship it is the even spread of
 * wingCentres (width = spacing - MIN_GAP, at most 1.6 m). With some (`flagAt` = their slot, or a
 * list of slots), those stands' screens are FLAG_W times wider and all the same size; the wing
 * grows into its spare room first and only then narrows the other stands, so gaps never drop
 * below MIN_GAP and the wing stays centred.
 */
export function packWing(count: number, wing: [number, number], flagAt: number | number[] = -1): { x: number; w: number }[] {
  if (count <= 0) return [];
  const { xs, spacing } = wingCentres(count, wing);
  const w = Math.min(MAX_W, spacing - MIN_GAP);
  const flags = new Set((Array.isArray(flagAt) ? flagAt : [flagAt]).filter((i) => i >= 0 && i < count));
  const f = flags.size;
  if (f === 0) return xs.map((x) => ({ x, w }));
  const flagOf = (other: number) => Math.min(MAX_FLAG_W, FLAG_W * (other - SCREEN_INSET) + SCREEN_INSET);
  const [a, b] = wing;
  const room = b - a + w; // outer extent the wing may use
  let other = w;
  let flag = flagOf(other);
  const sum = () => other * (count - f) + flag * f;
  if (sum() + (count - 1) * MIN_GAP > room) {
    // shrink the others (flag follows): (count-f)*o + f*(FLAG_W*(o-inset)+inset) + gaps = room
    other = (room - (count - 1) * MIN_GAP + f * (FLAG_W - 1) * SCREEN_INSET) / (count - f + f * FLAG_W);
    flag = flagOf(other);
  }
  const extentNow = count > 1 ? xs[count - 1] - xs[0] + w : w;
  const extent = Math.min(room, Math.max(extentNow, sum() + (count - 1) * MIN_GAP));
  const gap = count > 1 ? (extent - sum()) / (count - 1) : 0;
  const out: { x: number; w: number }[] = [];
  let left = (a + b) / 2 - extent / 2;
  for (let i = 0; i < count; i++) {
    const wi = flags.has(i) ? flag : other;
    out.push({ x: left + wi / 2, w: wi });
    left += wi + gap;
  }
  return out;
}

/**
 * ?debug only: hide a showcase layer to measure what each stage costs ("halo", "live",
 * "packets", "labels"). Read every frame by those components; never set in normal use.
 */
export const debugHidden = new Set<string>();

/** Triangles the dioramas add to the town's merged meshes (filled in by hallParts). */
export const dioramaStats = { tris: 0, count: 0 };
