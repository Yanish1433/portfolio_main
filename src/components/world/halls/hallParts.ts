// Static geometry of the Project Dalan (and, via pathshalaParts.ts, the pathshala displays), appended to the town's
// merged Parts (so it costs no extra draw calls: it shares the town's wood / gold / stone /
// roof / lattice meshes). Text surfaces (posters, plates, plaque faces, certificates, book
// spines) are drawn separately from one atlas per zone (Halls.tsx).
//
// Motifs: lattice (jhyal) panels, toran arches with a plain medallion, carved struts.
// No deity faces and no religious symbols.
import * as THREE from "three";
import { Parts, T, beam, box, lathe, plane } from "../nepal/geom";
import { COL, type Anchors } from "../nepal/kit";
import { DALAN, DIORAMAS, PALACE_FRONT, STAND_DEPTH, STANDS, dalanPillars, type Diorama } from "./layout";
import type { DioramaBlock } from "./showcaseView";
import { dioramaStats } from "./spots";
import { buildPathshalaParts } from "./pathshalaParts";
import { slope } from "./shapes";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Pent roof height at the palace wall and at its front edge. */
const ROOF_WALL_Y = 3.75;
const ROOF_EDGE_Y = 3.22;
const ROOF_EDGE_Z = STANDS.length ? STANDS[0].z + 0.6 : PALACE_FRONT + 1.55;
const LINTEL_Y = 3.02;

/** Arch outline (toran): flat bottom, rounded shoulders, small peak, with a round opening. */
function toranGeometry(w: number, h: number) {
  const s = new THREE.Shape();
  const hw = w / 2;
  s.moveTo(-hw, 0);
  s.lineTo(hw, 0);
  s.quadraticCurveTo(hw, h * 0.62, hw * 0.3, h * 0.8);
  s.lineTo(0, h);
  s.lineTo(-hw * 0.3, h * 0.8);
  s.quadraticCurveTo(-hw, h * 0.62, -hw, 0);
  const hole = new THREE.Path();
  hole.absarc(0, h * 0.36, Math.min(h, w) * 0.2, 0, Math.PI * 2, false);
  s.holes.push(hole);
  return new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false, curveSegments: 3 });
}

function dalan(P: Parts, A: Anchors) {
  for (const [a, b] of DALAN.wings) {
    const mid = (a + b) / 2;
    const w = b - a;
    // stone floor of the gallery
    P.add("slab", box(w, 0.03, DALAN.z1 - DALAN.z0), "#fff", T(mid, 0.016, (DALAN.z0 + DALAN.z1) / 2));
    // carved frieze on the back wall: dark beam with a lattice band
    P.box("wood", w, 0.36, 0.07, mid, 2.62, PALACE_FRONT + 0.035, COL.woodDark);
    P.add("lattice", plane(w - 0.2, 0.24, 1, true), "#fff", T(mid, 2.62, PALACE_FRONT + 0.08));
    // lintel along the pillar line, pent roof from the wall down to the eave, fascia
    const lz = STANDS.length ? STANDS[0].z : PALACE_FRONT + 0.95;
    P.box("wood", w, 0.2, 0.26, mid, LINTEL_Y + 0.1, lz, COL.woodDark);
    P.box("wood", w + 0.1, 0.12, 0.3, mid, LINTEL_Y + 0.26, lz, COL.wood);
    slope(P, "roof", mid, w + 0.4, PALACE_FRONT, ROOF_WALL_Y, ROOF_EDGE_Z, ROOF_EDGE_Y, 0.1, "#fff");
    slope(P, "wood", mid, w + 0.36, PALACE_FRONT, ROOF_WALL_Y - 0.1, ROOF_EDGE_Z, ROOF_EDGE_Y - 0.1, 0.04, COL.woodDark);
    P.box("wood", w + 0.42, 0.14, 0.08, mid, ROOF_EDGE_Y - 0.06, ROOF_EDGE_Z + 0.02, COL.woodDark);
    A.garlands.push({ a: V(a + 0.25, LINTEL_Y - 0.02, lz + 0.16), b: V(b - 0.25, LINTEL_Y - 0.02, lz + 0.16), drop: 0.28 });
    A.lanterns.push(V(a + 0.2, 2.55, lz + 0.3), V(b - 0.2, 2.55, lz + 0.3));
  }
  // carved pillars (khamba) with a stone base, a capital and a strut up to the eave
  for (const [x, z] of dalanPillars()) {
    P.box("plain", 0.3, 0.18, 0.3, x, 0.09, z, COL.stone);
    P.box("wood", 0.18, LINTEL_Y - 0.18, 0.18, x, 0.18 + (LINTEL_Y - 0.18) / 2, z, COL.wood);
    P.box("wood", 0.24, 0.5, 0.24, x, 0.75, z, COL.woodDark); // carved band low on the shaft
    P.box("wood", 0.44, 0.14, 0.3, x, LINTEL_Y - 0.07, z, COL.woodDark); // capital
    P.add("wood", beam(V(x, LINTEL_Y - 0.55, z + 0.1), V(x, ROOF_EDGE_Y - 0.12, ROOF_EDGE_Z - 0.04), 0.08, 0.14), COL.wood);
  }
}

function stands(P: Parts, A: Anchors) {
  // the stands are small props: they are drawn but skip the shadow pass
  P.small(() => standMeshes(P, A));
}

function standMeshes(P: Parts, A: Anchors) {
  for (const s of STANDS) {
    const { x, z, w } = s;
    const scr = s.screen;
    const top = scr.y + scr.h / 2;
    const bottom = scr.y - scr.h / 2;
    P.box("plain", w, 0.22, STAND_DEPTH, x, 0.11, z, COL.stone);
    P.box("plain", w + 0.06, 0.05, STAND_DEPTH + 0.06, x, 0.245, z, COL.stoneDark);
    for (const sx of [-1, 1]) P.box("wood", 0.11, top + 0.12 - 0.27, 0.14, x + sx * (w / 2 - 0.055), 0.27 + (top + 0.12 - 0.27) / 2, z + 0.02, COL.wood);
    // screen backing + rails
    P.box("wood", w - 0.1, scr.h + 0.14, 0.06, x, scr.y, z - 0.02, COL.woodDark);
    P.box("wood", w, 0.1, 0.13, x, top + 0.07, z + 0.02, COL.wood);
    P.box("wood", w, 0.1, 0.13, x, bottom - 0.07, z + 0.02, COL.wood);
    // lattice panel under the screen, brass plate on its rail
    P.box("wood", w - 0.12, 0.4, 0.05, x, 0.5, z - 0.02, COL.woodDark);
    P.add("lattice", plane(w - 0.22, 0.34, 1, true), "#fff", T(x, 0.5, z + 0.02));
    const pw = Math.min(0.9, w - 0.32);
    P.box("gold", pw + 0.04, 0.18, 0.025, x, bottom - 0.2, z + 0.05, COL.bronze);
    // toran arch on top, gilded, with a plain round medallion and a small finial
    P.add("gold", toranGeometry(w + 0.04, 0.42), COL.gold, T(x, top + 0.12, z - 0.01));
    P.add("gold", new THREE.CircleGeometry(0.07, 8), "#d9b25a", T(x, top + 0.12 + 0.42 * 0.36, z + 0.02));
    P.add("gold", lathe([[0, 0], [0.05, 0], [0.03, 0.08], [0, 0.16]], 6), COL.gold, T(x, top + 0.54, z + 0.01));
    A.diyos.push(V(x + w / 2 - 0.12, 0.28, z + STAND_DEPTH / 2 - 0.06));
    if (s.flagship) {
      // the flagship: gilded edging round the screen and a second diyo
      P.box("gold", w - 0.06, 0.035, 0.03, x, top + 0.005, z + 0.075, COL.gold);
      P.box("gold", w - 0.06, 0.035, 0.03, x, bottom - 0.005, z + 0.075, COL.gold);
      for (const sx of [-1, 1]) P.box("gold", 0.035, scr.h + 0.04, 0.03, x + sx * (scr.w / 2 + 0.02), scr.y, z + 0.075, COL.gold);
      A.diyos.push(V(x - w / 2 + 0.12, 0.28, z + STAND_DEPTH / 2 - 0.06));
    }
  }
}

// --- Architecture dioramas ---------------------------------------------------
// One carved plinth per project stand with a tiny Newari building per layer. Everything goes into
// materials that already have a shadow-free "small" mesh (plain, wood, gold, clay, lattice), with
// brick and tile as vertex colours: 0 new draw calls, ~300-450 triangles per diorama, no shadow
// pass. The glowing road is in the poster atlas and the packets / labels are in Dioramas.tsx.

const D_COL = { brick: "#a4503a", brickDark: "#7d3a2a", tile: "#5a3a2e", plaster: "#efe4d0", earth: "#8a7a62" };

/** Triangular prism (gable roof) along x: base w, height h, depth d, sitting on y = 0. */
function prism(w: number, h: number, d: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

/** Square tier roof (4-sided frustum), base on y = 0. */
function tier(rBottom: number, rTop: number, h: number) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, 4, 1);
  g.rotateY(Math.PI / 4);
  g.translate(0, h / 2, 0);
  return g;
}

function block(P: Parts, b: DioramaBlock, x: number, y: number, z: number) {
  const s = b.s;
  switch (b.kind) {
    case "shop": {
      // shop-front: two storeys, open shutters, a small gold sign, gable roof
      P.box("plain", 0.2 * s, 0.14 * s, 0.15 * s, x, y + 0.07 * s, z, D_COL.brick);
      P.box("wood", 0.16 * s, 0.065 * s, 0.012, x, y + 0.04 * s, z + 0.075 * s, COL.woodDark);
      P.box("wood", 0.18 * s, 0.012 * s, 0.03 * s, x, y + 0.08 * s, z + 0.085 * s, COL.wood);
      P.add("lattice", plane(0.12 * s, 0.035 * s, 1, true), "#fff", T(x, y + 0.115 * s, z + 0.077 * s));
      P.box("gold", 0.08 * s, 0.018 * s, 0.006, x, y + 0.093 * s, z + 0.1 * s, COL.gold);
      P.add("plain", prism(0.23 * s, 0.07 * s, 0.18 * s), D_COL.tile, T(x, y + 0.14 * s, z));
      return;
    }
    case "pagoda": {
      // pagoda-roofed hut: stone step, brick body, two tile tiers, gold finial
      P.box("plain", 0.18 * s, 0.025 * s, 0.18 * s, x, y + 0.0125 * s, z, COL.stone);
      P.box("plain", 0.12 * s, 0.09 * s, 0.12 * s, x, y + 0.07 * s, z, D_COL.brick);
      P.box("wood", 0.04 * s, 0.06 * s, 0.01, x, y + 0.055 * s, z + 0.062 * s, COL.woodDark);
      P.add("plain", tier(0.14 * s, 0.06 * s, 0.04 * s), D_COL.tile, T(x, y + 0.115 * s, z));
      P.box("wood", 0.07 * s, 0.045 * s, 0.07 * s, x, y + 0.1775 * s, z, COL.wood);
      P.add("plain", tier(0.09 * s, 0.012 * s, 0.05 * s), D_COL.tile, T(x, y + 0.2 * s, z));
      P.add("gold", new THREE.ConeGeometry(0.013 * s, 0.045 * s, 4), COL.gold, T(x, y + 0.27 * s, z));
      return;
    }
    case "granary": {
      // round store-house (dhukuti): clay drum with wooden hoops, thatched cone
      P.add("clay", new THREE.CylinderGeometry(0.075 * s, 0.08 * s, 0.12 * s, 10), D_COL.plaster, T(x, y + 0.06 * s, z));
      for (const hy of [0.035, 0.085]) P.add("wood", new THREE.CylinderGeometry(0.082 * s, 0.082 * s, 0.01 * s, 10, 1, true), COL.wood, T(x, y + hy * s, z));
      P.box("wood", 0.035 * s, 0.06 * s, 0.01, x, y + 0.03 * s, z + 0.078 * s, COL.woodDark);
      P.add("clay", new THREE.ConeGeometry(0.1 * s, 0.075 * s, 10), "#b08a4a", T(x, y + 0.1575 * s, z));
      return;
    }
    default: {
      // a small generic house
      P.box("plain", 0.16 * s, 0.1 * s, 0.14 * s, x, y + 0.05 * s, z, D_COL.plaster);
      P.box("plain", 0.165 * s, 0.025 * s, 0.145 * s, x, y + 0.0125 * s, z, D_COL.brickDark);
      P.box("wood", 0.035 * s, 0.055 * s, 0.01, x - 0.03 * s, y + 0.0275 * s, z + 0.071 * s, COL.woodDark);
      P.box("wood", 0.035 * s, 0.03 * s, 0.01, x + 0.04 * s, y + 0.065 * s, z + 0.071 * s, COL.woodDark);
      P.add("plain", prism(0.19 * s, 0.06 * s, 0.17 * s), D_COL.tile, T(x, y + 0.1 * s, z));
    }
  }
}

function diorama(P: Parts, d: Diorama) {
  const { x, z, w, d: depth, top } = d;
  const body = top - 0.04;
  // carved plinth: stone body, a wooden moulding, a lattice front panel and a darker cap
  P.box("plain", w, body, depth, x, body / 2, z, COL.stone);
  P.box("wood", w + 0.012, 0.045, depth + 0.012, x, 0.07, z, COL.woodDark);
  P.add("lattice", plane(w - 0.14, body - 0.14, 1, true), "#fff", T(x, (body + 0.09) / 2 + 0.02, z + depth / 2 + 0.004));
  P.box("plain", w + 0.04, 0.04, depth + 0.04, x, top - 0.02, z, COL.stoneDark);
  // a strip of earth along the back for the buildings to stand on
  P.box("plain", w - 0.04, 0.008, depth * 0.55, x, top + 0.004, z - depth * 0.12, D_COL.earth);
  for (const b of d.blocks) block(P, b, x + b.x, top + 0.008, z - depth * 0.12);
}

function triangles(P: Parts) {
  let n = 0;
  for (const map of [P.buckets, P.noCast]) for (const list of map.values()) for (const g of list) n += g.attributes.position.count / 3;
  return n;
}

/** Append all the hall/pathshala geometry to the town (world space). */
export function buildHallParts(P: Parts, A: Anchors) {
  dalan(P, A);
  stands(P, A);
  // dioramas are small props too: drawn, never in the shadow pass
  const before = triangles(P);
  P.small(() => DIORAMAS.forEach(({ d }) => diorama(P, d)));
  dioramaStats.tris = triangles(P) - before;
  dioramaStats.count = DIORAMAS.length;
  buildPathshalaParts(P, A);
}
