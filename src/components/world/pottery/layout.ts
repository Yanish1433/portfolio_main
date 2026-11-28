// Where the potter's corner stands (just south of the prayer-wheel lane). Pure: zones.ts imports this, so no zones import here.
export const POTTERY = { x: 14.6, z: 4.1 };
/** The wheel head's centre (x, z), its top face height and radius. The clay sits on it. */
export const WHEEL = { x: 14.0, z: 4.6, headY: 0.74, headR: 0.5 };
/** Back shelf (faces south): board heights and where the 8 pots stand (x offsets from the shelf centre, 2 tiers of 4). */
export const SHELF = { x: 14.7, z: 2.95, w: 3.3, d: 0.5, boards: [0.5, 1.1, 1.7] as const, slotX: [-1.15, -0.4, 0.4, 1.15] as const };
/** Clay pile (east of the wheel) and the drying pots [x, z, scale]. */
export const PILE = { x: 15.7, z: 4.9 };
export const DRYING: [number, number, number][] = [
  [15.4, 3.9, 0.9],
  [16.1, 4.2, 0.7],
  [16.0, 3.6, 0.8],
];
/** The glowing entrance ring: west of the wheel, so the avatar stands beside the pot and the camera sees both. */
export const POTTERY_RING = { x: 12.2, z: 5.5, radius: 0.95 };

type Rect = { kind: "rect"; x: number; z: number; w: number; d: number };
export const POTTERY_OBSTACLES: Rect[] = [
  { kind: "rect", x: SHELF.x, z: SHELF.z, w: SHELF.w + 0.2, d: SHELF.d + 0.2 },
  { kind: "rect", x: WHEEL.x, z: WHEEL.z, w: 1.5, d: 1.2 },
  { kind: "rect", x: 15.9, z: 4.4, w: 1.6, d: 2.0 },
];

/** World position of shelf slot `i` (0..7): tier 0 is the low board. */
export function shelfSlot(i: number): { x: number; y: number; z: number } {
  const tier = i >= 4 ? 1 : 0;
  return { x: SHELF.x + SHELF.slotX[i % 4], y: SHELF.boards[tier] + 0.025, z: SHELF.z + 0.02 };
}

/** Yaw (about Y) for the pot on shelf slot `i`: its medallion (u = 0.5, local -z) turns toward the walkway (the entrance ring), but never more than 0.5 rad off due south (the shelf face). */
export function shelfYaw(i: number): number {
  const s = shelfSlot(i);
  const yaw = Math.atan2(-(POTTERY_RING.x - s.x), -(POTTERY_RING.z - s.z)); // local -z -> (-sin yaw, -cos yaw) = direction to the ring
  return Math.PI + Math.max(-0.5, Math.min(0.5, yaw - Math.PI));
}

/** Atlas: 8 cells (one per shelf slot, = SHELF_MAX), each cellW x cellH px; the logo of pot i sits at u = 0.5 of cell i. */
export const ATLAS = { cells: 8, cellW: 256, cellH: 512 };
/** Shelf pot scale: the tallest pot (H_MAX) times this must fit under the next board (see the test). */
export const SHELF_SCALE = 0.6;
