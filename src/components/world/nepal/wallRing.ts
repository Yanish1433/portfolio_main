// The old-city wall ring as pure data (no three): one generator for every curtain segment so the
// whole circle is built the same way. Gate angles/openings come from zones.ts and never move.
import { GATE_ANGLES, WALL } from "../zones";

/** Distance along the gate's tangent where curtain segments start: inside the tower stub (it spans gateHalf..gateHalf+3). */
export const WALL_JOIN = WALL.gateHalf + 0.6;
/** Curtain segments per quarter between two gates (72 round the ring). */
export const SEGS_PER_QUARTER = 18;
/** A pilaster stands on every Nth segment boundary (regular arc spacing, ~6.3 m). */
export const PILASTER_EVERY = 3;
/** A lamp stands on top of the curtain at every Nth segment centre, a flag string spans the others (alternating). */
export const LAMP_EVERY = 3;

export type WallSeg = {
  index: number;
  quarter: number;
  a0: number;
  a1: number;
  am: number;
  /** curtain top height (the south arc is lower so the 45 deg camera sees over it) */
  h: number;
  /** a pilaster stands at this segment's start boundary */
  pilaster: boolean;
  /** a lamp sits on top of this segment */
  lamp: boolean;
  /** a prayer-flag string hangs along this segment */
  flags: boolean;
  /** materials used (the same set for every segment) */
  mats: readonly string[];
};

export const WALL_MID = (WALL.inner + WALL.outer) / 2;
export const WALL_MATS = ["brick", "plain", "wood", "roof"] as const;

export function wallHeight(am: number) {
  return 2.6 - 1.45 * Math.min(1, Math.max(0, (Math.cos(am) - 0.25) / 0.6));
}

/** Half-angle of the opening reserved for a gate (curtain stops at the tower interior, WALL_JOIN from the centre). */
export const joinAngle = () => Math.asin(WALL_JOIN / WALL_MID);

/** Every curtain segment, in order round the ring, covering 360 deg minus the four gate openings with no gap and no overlap. */
export function wallSegments(): WallSeg[] {
  const out: WallSeg[] = [];
  const gates = [...GATE_ANGLES].map((g) => (g < 0 ? g + Math.PI * 2 : g)).sort((a, b) => a - b);
  const j = joinAngle();
  gates.forEach((g, q) => {
    const next = q + 1 < gates.length ? gates[q + 1] : gates[0] + Math.PI * 2;
    const start = g + j;
    const step = (next - j - start) / SEGS_PER_QUARTER;
    for (let i = 0; i < SEGS_PER_QUARTER; i++) {
      const a0 = start + i * step;
      const a1 = a0 + step;
      const am = (a0 + a1) / 2;
      out.push({
        index: out.length,
        quarter: q,
        a0,
        a1,
        am,
        h: wallHeight(am),
        pilaster: i > 0 && i % PILASTER_EVERY === 0,
        lamp: i % LAMP_EVERY === 1,
        flags: i % LAMP_EVERY === 2,
        mats: WALL_MATS,
      });
    }
  });
  return out;
}
