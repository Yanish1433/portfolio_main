// Static geometry of the pathshala displays (stone plaques, certificate easels, the course
// bookshelf), appended to the town's merged Parts like the dalan (no extra draw calls).
import * as THREE from "three";
import { Parts, T, beam, box, lathe } from "../nepal/geom";
import { COL, type Anchors } from "../nepal/kit";
import { slope } from "./shapes";
import { EASELS, PLAQUES, SHELF } from "./pathshalaLayout";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Rounded-top stone stele outline (like the town's inscription stones). */
function steleGeometry(w: number, h: number, depth: number) {
  const s = new THREE.Shape();
  const hw = w / 2;
  const shoulder = h - hw * 0.55;
  s.moveTo(-hw, 0);
  s.lineTo(hw, 0);
  s.lineTo(hw, shoulder);
  s.quadraticCurveTo(hw, h, 0, h);
  s.quadraticCurveTo(-hw, h, -hw, shoulder);
  s.lineTo(-hw, 0);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 4 });
}

function plaques(P: Parts, A: Anchors) {
  for (const p of PLAQUES) {
    P.box("plain", p.w + 0.16, 0.2, 0.38, p.x, 0.1, p.z, COL.stoneDark);
    P.add("plain", steleGeometry(p.w, p.h, 0.14), "#b8b0a2", T(p.x, 0.2, p.z - 0.07));
    A.diyos.push(V(p.x + p.w / 2 - 0.05, 0.22, p.z + 0.13));
  }
}

function easels(P: Parts) {
  for (const e of EASELS) {
    const m = T(e.x, 0, e.z, e.yaw);
    const at = (x: number, y: number, z: number) => m.clone().multiply(T(x, y, z));
    const cy = 0.86 + e.h / 2;
    for (const s of [-1, 1]) P.add("wood", beam(V(s * (e.w / 2 + 0.03), 0, 0.05), V(s * (e.w / 2 + 0.01), cy + e.h / 2 + 0.16, 0), 0.055), COL.wood, m);
    P.add("wood", beam(V(0, cy + e.h / 2 + 0.1, -0.03), V(0, 0, -0.42), 0.05), COL.woodDark, m);
    P.add("wood", box(e.w + 0.14, 0.05, 0.12), COL.woodDark, at(0, 0.82, 0.03)); // ledge
    // gilded frame around the certificate
    P.add("gold", box(e.w + 0.1, e.h + 0.1, 0.035), COL.gold, at(0, cy, 0));
    P.add("wood", box(e.w + 0.02, e.h + 0.02, 0.02), COL.woodDark, at(0, cy, 0.012));
  }
}

function shelf(P: Parts, A: Anchors) {
  const s = SHELF;
  const z = s.z;
  P.box("plain", s.w + 0.14, s.base - 0.04, s.d + 0.1, s.x, (s.base - 0.04) / 2, z, COL.stone);
  for (const sx of [-1, 1]) P.box("wood", 0.07, s.h - s.base + 0.04, s.d, s.x + sx * (s.w / 2 + 0.035), s.base + (s.h - s.base) / 2, z, COL.wood);
  P.box("wood", s.w, s.h - s.base, 0.03, s.x, s.base + (s.h - s.base) / 2, z - s.d / 2 + 0.015, COL.woodDark);
  for (let r = 0; r <= s.rows; r++) P.box("wood", s.w, 0.04, s.d, s.x, s.base + r * s.rowH + 0.02, z, COL.wood);
  // small tiled hood with carved struts
  slope(P, "roof", s.x, s.w + 0.6, z - s.d / 2, s.h + 0.42, z + s.d / 2 + 0.42, s.h + 0.12, 0.07, "#fff");
  for (const sx of [-1, 1]) P.add("wood", beam(V(s.x + sx * (s.w / 2 + 0.03), s.h - 0.2, z + s.d / 2 - 0.02), V(s.x + sx * (s.w / 2 + 0.1), s.h + 0.12, z + s.d / 2 + 0.38), 0.05, 0.08), COL.woodDark);
  // empty shelves get a few clay pots
  const used = new Set(s.books.map((b) => Math.round((b.y - b.h / 2 - s.base - 0.04) / s.rowH)));
  for (let r = 0; r < s.rows; r++) {
    if (used.has(r)) continue;
    for (const k of [-1, 0, 1]) {
      const pot = lathe([[0, 0], [0.07, 0], [0.1, 0.07], [0.08, 0.16], [0.05, 0.2], [0.06, 0.23]], 8);
      P.small(() => P.add("clay", pot, k === 0 ? "#a35a36" : "#b8703f", T(s.x + k * s.w * 0.28, s.base + r * s.rowH + 0.04, z + 0.02)));
    }
  }
  A.diyos.push(V(s.x - s.w / 2 + 0.1, s.h + 0.02, z + s.d / 2 - 0.08));
}

export function buildPathshalaParts(P: Parts, A: Anchors) {
  // plaques and easels are small props: drawn, but skipped by the shadow pass
  P.small(() => {
    plaques(P, A);
    easels(P);
  });
  shelf(P, A);
}
