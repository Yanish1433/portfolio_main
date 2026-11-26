// The Workshop: one hanging paper scroll per GitHub-only project, on a carved board standing just
// east of the dalan (beyond the east wing's roof, so the 45 degree camera sees it). Pure maths, so it can be tested.
import { profile, type WorkshopProject } from "@/content/profile";
import type { Obstacle } from "../zones";
import type { ClickBox, Spot } from "./spots";

export const WORKSHOP: WorkshopProject[] = profile.workshop ?? [];

/** Scroll size and spacing (m). */
export const SCROLL_W = 0.44;
export const SCROLL_H = 0.9;
export const SCROLL_PITCH = 0.5;
/** Scroll paper hangs from y = ROD_Y down. */
export const ROD_Y = 2.3;
/** Where the board of scrolls is centred (x) and its depth (z). */
export const WORKSHOP_X = 9.6;
export const WALL_Z = -13.4;

/** Centre x of each scroll, in profile order. */
export const SCROLL_XS: number[] = WORKSHOP.map((_, i) => WORKSHOP_X + (i - (WORKSHOP.length - 1) / 2) * SCROLL_PITCH);

export const WORKSHOP_SPOT: Spot | null = WORKSHOP.length
  ? { key: "workshop", kind: "workshop", zone: "project-hall", index: 0, x: WORKSHOP_X, z: WALL_Z, yaw: 0, ring: [WORKSHOP_X, WALL_Z + 1.4] }
  : null;

/** One click box per scroll (each opens that repo's card). */
export const WORKSHOP_BOXES: ClickBox[] = WORKSHOP_SPOT
  ? WORKSHOP.map((w, i) => ({ spot: WORKSHOP_SPOT, w: SCROLL_W + 0.06, h: SCROLL_H + 0.2, d: 0.3, y: ROD_Y - SCROLL_H / 2, dx: SCROLL_XS[i] - WORKSHOP_X, item: w.id }))
  : [];

/** Beyond this distance (m) the scrolls are not drawn. */
export const WORKSHOP_FAR = 35;

/** Half the board's width (m): the scrolls plus a post at each end. */
export const BOARD_HALF = SCROLL_XS.length ? (SCROLL_XS[SCROLL_XS.length - 1] - SCROLL_XS[0]) / 2 + SCROLL_W / 2 + 0.15 : 0;
/** The board is solid (posts and boards): a thin obstacle for the nav grid. */
export const WORKSHOP_OBSTACLES: Obstacle[] = WORKSHOP.length ? [{ kind: "rect", x: WORKSHOP_X, z: WALL_Z, w: BOARD_HALF * 2, d: 0.3 }] : [];
