// Pure helpers for the dance flag / aura (no three.js).

/** Hand grip: where the pole sits in the hand bone's frame (metres, world scale) and its tilt (radians). */
export const GRIP_OFFSET: readonly [number, number, number] = [-0.0069, 0.0867, 0.0059];
/** Pole axis in the hand bone's local space (from step19a's grip); the pole's +Y is rotated onto it. */
export const GRIP_AXIS: readonly [number, number, number] = [0.4513, 0.2419, 0.859];
/** The flag shows once the grip has closed and goes before it opens again (seconds into the Dance clip). */
export const FLAG_SHOW_FROM = 0.3;
export const FLAG_HIDE_BEFORE_END = 1.0;
/** Right-hand bone name (Mixamo rig); fingers (RightHandIndex1…) don't match because of the `$`. */
export const HAND_BONE_RE = /Right.?Hand$|hand_r/i;

export const POP_IN_SECS = 0.35;
export const POP_OUT_SECS = 0.22;

/** easeOutBack: 0→1 with a little overshoot (~10%). */
export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = Math.min(1, Math.max(0, t)) - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}

/** Advance the pop timer (0..1) toward `on`. */
export function stepPop(p: number, on: boolean, dt: number): number {
  return Math.min(1, Math.max(0, p + (on ? dt / POP_IN_SECS : -dt / POP_OUT_SECS)));
}

/** Flag scale for pop timer `p` (grows with overshoot; shrinks smoothly). */
export function popScale(p: number, on: boolean): number {
  return on ? easeOutBack(p) : p * p * (3 - 2 * p);
}

/** Cloth wave amplitude from the hand speed (m/s): calm sway when still, flowing when it swings. */
export function waveAmp(handSpeed: number): number {
  return 0.07 + Math.min(1, handSpeed / 3) * 0.12;
}
