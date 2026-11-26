// Pathshala (Education Zone) layout, from the array lengths in HALL:
// - the education scroll: a painted paper scroll on the courtyard's north wall, one row per school
// - certificate easels: up to 3 along the school's east facade, turned 45° toward the gate
//   (the facade itself is edge-on to the 45° camera), any more in an open-air row beside...
// - ...the course bookshelf, an open-air cabinet north-east of the courtyard (kept clear of
//   the small shrine's stairs).
import { COURTYARD, type Obstacle } from "../zones";
import { HALL } from "./content";
import { wingCentres, type ClickBox, type Spot } from "./spots";

export type ScrollRow = { index: number; /** centre height above the ground */ y: number; h: number; spot: Spot };
/** The painted scroll on the courtyard's north wall: one row per school, newest at the top (oldest at the bottom). */
export type Scroll = { x: number; z: number; w: number; h: number; /** world height of its top and bottom edge */ top: number; bottom: number; headerH: number; rowH: number; rows: ScrollRow[]; ring: [number, number] };
export type Easel = { x: number; z: number; w: number; h: number; yaw: number; spot: Spot };

const SCROLL_Z = COURTYARD.z0 + 0.55;
const SCROLL_W = 2.0;
const SCROLL_BOTTOM = 0.62;
const SCROLL_HEADER = 0.32;
const SCROLL_ROW = 0.52;
/** More rows than this (only ever in ?debug&edu=N) are left off the scroll. */
export const SCROLL_MAX_ROWS = 8;

function buildScroll(): Scroll | null {
  const n = Math.min(SCROLL_MAX_ROWS, HALL.education.length);
  if (n === 0) return null;
  const x = (COURTYARD.x0 + COURTYARD.x1) / 2;
  const h = SCROLL_HEADER + n * SCROLL_ROW + 0.22;
  const top = SCROLL_BOTTOM + h;
  const ring: [number, number] = [x, SCROLL_Z + 1.5];
  const rows: ScrollRow[] = Array.from({ length: n }, (_, i) => ({
    index: i,
    y: top - SCROLL_HEADER - (i + 0.5) * SCROLL_ROW,
    h: SCROLL_ROW,
    // rows are click-only (a walk-up would open a random row); every row shares the scroll's ring
    spot: { key: `education:${HALL.education[i].id}`, kind: "education", zone: "education", index: i, x, z: SCROLL_Z, yaw: 0, ring },
  }));
  return { x, z: SCROLL_Z, w: SCROLL_W, h, top, bottom: SCROLL_BOTTOM, headerH: SCROLL_HEADER, rowH: SCROLL_ROW, rows, ring };
}

export const SCROLL: Scroll | null = buildScroll();

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

export const EASELS: Easel[] = buildEasels();

export type Book = { x: number; y: number; w: number; h: number; d: number; index: number };
export type Shelf = { x: number; z: number; w: number; h: number; d: number; rowH: number; rows: number; base: number; books: Book[]; ring: [number, number] };

function buildShelf(): Shelf | null {
  const n = HALL.courses.length;
  if (n === 0) return null; // no courses: no empty shelf
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

/** The course bookshelf; null (and no shelf, spot, ring or obstacle) when there are no courses. */
export const SHELF: Shelf | null = buildShelf();
export const SHELF_SPOT_KEY = "shelf";

const SHELF_SPOT: Spot | null = SHELF && { key: SHELF_SPOT_KEY, kind: "shelf", zone: "education", index: 0, x: SHELF.x, z: SHELF.z, yaw: 0, ring: SHELF.ring };
/** Spots that are click-only (the scroll's rows, the shelf): found by key, never opened by walking up. */
export const extraSpot = (key: string): Spot | undefined => (SHELF_SPOT && key === SHELF_SPOT_KEY ? SHELF_SPOT : SCROLL?.rows.find((r) => r.spot.key === key)?.spot);

/** Walk-up spots (the scroll's rows and the books are click-only). */
export const PATHSHALA_SPOTS: Spot[] = EASELS.map((e) => e.spot);

export const PATHSHALA_RINGS: [number, number][] = [...(SCROLL ? [SCROLL.ring] : []), ...PATHSHALA_SPOTS.map((s) => s.ring), ...(SHELF ? [SHELF.ring] : [])];

export const PATHSHALA_BOXES: ClickBox[] = [
  ...(SCROLL ? SCROLL.rows.map((r) => ({ spot: r.spot, w: SCROLL.w, h: r.h, d: 0.4, y: r.y })) : []),
  ...EASELS.map((e) => ({ spot: e.spot, w: e.w + 0.2, h: 0.95 + e.h, d: 0.5, y: (0.95 + e.h) / 2 })),
];

/** Where the avatar turns after the robot walks it to the pathshala: the scroll. */
export const EDUCATION_FACE: [number, number] | undefined = SCROLL ? [SCROLL.x, SCROLL.z] : EASELS.length ? [EASELS[0].x, EASELS[0].z] : undefined;

export const PATHSHALA_OBSTACLES: Obstacle[] = [
  ...(SCROLL ? [{ kind: "rect", x: SCROLL.x, z: SCROLL.z, w: SCROLL.w + 0.3, d: 0.34 } as Obstacle] : []),
  ...EASELS.map((e): Obstacle => ({ kind: "circle", x: e.x, z: e.z, r: 0.3 })),
  ...(SHELF ? [{ kind: "rect", x: SHELF.x, z: SHELF.z, w: SHELF.w + 0.1, d: SHELF.d + 0.1 } as Obstacle] : []),
];
