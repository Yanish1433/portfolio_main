// Static geometry of the potter's corner, built in world coordinates (the meshes sit at the origin):
//  - WOOD: kick wheel (frame, flywheel, head), shelf, water bucket
//  - CLAY: clay pile, drying pots and the pots on the shelf
//  Both are merged into ONE mesh on the clay material (rebuilt when a pot is added), so the idle corner is a single draw call.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Parts, T } from "../nepal/geom";
import { COL } from "../nepal/kit";
import { BANDS, clampClay, type Clay } from "./clayProfile";
import { ClayGeometry } from "./clayGeometry";
import { bandWeight, glazeFor, toCss } from "./glaze";
import { DRYING, PILE, SHELF, WHEEL, ATLAS, SHELF_SCALE, shelfSlot, shelfYaw } from "./layout";
import { type SavedPot } from "./save";

export { ATLAS, SHELF_SCALE };
const SHELF_SEG = 14;
const SHELF_STEP = 2;

function buildWoodGeometry(): THREE.BufferGeometry | null {
  const P = new Parts();
  const W = COL.wood;
  const D = COL.woodDark;
  const { x: wx, z: wz } = WHEEL;
  // kick wheel: four legs, two stretchers, a top plate, the shaft, the stone flywheel and the wheel head
  for (const sx of [-0.42, 0.42]) for (const sz of [-0.33, 0.33]) P.box("wood", 0.08, 0.66, 0.08, wx + sx, 0.33, wz + sz, D);
  P.box("wood", 0.08, 0.06, 0.74, wx - 0.42, 0.16, wz, W);
  P.box("wood", 0.08, 0.06, 0.74, wx + 0.42, 0.16, wz, W);
  P.box("wood", 0.96, 0.07, 0.78, wx, 0.665, wz, W);
  P.add("wood", new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8), D, T(wx, 0.4, wz));
  P.add("wood", new THREE.CylinderGeometry(0.34, 0.34, 0.07, 18), COL.stone, T(wx, 0.14, wz));
  P.add("wood", new THREE.CylinderGeometry(WHEEL.headR, WHEEL.headR * 0.92, 0.06, 20), COL.stoneDark, T(wx, WHEEL.headY - 0.03, wz));
  // shelf: two posts and three boards
  const sx = SHELF.x;
  const sz = SHELF.z;
  for (const dx of [-1, 1]) P.box("wood", 0.09, 1.78, 0.4, sx + dx * (SHELF.w / 2 + 0.02), 0.89, sz, D);
  for (const y of SHELF.boards) P.box("wood", SHELF.w + 0.1, 0.05, SHELF.d, sx, y, sz, W);
  // water bucket by the wheel
  P.add("wood", new THREE.CylinderGeometry(0.17, 0.14, 0.3, 12, 1, true), D, T(15.45, 0.15, 5.15));
  P.add("wood", new THREE.CylinderGeometry(0.14, 0.14, 0.02, 12), "#5d7f86", T(15.45, 0.24, 5.15));
  return P.merge().get("wood") ?? null;
}

/** A few simple drying-pot shapes (valid clay profiles). */
function preset(kind: number): Clay {
  const r: number[] = [];
  for (let k = 0; k < BANDS; k++) {
    const t = k / (BANDS - 1);
    if (kind === 0) r.push(0.2 + 0.14 * Math.sin(Math.PI * Math.min(1, t * 1.1))); // round belly
    else if (kind === 1) r.push(0.16 + 0.2 * t * t); // flaring bowl
    else r.push(0.26 - 0.09 * Math.abs(t - 0.45)); // squat jar
  }
  return clampClay({ r, h: kind === 1 ? 0.34 : 0.55 });
}

const tint = new THREE.Color();
const rimTint = new THREE.Color();

/** One finished pot as a non-indexed geometry (position, normal, uv, color), placed and scaled. `cell` maps its uv.x into the atlas (-1 = no decal). */
function potGeometry(r: ArrayLike<number>, h: number, colour: string, rimColour: string | null, scale: number, x: number, y: number, z: number, yaw: number, cell: number): THREE.BufferGeometry {
  const cg = new ClayGeometry(SHELF_SEG, SHELF_STEP);
  cg.update(r, h);
  const g = cg.geometry.toNonIndexed();
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    if (cell >= 0) uv.setX(i, (cell + uv.getX(i)) / ATLAS.cells);
    else {
      uv.setX(i, 0);
      uv.setY(i, 0);
    }
  }
  const col = g.attributes.color as THREE.BufferAttribute;
  tint.set(colour);
  if (rimColour) {
    // glaze: body colour with the full-colour rim lip + belly band (same band function as the wheel shader, from uv.y before the atlas remap)
    rimTint.set(rimColour);
    for (let i = 0; i < col.count; i++) {
      const w = bandWeight(uv.getY(i));
      col.setXYZ(i, tint.r + (rimTint.r - tint.r) * w, tint.g + (rimTint.g - tint.g) * w, tint.b + (rimTint.b - tint.b) * w);
    }
  } else for (let i = 0; i < col.count; i++) col.setXYZ(i, tint.r, tint.g, tint.b);
  g.applyMatrix4(T(x, y, z, yaw, scale));
  return g;
}

/** Hash 0..1 from an index (stable slight colour variation per shelf pot). */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function potColour(i: number): string {
  const c = new THREE.Color("#c4663a");
  c.offsetHSL((hash(i) - 0.5) * 0.02, 0, (hash(i + 9) - 0.5) * 0.08);
  return `#${c.getHexString()}`;
}

/** The clay mesh: the clay pile, the drying pots and every saved pot on its shelf slot. Rebuilt when the shelf changes. */
export function buildPotsGeometry(pots: readonly SavedPot[], hexFor?: (skill: string) => string | null): THREE.BufferGeometry | null {
  const P = new Parts();
  const lump = new THREE.SphereGeometry(0.3, 10, 7);
  P.add("clay", lump, "#8b6a55", T(PILE.x, 0.17, PILE.z, 0.4, [1.1, 0.62, 0.95]));
  P.add("clay", lump, "#80614e", T(PILE.x - 0.25, 0.12, PILE.z - 0.3, 1.1, [0.7, 0.45, 0.65]));
  P.add("clay", lump, "#94735c", T(PILE.x + 0.2, 0.3, PILE.z + 0.05, 2.0, [0.6, 0.42, 0.55]));
  // a plank under the drying pots
  P.box("clay", 1.3, 0.05, 1.0, 15.75, 0.025, 3.95, "#7a5a45");
  const parts: THREE.BufferGeometry[] = [];
  // the kick wheel and the shelf frame ride in the same mesh (one draw call for the whole idle corner): flat vertex colours, no atlas lookup
  const wood = buildWoodGeometry();
  if (wood) {
    const uv = wood.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0, 0);
    parts.push(wood);
  }
  const stat = P.merge().get("clay");
  if (stat) parts.push(stat);
  DRYING.forEach(([x, z, s], i) => {
    const c = preset(i);
    parts.push(potGeometry(c.r, c.h, "#cfa985", null, s * 0.62, x, 0.05, z, i * 1.3, -1));
  });
  pots.forEach((p, i) => {
    const slot = shelfSlot(i);
    // saved pots are glazed in their skill's colour once the (lazy) logo table is in; terracotta until then. The skill id is the only input: old saves just work.
    const gl = hexFor ? glazeFor(hexFor(p.skill)) : null;
    parts.push(potGeometry(p.r, p.h, gl ? toCss(gl.body) : potColour(i), gl ? toCss(gl.rim) : null, SHELF_SCALE, slot.x, slot.y, slot.z, shelfYaw(i), i));
  });
  const merged = mergeGeometries(parts, false);
  merged?.computeBoundingSphere();
  parts.forEach((g) => g.dispose());
  return merged;
}
