// The gallery's static parts, merged into the town's material buckets (0 extra draw calls): a stone plinth,
// a pedestal with a carved plaque board under every wheel, four carved posts, beams, a wooden back screen,
// a small tiled roof with a gold finial, a pennant in each group's colour and two butter lamps.
// The wheels themselves (the golden drums) are WheelGallery.tsx; the plaque TEXT is WheelLabels.tsx.
import * as THREE from "three";
import { COL, type Anchors } from "../nepal/kit";
import { T, beam, box, lathe, plane, type Parts } from "../nepal/geom";
import { GALLERY } from "../zones";
import { DRUM_Y, frameWidth, pitchFor, type WheelSpec } from "./wheelLayout";

/** The tilted plaque board in front of each pedestal: height, forward offset and tilt about x (radians). */
export const PLAQUE = { y: 0.34, dz: 0.38, tilt: -0.5 };
/** Width of a plaque (m) for `n` wheels. */
export const plaqueWidth = (n: number) => Math.min(1.17, pitchFor(n) * 0.9);

const EAVE = 2.9;
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
  P.box("plain", W + 0.2, 0.1, 1.45, xc, 0.05, zc, COL.stoneDark);
  P.box("plain", W + 0.3, 0.05, 1.5, xc, 0.025, zc, COL.stone);

  // pedestals, carved plaque boards and accent caps
  for (const w of wheels) {
    const pw = pitch * 0.94;
    P.box("wood", pw, 0.46, 0.62, w.x, 0.33, zc, COL.woodDark);
    P.box("plain", pw + 0.05, 0.05, 0.67, w.x, 0.585, zc, w.colour);
    P.add("gold", lathe([[0, 0], [w.radius * 1.15, 0], [w.radius * 1.15, 0.02], [0, 0.02]], 10), COL.gold, T(w.x, DRUM_Y - 0.03, zc));
    P.small(() => P.add("wood", box(plaqueWidth(n) + 0.07, 0.46, 0.06), COL.woodDark, rotX(w.x, PLAQUE.y, zc + PLAQUE.dz, PLAQUE.tilt)));
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
