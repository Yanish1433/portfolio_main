// The Quick tour: six stops, ~5 s at each, one short real line per stop. Pure (no React, no three.js):
// every line is built from profile data (nothing invented) and never uses a pronoun for the owner.
import type { Profile } from "@/content/profile";
import { buildMilestones, eduLine, sortedEducation } from "./journey";

import type { ZoneId } from "./types";

/** Ghar → Projects → Skills → Education → Journey → Contact. */
export const QUICK_TOUR_STOPS = ["about", "project-hall", "skills-lab", "education", "timeline", "mailbox"] as const satisfies readonly ZoneId[];
export type QuickTourStop = (typeof QUICK_TOUR_STOPS)[number];

/** How long the robot talks at each stop. */
export const QUICK_TOUR_PAUSE_MS = 5000;
/** The tour should take about this long in total (walking + pauses). */
export const QUICK_TOUR_TARGET_MS = 60_000;

type TourProfile = Pick<Profile, "name" | "title" | "projects" | "skills" | "education" | "experience">;

const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** One short line per stop, from profile data only. */
export function quickTourLines(p: TourProfile): Record<QuickTourStop, string> {
  const first = p.name.split(" ")[0] || p.name;
  const title = p.title.replace(/\s*·\s*/g, ", ");
  const lead = p.projects.find((x) => x.featured) ?? p.projects[0];
  const groups = p.skills.map((g) => g.label);
  const edu = sortedEducation(p.education)[0];
  const stones = buildMilestones(p);
  const past = stones.filter((m) => m.kind === "past").length;
  return {
    about: `${first}'s Ghar. ${sentence(title)}`,
    "project-hall": `${p.projects.length} projects stand in the Project Hall${lead ? `, led by ${lead.name}: ${sentence(lead.tagline)}` : "."}`,
    "skills-lab": `${groups.length} prayer wheels, one per skill group: ${groups.join(", ")}.`,
    education: edu ? `The pathshala. ${sentence(eduLine(edu))}` : "The pathshala holds the education story.",
    timeline: `The brick lane: ${past} milestone ${past === 1 ? "stone" : "stones"} on ${first}'s journey so far, and one still to come.`,
    mailbox: `The hulak, the post box. Leave a message for ${first} here.`,
  };
}

/** Straight-line estimate: total ms for walking `legMetres` at `speed` m/s plus a pause at every stop. */
export function quickTourDurationMs(legMetres: number[], speed: number, pauseMs = QUICK_TOUR_PAUSE_MS): number {
  return legMetres.reduce((t, m) => t + (m / speed) * 1000, 0) + legMetres.length * pauseMs;
}

/** What a tour needs from the world; actions.ts wires the real ones, tests wire fakes. */
export type TourDeps = {
  inZone: (z: ZoneId) => boolean;
  /** Announce the next stop, then auto-walk there. Rejects (AbortError) when cancelled. */
  leadTo: (z: ZoneId, signal: AbortSignal) => Promise<void>;
  /** At a stop: face it, look at it, say its line. */
  arrive: (z: ZoneId) => void;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
};

/** Walk the stops in order, pausing at each. Resolves after the last pause; rejects when `signal` aborts (no further stop is run). */
export async function runTourStops(stops: readonly ZoneId[], pauseMs: number, deps: TourDeps, signal: AbortSignal): Promise<void> {
  for (const zone of stops) {
    if (signal.aborted) throw new DOMException("aborted", "AbortError");
    if (!deps.inZone(zone)) await deps.leadTo(zone, signal);
    deps.arrive(zone);
    await deps.sleep(pauseMs, signal);
  }
}
