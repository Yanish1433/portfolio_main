// The gallery's static parts, merged into the town's material buckets (0 extra draw calls): a stone plinth,
// a pedestal with a carved signboard in front of every wheel, four carved posts, beams, a wooden back screen,
// a small tiled roof with a gold finial, a pennant in each group's colour and two butter lamps.
// The wheels themselves (the brass drums, brass.ts) are WheelGallery.tsx; the plaque TEXT is WheelLabels.tsx.
import * as THREE from "three";
import { COL, type Anchors } from "../nepal/kit";
import { T, beam, box, lathe, plane, type Parts } from "../nepal/geom";
import { GALLERY } from "../zones";
import { DRUM_GROW_Y, DRUM_H, SIGN_CELL, DRUM_Y, frameWidth, pitchFor, type WheelSpec } from "./wheelLayout";
import { DOME_H } from "./brass";

/**
 * The tilted signboard in front of each pedestal (step15): centre height, forward offset and tilt about x (radians).
 * It stands clear of the pedestal and the drum, its lower edge above the plinth, tipped up toward the default camera.
 */
export const PLAQUE = { y: 0.46, dz: 0.66, tilt: -0.5 };
/** Thickness of the board's wooden frame (m), and what the plinth / pedestal take up in front of the wheels. */
export const PLAQUE_THICK = 0.06;
export const PLINTH = { top: 0.1, halfDepth: 0.9 };
export const PEDESTAL = { halfDepth: 0.335, top: 0.585 };
/** Width of a plaque (m) for `n` wheels: nearly the whole pitch, so the name can be big. */
export const plaqueWidth = (n: number) => Math.min(1.28, pitchFor(n) * 0.985);
/** Height (m) of the board's face for `n` wheels (same ratio as the atlas cell). */
export const plaqueHeight = (n: number) => plaqueWidth(n) * (SIGN_CELL[1] / SIGN_CELL[0]);

const EAVE = 2.9;
/** The carved beam the finial rods reach: its centre height, and where the rods start / end. */
const BEAM_Y = 2.5;
const ROD_BASE = DRUM_Y + (DRUM_H + DOME_H) * DRUM_GROW_Y - 0.01;
const ROD_TOP = BEAM_Y - 0.05;
const RIDGE = 3.4;

export function buildWheelGallery(P: Parts, A: Anchors, wheels: WheelSpec[]) {
  const n = wheels.length;
  if (!n) return;
  const W = frameWidth(n);
  const pitch = pitchFor(n);
  const zc = GALLERY.z;
  const xc = GALLERY.x;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const rotX = (x: number, y: number, z: number, a: number) =>
    new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), a), V(1, 1, 1));

  // plinth
  P.box("plain", W + 0.2, PLINTH.top, PLINTH.halfDepth * 2, xc, PLINTH.top / 2, zc, COL.stoneDark);
  P.box("plain", W + 0.3, 0.05, PLINTH.halfDepth * 2 + 0.05, xc, 0.025, zc, COL.stone);

  // pedestals, carved plaque boards and accent caps
  for (const w of wheels) {
    const pw = pitch * 0.94;
    P.box("wood", pw, 0.46, 0.62, w.x, 0.33, zc, COL.woodDark);
    P.box("plain", pw + 0.05, 0.05, 0.67, w.x, 0.585, zc, w.colour);
    // dark red-brown wooden hub on a short brass spindle (the drum turns on it; both are round, so they never need to move)
    const R = w.radius;
    P.add("wood", lathe([[0, 0], [R * 1.08, 0], [R * 1.08, 0.03], [R * 0.95, 0.055], [R * 0.7, 0.085], [0, 0.09]], 16), "#5a2418", T(w.x, PEDESTAL.top, zc));
    // thin brass finial rod from the dome up to the carved beam
    P.small(() => P.add("gold", lathe([[0, 0], [0.022, 0], [0.022, ROD_TOP - ROD_BASE], [0, ROD_TOP - ROD_BASE]], 6), COL.gold, T(w.x, ROD_BASE, zc)));
    P.small(() => P.add("wood", box(plaqueWidth(n) + 0.03, plaqueHeight(n) + 0.04, PLAQUE_THICK), COL.woodDark, rotX(w.x, PLAQUE.y, zc + PLAQUE.dz, PLAQUE.tilt)));
    // little cloth tassel in the group's colour at the foot of the beam
    P.small(() => P.add("cloth", plane(0.05, 0.16, 1), w.colour, T(w.x + R * 0.55, BEAM_Y - 0.16, zc + 0.05)));
  }

  // carved posts: plinth block, square shaft, flared capital and a diagonal strut to the beam
  const px = W / 2 - 0.12;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = xc + sx * px;
      const z = zc + sz * 0.55;
      P.box("wood", 0.34, 0.22, 0.34, x, 0.21, z, COL.stone);
      P.box("wood", 0.2, EAVE - 0.3, 0.2, x, 0.32 + (EAVE - 0.3) / 2, z, COL.wood);
      P.box("wood", 0.1, EAVE - 0.9, 0.04, x, 1.6, z + sz * 0.11, COL.brickDark); // carved panel
      P.box("wood", 0.36, 0.14, 0.36, x, EAVE - 0.05, z, COL.woodDark);
      P.add("wood", beam(V(x, EAVE - 0.55, z), V(x - sx * 0.45, EAVE - 0.05, z), 0.07, 0.07), COL.woodDark);
    }
  }
  // beams along the front and back, and the ridge
  for (const sz of [-1, 1]) P.box("wood", W + 0.2, 0.18, 0.18, xc, EAVE + 0.08, zc + sz * 0.55, COL.woodDark);
  P.box("wood", W + 0.2, 0.14, 0.14, xc, RIDGE - 0.1, zc, COL.woodDark);

  // carved beam over the wheels, with a small pagoda-style edge: a dark board, a lattice of tiny brackets under it and
  // a thin sloping eave on top
  P.box("wood", W - 0.1, 0.16, 0.34, xc, BEAM_Y, zc, COL.woodDark);
  P.box("wood", W - 0.1, 0.05, 0.42, xc, BEAM_Y + 0.105, zc, COL.wood);
  P.add("roof", box(W + 0.1, 0.035, 0.22), "#ffffff", rotX(xc, BEAM_Y + 0.16, zc + 0.23, 0.45));
  P.small(() => {
    const step = 0.14;
    for (let x = xc - W / 2 + 0.2; x < xc + W / 2 - 0.15; x += step) {
      P.box("wood", 0.07, 0.07, 0.07, x, BEAM_Y - 0.115, zc + 0.14, COL.woodDark);
      P.box("wood", 0.025, 0.1, 0.03, x + step / 2, BEAM_Y - 0.1, zc + 0.16, COL.brickDark);
    }
  });

  // wooden back screen (a lattice band on top) so the golden drums read against it
  P.box("wood", W - 0.2, 2.0, 0.07, xc, 1.12, zc - 0.55, COL.wood);
  P.box("lattice", W - 0.2, 0.5, 0.05, xc, 2.4, zc - 0.55, "#ffffff");

  // small tiled roof: two slopes meeting at a ridge, a gold finial in the middle
  const run = 0.95;
  const slope = Math.atan2(RIDGE - EAVE, run);
  const len = Math.hypot(run, RIDGE - EAVE) + 0.12;
  for (const sz of [-1, 1]) {
    P.add("roof", box(W + 0.5, 0.07, len), "#ffffff", rotX(xc, (RIDGE + EAVE) / 2 + 0.02, zc + sz * (run / 2 - 0.02), sz * slope));
    P.box("roof", W + 0.5, 0.05, 0.12, xc, EAVE - 0.03, zc + sz * (run + 0.02), COL.woodDark); // eave board
  }
  P.box("wood", W + 0.5, 0.1, 0.2, xc, RIDGE + 0.04, zc, COL.woodDark);
  P.small(() => {
    P.add("gold", lathe([[0, 0], [0.16, 0], [0.1, 0.1], [0.12, 0.2], [0.04, 0.34], [0, 0.5]], 8), COL.gold, T(xc, RIDGE + 0.08, zc));
    for (const sx of [-1, 1]) P.add("gold", lathe([[0, 0], [0.08, 0], [0.04, 0.08], [0, 0.2]], 6), COL.gold, T(xc + sx * (W / 2 + 0.2), RIDGE + 0.08, zc));
  });

  // a pennant in each group's colour above every wheel
  for (const w of wheels) {
    const g = plane(Math.min(0.26, pitch * 0.22), 0.5, 4);
    g.translate(0, -0.25, 0);
    P.add("cloth", g, w.colour, T(w.x, EAVE - 0.04, zc + 0.58));
  }

  // two butter lamps on little stone blocks, one at each end of the lane in front
  for (const sx of [-1, 1]) {
    const x = xc + sx * (W / 2 - 0.1);
    P.small(() => P.box("plain", 0.32, 0.3, 0.32, x, 0.15, zc + 1.0, COL.stone));
    A.diyos.push(V(x, 0.32, zc + 1.0));
  }
}
