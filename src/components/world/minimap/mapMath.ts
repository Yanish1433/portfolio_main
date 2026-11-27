// Pure helpers for the mini-map: world (metres) <-> map (SVG units), arrow angle, zone hit-test, visibility rule.
// No React, no three.js: node:test covers it (mapMath.test.ts).
import { WALL } from "../zones";

/**
 * Extra turn of the map, radians. 0 = NORTH-UP, which matches the default follow camera (it sits south of the
 * avatar looking north, so up the screen is -z and right is +x). Change this to spin the map (e.g. a heading-up map).
 */
export const MAP_ROTATION = 0;

/** The SVG viewBox is VIEW x VIEW units; the round map fills it. */
export const VIEW = 200;
export const CENTER = VIEW / 2;
/** Radius of the round map in SVG units (a little air for the ring stroke). */
export const MAP_R = 96;
/** World radius (m) that lands on the circle's edge: the outside face of the wall. */
export const MAP_WORLD_R = WALL.outer;
/** SVG units per metre. */
export const SCALE = MAP_R / MAP_WORLD_R;

export type P = [number, number];

/** World [x, z] (m) -> map [x, y] (SVG units). North (-z) is up. Points beyond the island are clamped onto the circle's edge. */
export function worldToMap(x: number, z: number, rotation = MAP_ROTATION, clamp = true): P {
  // up the screen = -z, right = +x; then the optional extra turn
  let mx = x * SCALE;
  let my = z * SCALE;
  if (rotation) {
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    [mx, my] = [mx * c - my * s, mx * s + my * c];
  }
  if (clamp) {
    const r = Math.hypot(mx, my);
    if (r > MAP_R) {
      mx = (mx / r) * MAP_R;
      my = (my / r) * MAP_R;
    }
  }
  return [CENTER + mx, CENTER + my];
}

/** Map [x, y] -> world [x, z] (inverse of the unclamped worldToMap). */
export function mapToWorld(mx: number, my: number, rotation = MAP_ROTATION): P {
  let dx = mx - CENTER;
  let dy = my - CENTER;
  if (rotation) {
    const c = Math.cos(-rotation);
    const s = Math.sin(-rotation);
    [dx, dy] = [dx * c - dy * s, dx * s + dy * c];
  }
  return [dx / SCALE, dy / SCALE];
}

/** Avatar heading (rad about +Y, 0 = +z = south) -> degrees to rotate an arrow that is drawn pointing UP. */
export function arrowDegrees(heading: number, rotation = MAP_ROTATION): number {
  return ((Math.PI - heading + rotation) * 180) / Math.PI;
}

export type MapTarget = { id: string; x: number; y: number };

/** The target nearest to a map point and within `radius` units, or null. */
export function hitZone<T extends MapTarget>(px: number, py: number, targets: readonly T[], radius: number): T | null {
  let best: T | null = null;
  let bestD = radius;
  for (const t of targets) {
    const d = Math.hypot(t.x - px, t.y - py);
    if (d <= bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

/** What the map's visibility depends on (all existing store flags, plus `intro` and `phone` which the component supplies). */
export type MapVisibility = {
  loaded: boolean;
  character: boolean;
  pickerOpen: boolean;
  cinema: boolean;
  cameraMode: string;
  /** The first-visit fly-in is still gliding down. */
  intro: boolean;
  phone: boolean;
  /** A book panel (info panel) is open. */
  bookOpen: boolean;
};

/** Hidden in cinema/video, eagle view (and the glides in/out), the fly-in, the loading screen, and behind a book panel on phones. */
export function mapHidden(v: MapVisibility): boolean {
  if (!v.loaded || !v.character || v.pickerOpen || v.intro) return true;
  if (v.cinema || v.cameraMode !== "follow") return true;
  return v.phone && v.bookOpen;
}
