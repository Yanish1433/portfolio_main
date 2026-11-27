// Pure helpers for the /town loading screen (no React, no three).

/** Share of the bar held back until the first frame has rendered. */
export const HOLD = 0.95;

/**
 * Whole percent for the bar. drei's useProgress totals grow as loaders start, so the raw ratio can
 * fall; we never go backwards (`prev`), and we stop at 95 % until the world has drawn (`ready`).
 */
export function barValue(loaded: number, total: number, prev: number, ready: boolean): number {
  if (ready) return 100;
  const raw = total > 0 ? Math.min(1, Math.max(0, loaded / total)) : 0;
  const v = Math.min(HOLD, Math.max(prev / 100, raw));
  return Math.round(v * 100);
}

export const TIPS = [
  "Tip: press V for eagle view",
  "Tip: click the glowing lantern to say hello",
  "Tip: tap the ground to walk, or use WASD",
  "Tip: stand on a glowing ring to open its place",
  "Tip: press R to reset the camera",
];

export const tipAt = (i: number): string => TIPS[((i % TIPS.length) + TIPS.length) % TIPS.length];
