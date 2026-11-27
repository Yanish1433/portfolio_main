// Guestbook prayer flags: where the two posts stand and where each flag hangs. Pure data (no three).

export const GUESTBOOK = {
  /** Two posts in the north-east of the square, a 7 m span running east-west (the flags face the default camera). Free ground (see flagSpec.test.ts). */
  postA: { x: 7, z: -5 },
  postB: { x: 14, z: -5 },
  postH: 4.7,
  /** Two strings between the posts: height at the posts and how far they sag in the middle. */
  strings: [
    { y: 4.3, sag: 0.55 },
    { y: 3.4, sag: 0.5 },
  ],
  perString: 15,
  maxFlags: 30,
  /** A few empty flags show even when there are no approved notes (or the guestbook is offline). */
  minFlags: 5,
  flagW: 0.4,
  flagH: 0.46,
  /** Turn of the flags about the vertical axis (0 = in the plane of the string, facing +z toward the camera). */
  yaw: 0,
  /** Atlas: 1024x512, 8 x 4 cells of 128 px (one per flag). */
  atlas: { w: 1024, h: 512, cols: 8, rows: 4 },
} as const;

/** Traditional order: blue, white, red, green, yellow. */
export const FLAG_COLORS = ["#2b6cc4", "#f4f1e8", "#d23b2e", "#2f9a55", "#f2c230"] as const;
/** Text colour that reads on each flag colour. */
export const FLAG_INK = ["#ffffff", "#2a2a2a", "#ffffff", "#ffffff", "#2a2a2a"] as const;

export type FlagPlace = { i: number; x: number; y: number; z: number; color: number; cellCol: number; cellRow: number };

/** How many flags to show for `notes` approved notes. */
export const flagCount = (notes: number) => Math.min(GUESTBOOK.maxFlags, Math.max(GUESTBOOK.minFlags, notes));

/** Flag i hangs on string floor(i / perString), centred when the string isn't full; colours cycle in the traditional order. */
export function flagLayout(count: number): FlagPlace[] {
  const G = GUESTBOOK;
  const n = Math.min(count, G.maxFlags);
  const out: FlagPlace[] = [];
  for (let i = 0; i < n; i++) {
    const s = Math.floor(i / G.perString);
    const k = i % G.perString;
    const m = Math.min(G.perString, n - s * G.perString);
    const t = 0.5 + (k - (m - 1) / 2) / G.perString;
    const str = G.strings[s];
    out.push({
      i,
      x: G.postA.x + (G.postB.x - G.postA.x) * t,
      z: G.postA.z + (G.postB.z - G.postA.z) * t,
      y: str.y - str.sag * 4 * t * (1 - t),
      color: i % 5,
      cellCol: i % G.atlas.cols,
      cellRow: Math.floor(i / G.atlas.cols),
    });
  }
  return out;
}

/** Height of the string at parameter t (0..1 from post A to post B). */
export const stringY = (s: number, t: number) => GUESTBOOK.strings[s].y - GUESTBOOK.strings[s].sag * 4 * t * (1 - t);
