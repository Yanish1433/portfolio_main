// The Workshop: one large carved plaque per GitHub-only project, on a wooden board standing just east of
// the dalan (beyond the east wing's roof, so the camera sees it). step13b: about 2.5x bigger than the old
// hanging scrolls: a 2-column board, plaques 1.35 x 1.05 m with the repo name in big letters, a one-line
// blurb and small tech chips. Pure maths (no three.js), so it can be tested.
import { profile, type WorkshopProject } from "@/content/profile";
import type { Obstacle } from "../zones";
import type { ClickBox, Spot } from "./spots";

export const WORKSHOP: WorkshopProject[] = profile.workshop ?? [];

/** Plaque size, and the spacing between plaque centres (m). */
export const PLAQUE_W = 1.35;
export const PLAQUE_H = 1.05;
export const PLAQUE_PITCH_X = 1.45;
export const PLAQUE_PITCH_Y = 1.15;
/** Plaques per row. A short last row sits on the LEFT (the temple bell stands in front of the right-hand column). */
export const COLS = 2;
/** Height (m) of the bottom row's centre. */
export const BOTTOM_ROW_Y = 1.4;
/** Where the board is centred (x) and its depth (z). */
export const WORKSHOP_X = 10.7;
export const WALL_Z = -13.4;

export type Plaque = { x: number; y: number; w: number; h: number };

/** Row-major from the TOP-left: the first repo is the top-left plaque. */
export const PLAQUES: Plaque[] = (() => {
  const n = WORKSHOP.length;
  const rows = Math.ceil(n / COLS);
  return WORKSHOP.map((_, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    return {
      x: WORKSHOP_X + (col - (COLS - 1) / 2) * PLAQUE_PITCH_X,
      y: BOTTOM_ROW_Y + (rows - 1 - row) * PLAQUE_PITCH_Y,
      w: PLAQUE_W,
      h: PLAQUE_H,
    };
  });
})();

/** Centre x of each plaque, in profile order. */
export const SCROLL_XS: number[] = PLAQUES.map((p) => p.x);

/** Top edge (m) of the highest plaque, and the board's own height. */
export const TOP_Y = PLAQUES.length ? Math.max(...PLAQUES.map((p) => p.y + p.h / 2)) : 0;
export const BOARD_TOP = TOP_Y + 0.35;

/** Where the avatar stands to read the board (bell-side column stays clear: x is the left column). */
export const WORKSHOP_RING: [number, number] = [WORKSHOP_X - PLAQUE_PITCH_X / 2, WALL_Z + 1.5];

export const WORKSHOP_SPOT: Spot | null = WORKSHOP.length
  ? { key: "workshop", kind: "workshop", zone: "project-hall", index: 0, x: WORKSHOP_X, z: WALL_Z, yaw: 0, ring: WORKSHOP_RING }
  : null;

/** One click box per plaque (each opens that repo's card: info kind "workshop", id = the repo id). */
export const WORKSHOP_BOXES: ClickBox[] = WORKSHOP_SPOT
  ? WORKSHOP.map((w, i) => ({ spot: WORKSHOP_SPOT, w: PLAQUE_W + 0.06, h: PLAQUE_H + 0.06, d: 0.3, y: PLAQUES[i].y, dx: PLAQUES[i].x - WORKSHOP_X, item: w.id }))
  : [];

/** Beyond this distance (m) the plaques are not drawn. */
export const WORKSHOP_FAR = 40;

/** Half the board's width (m): the plaques plus a post at each end. */
export const BOARD_HALF = PLAQUES.length ? ((COLS - 1) * PLAQUE_PITCH_X) / 2 + PLAQUE_W / 2 + 0.17 : 0;
/** The board is solid (posts and boards): a thin obstacle for the nav grid. */
export const WORKSHOP_OBSTACLES: Obstacle[] = WORKSHOP.length ? [{ kind: "rect", x: WORKSHOP_X, z: WALL_Z, w: BOARD_HALF * 2, d: 0.3 }] : [];

/** Zone-style ring for the camera auto-framer (cameraRig ZONE_PRESETS.workshop). */
export const WORKSHOP_CAM_RING = WORKSHOP_SPOT ? { id: "workshop", x: WORKSHOP_RING[0], z: WORKSHOP_RING[1] } : null;
