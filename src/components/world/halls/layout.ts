// Where every stand, plaque, frame and book goes. Pure maths (no three.js), computed
// once from the array lengths in HALL, so adding a project to profile.ts adds a stand,
// a ring and a nav obstacle with no code changes.
//
// Project Hall ("Project Dalan"): an open colonnade along the palace front, in two wings
// either side of the golden gate. The (up to two) flagships take the two stands that flank the
// gate, the inner end of each wing, and they are the same size. Which project stands where is
// the only thing the session's lead changes: the stands, obstacles and nav grid are identical
// for either lead. With few projects the wings are shortened so the dalan hugs its stands. The 5-tier pagoda stands between the 45° camera and the
// middle of the palace (|x| < ~2.4 m), so stands only go in the wings where the camera
// can always see them.
// The pathshala (Education Zone) has its own file, pathshala.ts; this one also gathers the
// spots, rings, click boxes and obstacles of both zones.
import { GHAR, PALACE, type Obstacle } from "../zones";
import { HALL, LEAD_ID } from "./content";
import { featuredProjects, leadFirst, plainArchitecture } from "@/content/showcase";
import { dioramaBlocks, type DioramaBlock } from "./showcaseView";
import { FLAG_H, packWing, type ClickBox, type Spot } from "./spots";
import { EDUCATION_FACE, PATHSHALA_BOXES, PATHSHALA_OBSTACLES, PATHSHALA_RINGS, PATHSHALA_SPOTS, extraSpot } from "./pathshalaLayout";

export { CLOSE_R, OPEN_R, OPEN_SPEED, type Spot, type SpotKind } from "./spots";
export { EASELS, SCROLL, SHELF, SHELF_SPOT_KEY } from "./pathshalaLayout";

// --- Project Dalan ----------------------------------------------------------

export const MAX_STANDS = 8;
/** Front face of the palace (its plinth runs a little further). */
export const PALACE_FRONT = PALACE.z + PALACE.d / 2;
export const STAND_Z = PALACE_FRONT + 0.95;
export const STAND_DEPTH = 0.4;
/** Rings sit in front of the diorama plinths (avatar radius 0.45 + a margin). */
const RING_DZ = 1.25;
/** Stand centres stay inside these x spans (west wing, east wing). A wing with one stand is short. */
const WING_INNER = 3.1;
const WING_FULL = 6.1;
const WING_SHORT = 4.0;
export const WINGS: [number, number][] = (() => {
  const perWing = Math.ceil(Math.min(HALL.projects.length, MAX_STANDS) / 2);
  const len = perWing === 1 ? WING_SHORT : WING_FULL;
  return [
    [-(WING_INNER + len), -WING_INNER],
    [WING_INNER, WING_INNER + len],
  ];
})();
export const POSTER = { h: 1.05, y: 1.42 };

export type Stand = {
  x: number;
  z: number;
  w: number;
  /** Projects shown here: one, or (carousel stand) everything from MAX_STANDS-1 on. */
  projects: number[];
  spot: Spot;
  /** The featured project's bigger stand. */
  flagship: boolean;
  /** The screen (poster) on this stand: size and centre height; it faces +z at z + 0.03. */
  screen: { w: number; h: number; y: number };
  /** The architecture diorama at its foot (project stands with layers only). */
  diorama: Diorama | null;
};

/** A carved plinth in front of a stand with one tiny building per layer, joined by a glowing road. */
export type Diorama = { x: number; z: number; w: number; d: number; /** plinth top */ top: number; blocks: DioramaBlock[] };

export const PLINTH = { w: 1.2, /** a flagship's plinth is wider */ flagW: 1.8, d: 0.45, top: 0.4, /** gap from the stand's front face */ gap: 0.0 };

function dioramaFor(x: number, w: number, projectIndex: number | null, flagship: boolean): Diorama | null {
  if (projectIndex === null) return null;
  const p = HALL.projects[projectIndex];
  const pw = Math.min(flagship ? PLINTH.flagW : PLINTH.w, w - 0.1);
  const blocks = p ? dioramaBlocks(plainArchitecture(p), pw) : [];
  if (!blocks.length) return null;
  return { x, z: STAND_Z + STAND_DEPTH / 2 + PLINTH.gap + PLINTH.d / 2, w: pw, d: PLINTH.d, top: PLINTH.top, blocks };
}

/** Indices (in HALL.projects) of the flagships, lead first; at most two get a flagship stand. */
export const FLAGSHIPS: number[] = leadFirst(featuredProjects({ projects: HALL.projects }), LEAD_ID)
  .slice(0, 2)
  .map((p) => HALL.projects.indexOf(p));

function buildStands(): Stand[] {
  const n = HALL.projects.length;
  const slots = Math.min(n, MAX_STANDS);
  const carousel = n > MAX_STANDS;
  const west = Math.ceil(slots / 2);
  const east = slots - west;
  // The flagships take the two inner slots (either side of the gate): the lead in the west one,
  // the other in the east one. A lone flagship (or a lone stand) takes the west one. The rest keep
  // their profile order in the other slots. With a carousel, no flagship ever hides inside "More".
  const flagSlots = east > 0 ? [west - 1, west] : [west - 1];
  const used = FLAGSHIPS.slice(0, flagSlots.length);
  const order: number[] = Array(n).fill(-1);
  used.forEach((pi, k) => (order[flagSlots[k]] = pi));
  const rest = Array.from({ length: n }, (_, i) => i).filter((i) => !used.includes(i));
  for (let slot = 0; slot < n; slot++) if (order[slot] < 0) order[slot] = rest.shift()!;
  const westFlags = used.length ? [west - 1] : [];
  const eastFlags = used.length > 1 ? [0] : [];
  const out: Stand[] = [];
  const place = (count: number, wing: [number, number], flagAt: number[]) => {
    for (const { x, w } of packWing(count, wing, flagAt)) {
      const slot = out.length;
      const isMore = carousel && slot === slots - 1;
      const projects = isMore ? order.slice(slot) : [order[slot]];
      const flagship = !isMore && used.includes(order[slot]);
      const key = isMore ? "more" : `project:${HALL.projects[order[slot]].id}`;
      const h = POSTER.h * (flagship ? FLAG_H : 1);
      out.push({
        x,
        z: STAND_Z,
        w,
        projects,
        flagship,
        // screens share their bottom edge, so the flagship grows upward
        screen: { w: w - 0.22, h, y: POSTER.y - POSTER.h / 2 + h / 2 },
        diorama: dioramaFor(x, w, isMore ? null : order[slot], flagship),
        spot: { key, kind: isMore ? "more" : "project", zone: "project-hall", index: projects[0], x, z: STAND_Z, yaw: 0, ring: [x, STAND_Z + RING_DZ] },
      });
    }
  };
  place(west, WINGS[0], westFlags);
  place(east, WINGS[1], eastFlags);
  return out;
}

export const STANDS: Stand[] = buildStands();

/** The dalan spans both wings whatever the project count, so it always reads as one hall. */
export const DALAN = { z0: PALACE_FRONT, z1: PALACE_FRONT + 2.3, wings: WINGS.map(([a, b]) => [a - 1.15, b + 1.15] as [number, number]) };

// --- Shared ----------------------------------------------------------------

/** Every walk-up spot. */
export const SPOTS: Spot[] = [...STANDS.map((s) => s.spot), ...PATHSHALA_SPOTS];

export const spotByKey = (key: string): Spot | undefined => SPOTS.find((s) => s.key === key) ?? extraSpot(key);

/** Ring markers on the ground (one per spot, plus the bookshelf). */
export const RINGS: [number, number][] = [...STANDS.map((s) => s.spot.ring), ...PATHSHALA_RINGS];

/** Invisible click boxes over the stands, plaques and easels. */
export const CLICK_BOXES: ClickBox[] = [
  ...STANDS.map((s) => ({ spot: s.spot, w: s.w, h: 2.6, d: 0.6, y: 1.3 })),
  // the diorama at its foot opens the same stand
  ...STANDS.flatMap((s) => (s.diorama ? [{ spot: s.spot, w: s.diorama.w, h: s.diorama.top + 0.4, d: s.diorama.d, y: (s.diorama.top + 0.4) / 2, dz: s.diorama.z - s.z, part: "diorama" as const }] : [])),
  ...PATHSHALA_BOXES,
];

/** Every diorama, with its stand. */
export const DIORAMAS = STANDS.flatMap((s) => (s.diorama ? [{ stand: s, d: s.diorama }] : []));

/** The stand that shows a project (its own, or the carousel stand). */
export function standForProject(id: string): Stand | undefined {
  const i = HALL.projects.findIndex((p) => p.id === id);
  return i < 0 ? undefined : STANDS.find((s) => s.projects.includes(i));
}

/** World-space centre and size of the screen that shows a project (cinema mode flies into it). */
export function screenOf(id: string): { x: number; y: number; z: number; w: number; h: number } | undefined {
  const s = standForProject(id);
  return s ? { x: s.x, y: s.screen.y, z: s.z + 0.03, w: s.screen.w, h: s.screen.h } : undefined;
}

/** Point the avatar turns to after the robot walks it to a zone. */
export const ZONE_FACE: Partial<Record<string, [number, number]>> = {
  "project-hall": STANDS.length ? [STANDS[0].x, STANDS[0].z] : undefined,
  education: EDUCATION_FACE,
  // the avatar turns to the house (and its photo window) after a robot walk
  about: [GHAR.x, GHAR.z],
};

/** Solid shapes for the nav grid / collision. */
export const HALL_OBSTACLES: Obstacle[] = [
  ...STANDS.map((s): Obstacle => ({ kind: "rect", x: s.x, z: s.z, w: s.w + 0.1, d: STAND_DEPTH })),
  ...DIORAMAS.map(({ d }): Obstacle => ({ kind: "rect", x: d.x, z: d.z, w: d.w + 0.06, d: d.d + 0.04 })),
  // dalan pillars stand between the stands, in line with them
  ...dalanPillars().map(([x, z]): Obstacle => ({ kind: "circle", x, z, r: 0.14 })),
  ...PATHSHALA_OBSTACLES,
];

/** Pillar positions: both ends of each wing plus the gaps between stands. */
export function dalanPillars(): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of DALAN.wings) {
    const inWing = STANDS.filter((s) => s.x > a && s.x < b).sort((p, q) => p.x - q.x);
    const xs = [a + 0.2, b - 0.2];
    // middle of the gap (stands can differ in width: the flagship is wider)
    for (let i = 0; i + 1 < inWing.length; i++) xs.push((inWing[i].x + inWing[i].w / 2 + inWing[i + 1].x - inWing[i + 1].w / 2) / 2);
    // with few stands, keep a steady rhythm of pillars anyway
    if (inWing.length <= 1) {
      const n = 4;
      for (let k = 1; k < n; k++) {
        const x = a + 0.2 + ((b - a - 0.4) * k) / n;
        if (!inWing.some((s) => Math.abs(s.x - x) < s.w / 2 + 0.2)) xs.push(x);
      }
    }
    for (const x of xs) out.push([x, STAND_Z]);
  }
  return out;
}
