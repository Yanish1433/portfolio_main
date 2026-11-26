// Pathshala (Education Zone) layout, from the array lengths in HALL:
// - degree plaques: carved stone stelae against the courtyard's north wall, facing the camera
// - certificate easels: up to 3 along the school's east facade, turned 45° toward the gate
//   (the facade itself is edge-on to the 45° camera), any more in an open-air row beside...
// - ...the course bookshelf, an open-air cabinet north-east of the courtyard (kept clear of
//   the small shrine's stairs).
import { COURTYARD, type Obstacle } from "../zones";
import { HALL } from "./content";
import { wingCentres, type ClickBox, type Spot } from "./spots";

export type Plaque = { x: number; z: number; w: number; h: number; spot: Spot };
export type Easel = { x: number; z: number; w: number; h: number; yaw: number; spot: Spot };

const PLAQUE_Z = COURTYARD.z0 + 0.45;
const PLAQUE_SPAN: [number, number] = [COURTYARD.x0 + 0.9, COURTYARD.x1 - 0.72];

function buildPlaques(): Plaque[] {
  const n = HALL.education.length;
  const { xs, spacing } = wingCentres(n, PLAQUE_SPAN, 1.25);
  const w = Math.min(1.0, spacing - 0.2);
  return xs.map((x, i) => ({
    x,
    z: PLAQUE_Z,
    w,
    h: 1.25,
    spot: { key: `education:${HALL.education[i].id}`, kind: "education", zone: "education", index: i, x, z: PLAQUE_Z, yaw: 0, ring: [x, PLAQUE_Z + 0.85] },
  }));
}

/** Certificates: up to FACADE_MAX easels along the school's east facade, turned 45° toward the gate... */
const FACADE_MAX = 3;
const EASEL_X = COURTYARD.x0 + 0.55;
const EASEL_YAW = Math.PI / 4;
const EASEL_SPAN: [number, number] = [-3.3, -1.05];
/** ...and any more in an open-air row east of the courtyard, south of the path (the shelf stays reachable), facing the camera. */
const OPEN_ROW_Z = COURTYARD.z1 - 1.3;
const OPEN_ROW_SPAN: [number, number] = [COURTYARD.x1 + 0.8, COURTYARD.x1 + 4.6];

function easel(i: number, x: number, z: number, w: number, yaw: number): Easel {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  return {
    x,
    z,
    w,
    h: w * 0.72,
    yaw,
    spot: { key: `certificate:${HALL.certificates[i].id}`, kind: "certificate", zone: "education", index: i, x, z, yaw, ring: [x + fx * 0.85, z + fz * 0.85] },
  };
}

function buildEasels(): Easel[] {
  const n = HALL.certificates.length;
  const onFacade = Math.min(n, FACADE_MAX);
  const facade = wingCentres(onFacade, EASEL_SPAN, 1.15);
  const open = wingCentres(n - onFacade, OPEN_ROW_SPAN, 1.0);
  const openXs = open.xs;
  return [
    ...facade.xs.map((z, i) => easel(i, EASEL_X, z, 0.8, EASEL_YAW)),
    ...openXs.map((x, k) => easel(onFacade + k, x, OPEN_ROW_Z, Math.max(0.4, Math.min(0.8, open.spacing - 0.12)), 0)),
  ];
}

export const PLAQUES: Plaque[] = buildPlaques();
export const EASELS: Easel[] = buildEasels();

export type Book = { x: number; y: number; w: number; h: number; d: number; index: number };
export type Shelf = { x: number; z: number; w: number; h: number; d: number; rowH: number; rows: number; base: number; books: Book[]; ring: [number, number] };

function buildShelf(): Shelf {
  const n = HALL.courses.length;
  let perRow = Math.max(3, Math.min(7, n));
  if (Math.ceil(n / perRow) > 3) perRow = Math.ceil(n / 3);
  const rows = Math.max(2, Math.ceil(n / perRow));
  const bookW = 0.155;
  const gap = 0.03;
  const w = Math.max(1.3, perRow * (bookW + gap) + 0.3);
  const rowH = 0.56;
  const base = 0.28;
  const h = base + rows * rowH + 0.08;
  const x = COURTYARD.x1 + 3.1;
  const z = COURTYARD.z0 - 0.7;
  const d = 0.42;
  const books: Book[] = [];
  for (let i = 0; i < n; i++) {
    // fill from the top shelf (eye level) down
    const row = rows - 1 - Math.floor(i / perRow);
    const inRow = Math.min(perRow, n - Math.floor(i / perRow) * perRow);
    const k = i % perRow;
    const bw = bookW - 0.02 + ((i * 37) % 5) * 0.01;
    const bh = 0.36 + ((i * 53) % 4) * 0.035;
    const rowW = inRow * (bookW + gap);
    books.push({ x: x - rowW / 2 + (k + 0.5) * (bookW + gap), y: base + row * rowH + 0.04 + bh / 2, w: bw, h: bh, d: 0.26, index: i });
  }
  return { x, z, w, h, d, rowH, rows, base, books, ring: [x, z + 1.0] };
}

export const SHELF: Shelf = buildShelf();
export const SHELF_SPOT_KEY = "shelf";

const SHELF_SPOT: Spot = { key: SHELF_SPOT_KEY, kind: "shelf", zone: "education", index: 0, x: SHELF.x, z: SHELF.z, yaw: 0, ring: SHELF.ring };
export const shelfSpot = (key: string): Spot | undefined => (key === SHELF_SPOT_KEY ? SHELF_SPOT : undefined);

/** Walk-up spots (books are click-only, via the shelf ring). */
export const PATHSHALA_SPOTS: Spot[] = [...PLAQUES.map((p) => p.spot), ...EASELS.map((e) => e.spot)];

export const PATHSHALA_RINGS: [number, number][] = [...PATHSHALA_SPOTS.map((s) => s.ring), SHELF.ring];

export const PATHSHALA_BOXES: ClickBox[] = [
  ...PLAQUES.map((p) => ({ spot: p.spot, w: p.w + 0.1, h: p.h + 0.25, d: 0.4, y: (p.h + 0.25) / 2 })),
  ...EASELS.map((e) => ({ spot: e.spot, w: e.w + 0.2, h: 0.95 + e.h, d: 0.5, y: (0.95 + e.h) / 2 })),
];

/** Where the avatar turns after the robot walks it to the pathshala: the plaques. */
export const EDUCATION_FACE: [number, number] | undefined = PLAQUES.length
  ? [PLAQUES.reduce((a, p) => a + p.x, 0) / PLAQUES.length, PLAQUE_Z]
  : EASELS.length
    ? [EASELS[0].x, EASELS[0].z]
    : undefined;

export const PATHSHALA_OBSTACLES: Obstacle[] = [
  ...PLAQUES.map((p): Obstacle => ({ kind: "rect", x: p.x, z: p.z, w: p.w + 0.1, d: 0.34 })),
  ...EASELS.map((e): Obstacle => ({ kind: "circle", x: e.x, z: e.z, r: 0.3 })),
  { kind: "rect", x: SHELF.x, z: SHELF.z, w: SHELF.w + 0.1, d: SHELF.d + 0.1 },
];
