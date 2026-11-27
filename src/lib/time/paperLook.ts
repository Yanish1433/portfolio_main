// Paper look from the minute of day: tint + lamp-glow strength. Pure; the glow IS timeLook's night amount `t`
// (0 day .. 1 deep night, blended through dusk and dawn), so the book and the town share one clock curve.
import { timeToLook } from "@/components/world/nepal/timeLook";

export type PaperLook = { glow: number; paper: string; ink: string; gold: string };

const mix = (a: number[], b: number[], k: number) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const hex = (c: number[]) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

const PAPER_DAY = [246, 234, 208]; // #f6ead0
const PAPER_NIGHT = [230, 214, 178]; // #e6d6b2 (same as the town's night paper)
const INK_DAY = [43, 29, 20];
const INK_NIGHT = [36, 24, 16];
const GOLD_DAY = [143, 51, 32]; // heading red
const GOLD_NIGHT = [122, 40, 24];

export function paperLook(minutes: number): PaperLook {
  const glow = timeToLook(minutes).t;
  return { glow, paper: hex(mix(PAPER_DAY, PAPER_NIGHT, glow)), ink: hex(mix(INK_DAY, INK_NIGHT, glow)), gold: hex(mix(GOLD_DAY, GOLD_NIGHT, glow)) };
}
