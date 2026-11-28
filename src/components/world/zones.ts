// Town layout (Bhaktapur-inspired Newari square). Edit positions here; the
// buildings, rings, collision grid and cards all read from this file.
// Coordinates are [x, z] in metres. -z is "north" (up the screen). Tall
// buildings sit on the north side so they never hide the avatar from the
// fixed 45° camera; anything that does get in the way is dithered out.
import { LABELS } from "./nepal/labels";
import { JOURNEY, stonePositions } from "./journey";
import { POTTERY_OBSTACLES, POTTERY_RING } from "./pottery/layout";

export type Obstacle =
  | { kind: "rect"; x: number; z: number; w: number; d: number }
  | { kind: "circle"; x: number; z: number; r: number };

/** Ids shared with the robot engine. Do not rename. */
export type ZoneId = "plaza" | "project-hall" | "education" | "skills-lab" | "timeline" | "about" | "mailbox" | "kiosk" | "pottery";

export type Zone = {
  id: ZoneId;
  /** English label (cards, aria). The Nepali line lives in nepal/labels.ts. */
  label: string;
  /** Short action text shown on the card. */
  prompt: string;
  /** Where the floating label sits. */
  position: [number, number];
  /** Centre of the glowing entrance ring. */
  ring: [number, number];
  ringRadius: number;
  color: string;
  /** Label height above the ground. */
  labelY: number;
  /** Solid shapes the avatar can't walk through. */
  obstacles: Obstacle[];
};

/**
 * The old-city brick wall that rings the town (inner and outer face, metres from the centre).
 * Every roof and eave must stay inside `inner` (wall.test.ts measures the real geometry).
 */
export const WALL = { inner: 26.4, outer: 27.6, gateHalf: 1.8 };
/** Gate centres (radians, 0 = +z south, then clockwise as seen from above): south, east, north, west. */
export const GATE_ANGLES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
/** Walkable radius of the raised town platform (the wall's inner face is 0.8 m beyond it, so nobody can step off). */
export const ISLAND_RADIUS = 25.6;
/** outside the Ghar ring + its camera preset radius, so the Ghar panel and framing never trigger on load (layout.test). */
export const SPAWN: [number, number] = [0, 11.9];

// --- Landmarks -------------------------------------------------------------

/** Nyatapola-inspired 5-tier pagoda on a 5-step plinth (stairs face south). */
export const PAGODA = { x: 0, z: -3, base: 9 };
/**
 * The palace (Project Hall). The golden gate sits at its centre, behind the pagoda; the
 * project stands fill the "dalan" (colonnade) wings either side of it, where the 45°
 * camera can always see them (see halls/layout.ts).
 */
export const PALACE = { x: 0, z: -17, w: 20, d: 5, gateX: 0 };
/** Pathshala (Education): house faces east onto a walled courtyard. */
export const SCHOOL = { x: -16, z: -2.5, w: 6, d: 5 };
export const COURTYARD = { x0: -13.5, x1: -10.5, z0: -5.3, z1: 0.3, gate: [-3.9, -1.1] as [number, number] };
/** Prayer-wheel gallery (Skills): ONE row along x, wheels facing +z (south, toward the camera), walkable lane in front. */
export const GALLERY = {
  x: 13.3,
  z: 0,
  /** Frame depth (z). */
  d: 1.3,
  /** Most room the wheels may take along x, and the widest pitch between two of them. */
  maxSpan: 6.6,
  maxPitch: 1.3,
  /** At most this many wheels (one per skill group). */
  maxWheels: 8,
};
/** The middle of the gallery's lane, where the zone label and walk-up checks look. */
export const SKILLS_MID = { x: GALLERY.x, z: GALLERY.z + 1.6 };
/** Smaller temples. */
export const SHRINES = [
  { x: -10.5, z: -9.5, tiers: 3, steps: 3, base: 4 },
  { x: -4.5, z: 14.5, tiers: 2, steps: 2, base: 3 },
];
/** Temple bell between two stone pillars (east end of the dalan). */
export const BELL = { x: 11.9, z: -12.2 };
/** Sunken stone water spout (clear of the dalan's east wing). */
export const DHARA = { x: 9.2, z: -9.6, w: 3.6, d: 2.8 };
/** Open rest houses. rot = rotation about Y (front faces +z when 0). */
export const PATIS = [
  { x: -8, z: 4, w: 3.2, d: 2, rot: 0 },
  { x: 6.4, z: 6.6, w: 3.2, d: 2, rot: 0 },
  { x: 18.2, z: -1.3, w: 4.2, d: 2, rot: -Math.PI / 2 },
];
/** Recruiter tea stall (front faces west toward its ring). */
export const TEA_STALL = { x: 5, z: 16, w: 3, d: 2.4, rot: -Math.PI / 2 };
export const HULAK = { x: 12, z: 9 };
/** "Recruiter Chiya Pasal" sign board (clickable). */
export const TEA_SIGN = { x: 3.0, y: 1.75, z: 18.2 };

// --- New places (step8c) ----------------------------------------------------

/** Temple pond (pokhari): a sunken stone tank east of the post box, stone steps on the south side. */
export const POND = { x: 10.9, z: 13.2, w: 5.0, d: 3.4 };
/**
 * Market lane along the inside of the south wall: six stalls in two groups either side of the main axis, their
 * fronts toward the camera (+z), a stone lane in front of them.
 */
export const MARKET = {
  stallZ: 20.4,
  laneZ: 22.4,
  stallW: 1.7,
  /** x of each stall centre, and what it sells. */
  stalls: [
    { x: -8.6, kind: "pots" },
    { x: -6.6, kind: "cloth" },
    { x: -4.6, kind: "spice" },
    { x: 3.9, kind: "veg" },
    { x: 5.9, kind: "flowers" },
    { x: 7.9, kind: "fruit" },
  ] as { x: number; kind: "pots" | "cloth" | "spice" | "veg" | "flowers" | "fruit" }[],
};
/** Chautari: a peepal tree on a two-tier stone platform at the east edge, behind the prayer-wheel lane (tall things stay on the north/east edge, never in front of the camera). */
export const CHAUTARI = { x: 22.0, z: -4.4, lowerW: 3.6, lowerD: 3.4, upperW: 2.4, upperD: 2.2 };

export type HouseSpec = {
  x: number;
  z: number;
  w: number;
  d: number;
  floors: number;
  rot: number;
  ornate?: boolean;
  shop?: boolean;
  /** "Yanish's Ghar": carved photo window, lamp, plants and a doormat (nepal/kit.ts). Front must face +z. */
  ghar?: boolean;
  seed: number;
};

const E = Math.PI / 2; // faces east (+x)
const W = -Math.PI / 2; // faces west (-x)
const N = Math.PI; // faces north (-z)

/** Newari houses that frame the square. The first one is the pathshala. */
export const HOUSES: HouseSpec[] = [
  { x: SCHOOL.x, z: SCHOOL.z, w: SCHOOL.w, d: SCHOOL.d, floors: 3, rot: E, ornate: true, seed: 3 },
  { x: -15, z: -15.5, w: 5, d: 4, floors: 4, rot: 0, ornate: true, shop: true, seed: 11 },
  { x: 15, z: -15.5, w: 5, d: 4, floors: 4, rot: 0, ornate: true, seed: 12 },
  { x: -17.2, z: -9.2, w: 5, d: 3.6, floors: 3, rot: E, shop: true, seed: 13 },
  { x: 17.4, z: -10, w: 5, d: 3.6, floors: 3, rot: W, ornate: true, seed: 14 },
  { x: -18.4, z: 4, w: 4, d: 3.6, floors: 3, rot: E, shop: true, seed: 15 },
  { x: 0, z: 5.2, w: 3.6, d: 3, floors: 2, rot: 0, seed: 16, ghar: true },
  { x: 19.4, z: 5.4, w: 4.4, d: 3.6, floors: 3, rot: W, shop: true, seed: 17 },
  { x: 16.4, z: 13, w: 4, d: 3.4, floors: 2, rot: N, seed: 18 },
  { x: -11.5, z: 16.8, w: 4, d: 3, floors: 2, rot: N, shop: true, seed: 19 },
  { x: -7.4, z: -18.6, w: 3.6, d: 3, floors: 3, rot: 0, seed: 20 },
  { x: 7.4, z: -18.6, w: 3.6, d: 3, floors: 3, rot: 0, seed: 21 },
];

export const TREES: [number, number, number][] = [
  [-18.6, 11.5, 1],
  [9.8, 18.6, 0.9],
  [-1, 19.6, 0.8],
  [13.2, 16.8, 0.85],
];

/** "Yanish's Ghar" (About me): the small two-storey house at the centre of the town, right in front of SPAWN, its front (+z) facing the camera. */
export const GHAR = HOUSES.find((h) => h.ghar)!;

/** Work Timeline brick lane (also used by the visuals). */
export const TIMELINE_PATH: [number, number][] = [
  [-7.5, 7.5],
  [-10, 9.5],
  [-12.5, 11],
  [-15, 12.2],
];
/** Stone milestone markers along the lane (north-west side): one per stop of the captain's journey (journey.ts), the last one is "Next milestone". */
export const MILESTONES: [number, number][] = stonePositions(TIMELINE_PATH, JOURNEY.length);

// --- Footprints -> obstacles ---------------------------------------------

function rotRect(x: number, z: number, w: number, d: number, rot: number): Obstacle {
  const quarter = Math.abs(Math.sin(rot)) > 0.5;
  return { kind: "rect", x, z, w: quarter ? d : w, d: quarter ? w : d };
}

const rect = (x: number, z: number, w: number, d: number): Obstacle => ({ kind: "rect", x, z, w, d });
const circle = (x: number, z: number, r: number): Obstacle => ({ kind: "circle", x, z, r });

/** Everything solid that isn't a zone building. */
export const STATIC_OBSTACLES: Obstacle[] = [
  // houses (+0.5 m for the front step) – the school is covered by the education zone
  ...HOUSES.slice(1).map((h) => rotRect(h.x, h.z, h.w + 0.2, h.d + 0.7, h.rot)),
  // the stairs are on the front (+z) only: 0.1 m round the base at the back, 0.4 m of stairs in front
  ...SHRINES.map((s) => rect(s.x, s.z + 0.15, s.base + 0.2, s.base + 0.5)),
  rect(BELL.x, BELL.z, 1.7, 1.0),
  rect(DHARA.x, DHARA.z, DHARA.w + 0.4, DHARA.d + 0.4),
  ...PATIS.slice(0, 2).map((p) => rotRect(p.x, p.z, p.w + 0.2, p.d + 0.2, p.rot)),
  ...TREES.map(([x, z]) => circle(x, z, 0.55)),
  ...MILESTONES.map(([x, z]) => circle(x, z, 0.35)),
  rect(TEA_SIGN.x, TEA_SIGN.z, 2.2, 0.3),
  // step8c places
  rect(POND.x, POND.z, POND.w + 0.3, POND.d + 0.3),
  ...MARKET.stalls.map((st) => rect(st.x, MARKET.stallZ, MARKET.stallW + 0.2, 1.5)),
  rect(CHAUTARI.x, CHAUTARI.z, CHAUTARI.lowerW + 0.3, CHAUTARI.lowerD + 0.3),
];

export const zones: Zone[] = [
  {
    id: "plaza",
    label: LABELS.zones.plaza.en,
    prompt: "Welcome! Press E or tap to look around",
    // label hangs low over the entrance ring, so it never covers an avatar behind the pagoda
    position: [-4.4, 3.6],
    ring: [-4.4, 3.6],
    ringRadius: 1.5,
    color: "#ffb347",
    labelY: 3.3,
    obstacles: [
      rect(PAGODA.x, PAGODA.z, PAGODA.base + 0.2, PAGODA.base + 0.2),
      rect(PAGODA.x, PAGODA.z + PAGODA.base / 2 + 0.35, 2.3, 0.9), // stairs
    ],
  },
  {
    id: "project-hall",
    label: LABELS.zones["project-hall"].en,
    prompt: "Press E or tap to see the projects",
    position: [PALACE.x, PALACE.z],
    // entrance of the dalan's west wing (the stand rings sit 2 m further north, past the dioramas)
    ring: [-6, -10.0],
    ringRadius: 1.3,
    color: "#ffcf5a",
    labelY: 11.4,
    obstacles: [rect(PALACE.x, PALACE.z, PALACE.w + 0.2, PALACE.d + 0.2), rect(PALACE.gateX, PALACE.z + PALACE.d / 2 + 0.35, 3.6, 0.8)],
  },
  {
    id: "education",
    label: LABELS.zones.education.en,
    prompt: "Press E or tap to enter the pathshala",
    position: [SCHOOL.x + 1, SCHOOL.z],
    // just inside the courtyard gate; plaques, easels and the bookshelf are walk-up spots of their own
    ring: [-11.3, -2.5],
    ringRadius: 1.0,
    color: "#ffd27a",
    labelY: 10.6,
    obstacles: [
      rotRect(SCHOOL.x, SCHOOL.z, SCHOOL.w + 0.2, SCHOOL.d + 0.2, E),
      // courtyard walls
      rect((COURTYARD.x0 + COURTYARD.x1) / 2, COURTYARD.z0, COURTYARD.x1 - COURTYARD.x0, 0.35),
      rect((COURTYARD.x0 + COURTYARD.x1) / 2, COURTYARD.z1, COURTYARD.x1 - COURTYARD.x0, 0.35),
      rect(COURTYARD.x1, (COURTYARD.z0 + COURTYARD.gate[0]) / 2, 0.35, COURTYARD.gate[0] - COURTYARD.z0),
      rect(COURTYARD.x1, (COURTYARD.gate[1] + COURTYARD.z1) / 2, 0.35, COURTYARD.z1 - COURTYARD.gate[1]),
    ],
  },
  {
    id: "skills-lab",
    label: LABELS.zones["skills-lab"].en,
    prompt: "Press E or tap to look at the prayer wheels",
    position: [GALLERY.x, GALLERY.z + 0.4],
    ring: [GALLERY.x - 3.7, GALLERY.z + 1.7],
    ringRadius: 1.4,
    color: "#e8925a",
    labelY: 5.6,
    obstacles: [
      // the gallery's footprint (frame + pedestals), sized for the widest row
      rect(GALLERY.x, GALLERY.z, GALLERY.maxSpan + 1.0, GALLERY.d + 0.2),
      rotRect(PATIS[2].x, PATIS[2].z, PATIS[2].w + 0.2, PATIS[2].d + 0.2, PATIS[2].rot),
    ],
  },
  {
    id: "timeline",
    label: LABELS.zones.timeline.en,
    prompt: "Press E or tap to walk the lane",
    // hangs over the lane's entrance ring at the plaza end, away from every stone (the stones and
    // their captions run south-west of here) and well east of the Ghar's door (showcase-6 round 2)
    position: [-6.0, 10.0],
    ring: [-6.6, 6.9],
    ringRadius: 1.3,
    color: "#ffb347",
    labelY: 3.4,
    obstacles: [],
  },
  {
    id: "about",
    label: LABELS.zones.about.en,
    prompt: "Press E or tap to step inside",
    position: [GHAR.x, GHAR.z],
    // on the doormat, in front of the step (the house is already a solid obstacle)
    ring: [GHAR.x, GHAR.z + GHAR.d / 2 + 1.4],
    ringRadius: 1.2,
    color: "#ffd27a",
    labelY: 5.6,
    obstacles: [],
  },
  {
    id: "mailbox",
    label: LABELS.zones.mailbox.en,
    prompt: "Press E or tap to open",
    position: [HULAK.x, HULAK.z],
    ring: [10, 8.2],
    ringRadius: 1.3,
    color: "#ff6b5a",
    labelY: 3.4,
    obstacles: [circle(HULAK.x, HULAK.z, 0.5)],
  },
  {
    id: "kiosk",
    label: LABELS.zones.kiosk.en,
    prompt: "Press E or tap the sign to open Recruiter Mode",
    position: [TEA_STALL.x, TEA_STALL.z],
    ring: [1.7, 16],
    ringRadius: 1.4,
    color: "#7fd6b5",
    labelY: 5.0,
    obstacles: [rotRect(TEA_STALL.x, TEA_STALL.z, TEA_STALL.w + 0.2, TEA_STALL.d + 0.4, TEA_STALL.rot)],
  },
  {
    // step22: the potter's corner just south of the prayer wheels (pottery/layout.ts); "Make a pot" starts the wheel game
    id: "pottery",
    label: LABELS.zones.pottery.en,
    prompt: "Press E or tap to make a pot \u{1F3FA}",
    position: [POTTERY_RING.x, POTTERY_RING.z],
    ring: [POTTERY_RING.x, POTTERY_RING.z],
    ringRadius: POTTERY_RING.radius,
    color: "#e07a4a",
    labelY: 2.6,
    obstacles: POTTERY_OBSTACLES,
  },
];

export const zoneById = (id: string | null): Zone | undefined => zones.find((z) => z.id === id);
