// Static geometry of the step8c places: temple pond, market lane, chautari. Everything is pushed into the
// town's shared material buckets (brick / wood / plain / cloth / gold / water ...), so it costs no extra
// draw calls. Only the pond's water surface and the tree's leaves have their own meshes (nepal/Places.tsx).
import * as THREE from "three";
import { CHAUTARI, MARKET, POND } from "../zones";
import { Parts, T, beam, box, lathe, plane, seeded } from "./geom";
import { COL, type Anchors } from "./kit";
import { leafGeometry, tree } from "./trees";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ pond

const POND_DEPTH = 1.0;
const WALL_T = 0.25;
/** Level of the water surface (below the ground, the stone steps go down into it). */
export const POND_WATER_Y = -0.42;
/** The hole cut in the ground disc for the tank (the stone coping overlaps its edge). */
export const POND_HOLE = { x0: POND.x - (POND.w - 0.4) / 2, x1: POND.x + (POND.w - 0.4) / 2, z0: POND.z - (POND.d - 0.4) / 2, z1: POND.z + (POND.d - 0.4) / 2 };
/** Water rectangle (inside the walls). */
export const POND_WATER = { x: POND.x, z: POND.z, w: POND.w - 0.4 - 2 * WALL_T, d: POND.d - 0.4 - 2 * WALL_T };
/** Where the spout drips into the water (north wall, middle). */
export const POND_SPOUT = { x: POND.x, z: POND_HOLE.z0 + WALL_T + 0.05 };

export function buildPond(P: Parts, A: Anchors) {
  const { x, z } = POND;
  const hx = (POND.w - 0.4) / 2;
  const hz = (POND.d - 0.4) / 2;
  const S = COL.stone;
  const SD = COL.stoneDark;
  // tank walls and floor (below ground, never in the shadow pass)
  P.small(() => {
  P.box("plain", POND.w - 0.4, 0.1, POND.d - 0.4, x, -POND_DEPTH - 0.05, z, SD);
  P.box("plain", POND.w - 0.4, POND_DEPTH, WALL_T, x, -POND_DEPTH / 2, z - hz + WALL_T / 2, SD);
  P.box("plain", POND.w - 0.4, POND_DEPTH, WALL_T, x, -POND_DEPTH / 2, z + hz - WALL_T / 2, SD);
  P.box("plain", WALL_T, POND_DEPTH, POND.d - 0.4, x - hx + WALL_T / 2, -POND_DEPTH / 2, z, SD);
  P.box("plain", WALL_T, POND_DEPTH, POND.d - 0.4, x + hx - WALL_T / 2, -POND_DEPTH / 2, z, S);
  });
  // stone coping all round (0.5 m wide, straddling the hole's edge)
  P.box("plain", POND.w + 0.1, 0.14, 0.5, x, 0.07, z - hz, S);
  P.box("plain", POND.w + 0.1, 0.14, 0.5, x, 0.07, z + hz, S);
  P.box("plain", 0.5, 0.14, POND.d - 0.4, x - hx, 0.07, z, S);
  P.box("plain", 0.5, 0.14, POND.d - 0.4, x + hx, 0.07, z, S);
  // stone steps down into the water along the whole south (camera) side
  const stepD = 0.3;
  for (let k = 0; k < 4; k++) {
    const top = -0.12 - k * 0.17;
    P.small(() => P.box("plain", POND.w - 0.4 - 2 * WALL_T, top + POND_DEPTH, stepD, x, (top - POND_DEPTH) / 2, z + hz - WALL_T - stepD / 2 - k * stepD, k % 2 ? S : SD));
  }
  // spout: a carved slab on the north wall, a bronze makara-like head, a thin stream into the water
  const sz0 = z - hz + WALL_T;
  P.box("plain", 0.8, 0.9, 0.14, x, -0.1, sz0 + 0.07, S);
  P.box("plain", 1.0, 0.1, 0.22, x, 0.37, sz0 + 0.11, SD);
  P.add("gold", beam(V(x, -0.12, sz0 + 0.1), V(x, -0.17, sz0 + 0.5), 0.14, 0.16), COL.bronze);
  P.small(() => {
    P.add("gold", lathe([[0, 0], [0.09, 0.02], [0.07, 0.12], [0, 0.16]], 6).rotateX(Math.PI / 2), COL.bronze, T(x, -0.17, sz0 + 0.5));
    P.add("water", box(0.05, 0.3, 0.05), "#ffffff", T(x, POND_WATER_Y + 0.15, sz0 + 0.62));
  });
  // a small stone shrine (chaitya-like) on the north-east corner of the coping
  const cx = x + hx - 0.15;
  const cz = z - hz - 0.05;
  P.box("plain", 0.8, 0.22, 0.8, cx, 0.25, cz, S);
  P.box("plain", 0.55, 0.9, 0.55, cx, 0.81, cz, SD);
  P.box("plain", 0.2, 0.5, 0.04, cx, 0.7, cz + 0.29, COL.dark);
  P.add("roof", new THREE.ConeGeometry(0.62, 0.55, 4, 1).rotateY(Math.PI / 4), "#ffffff", T(cx, 1.5, cz));
  P.small(() => P.add("gold", lathe([[0, 0], [0.06, 0], [0.03, 0.1], [0, 0.22]], 6), COL.gold, T(cx, 1.76, cz)));
  A.diyos.push(V(cx - 0.45, 0.4, cz + 0.45), V(x - hx + 0.05, 0.16, z + hz), V(x + hx - 0.05, 0.16, z + hz), V(x - hx + 0.05, 0.16, z - hz));
  // lily pads and a few lotus flowers on the water
  const r = seeded(404);
  const pads = ["#3f7a3a", "#4d8a3f", "#356b36", "#5b9444"];
  for (let i = 0; i < 9; i++) {
    const px = x + (r() - 0.5) * (POND_WATER.w - 0.7);
    const pz = z - POND_WATER.d / 2 + 0.5 + r() * (POND_WATER.d - 1.9);
    const pr = 0.14 + r() * 0.15;
    P.small(() => P.add("plain", new THREE.CircleGeometry(pr, 7, r() * 6, Math.PI * 1.85).rotateX(-Math.PI / 2), pads[i % 4], T(px, POND_WATER_Y + 0.012 + i * 0.0004, pz, r() * 6)));
    if (i % 4 === 1) {
      const petals = new THREE.ConeGeometry(0.075, 0.13, 6, 1, true).translate(0, 0.065, 0);
      P.small(() => P.add("plain", petals, i % 8 === 1 ? "#f2a0b8" : "#fff0f3", T(px + 0.05, POND_WATER_Y + 0.02, pz - 0.04)));
    }
  }
}

// ------------------------------------------------------------------ market lane

const AWNINGS = [["#b3261e", "#f4e6c4"], ["#e0761c", "#f4e6c4"], ["#2f6f8f", "#f4e6c4"], ["#7a2f5f", "#f0d9a0"], ["#3f7a3a", "#f4e6c4"], ["#c8981f", "#f4e6c4"]];
const SKIN = ["#c58b62", "#a9734d", "#8c5a3c"];

/** One stall in local space (front +z), at world (sx, sz). */
function stall(P: Parts, A: Anchors, sx: number, sz: number, kind: (typeof MARKET.stalls)[number]["kind"], idx: number) {
  const r = seeded(900 + idx * 31);
  const W = MARKET.stallW;
  const at = (lx: number, ly: number, lz: number) => T(sx + lx, ly, sz + lz);
  // frame: 4 posts, back wall boards, counter (thin timber: skips the shadow pass)
  P.small(() => {
  for (const [px, pz, h] of [[-W / 2, 0.62, 2.1], [W / 2, 0.62, 2.1], [-W / 2, -0.62, 2.5], [W / 2, -0.62, 2.5]] as const) P.box("wood", 0.09, h, 0.09, sx + px, h / 2, sz + pz, COL.wood);
  P.box("wood", W, 1.5, 0.05, sx, 0.75 + 0.35, sz - 0.62, COL.woodDark);
  P.box("wood", W - 0.1, 0.8, 0.5, sx, 0.4, sz + 0.34, COL.wood);
  P.box("wood", W, 0.06, 0.62, sx, 0.83, sz + 0.34, COL.woodDark);
  P.box("wood", W - 0.2, 0.05, 0.3, sx, 1.45, sz - 0.46, COL.woodDark); // shelf
  });
  // striped cloth awning, sloping down to the front, with a wavy hem
  const [c1, c2] = AWNINGS[idx % AWNINGS.length];
  const slope = Math.atan2(0.45, 1.5);
  const nS = 5;
  for (let i = 0; i < nS; i++) {
    const g = plane(W / nS + 0.003, 1.56).rotateX(-(Math.PI / 2 - slope));
    P.add("cloth", g, i % 2 ? c2 : c1, at(-W / 2 + ((i + 0.5) * W) / nS, 2.28, 0.1));
  }
  P.box("wood", W + 0.1, 0.05, 0.05, sx, 2.07, sz + 0.86, COL.woodDark);
  P.small(() => {
    // goods
    const basket = (bx: number, by: number, bz: number, rad: number, pile: string, h = 0.14) => {
      P.add("clay", new THREE.CylinderGeometry(rad, rad * 0.78, 0.13, 8), "#a9783f", at(bx, by + 0.065, bz));
      P.add("clay", new THREE.ConeGeometry(rad * 0.92, h, 7), pile, at(bx, by + 0.13 + h / 2, bz));
    };
    const heap = (bx: number, by: number, bz: number, rad: number, col: string, n = 6) => {
      P.add("clay", new THREE.CylinderGeometry(rad, rad * 0.8, 0.12, 8), "#a9783f", at(bx, by + 0.06, bz));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.28 + r();
        const rr = i === 0 ? 0 : rad * 0.5;
        const y = by + 0.16 + (i === 0 ? 0.08 : 0);
        P.add("plain", new THREE.OctahedronGeometry(0.075, 0), i % 3 === 2 ? "#e0a21a" : col, at(bx + Math.cos(a) * rr, y, bz + Math.sin(a) * rr));
      }
    };
    const top = 0.86;
    if (kind === "spice") {
      [["#e0a515", -0.55], ["#b3261e", -0.18], ["#7a5a2a", 0.19], ["#6b8f3a", 0.56]].forEach(([c, bx], i) => basket(bx as number, top, 0.3 + (i % 2) * 0.08, 0.17, c as string, 0.17));
      P.add("plain", new THREE.CylinderGeometry(0.07, 0.07, 0.3, 6), "#e8d9b0", at(0.7, 1.58, -0.46)); // jars on the shelf
      P.add("plain", new THREE.CylinderGeometry(0.07, 0.07, 0.24, 6), "#c9772e", at(0.5, 1.55, -0.46));
    } else if (kind === "pots") {
      for (let i = 0; i < 5; i++) P.add("clay", lathe([[0, 0], [0.12, 0], [0.18, 0.1], [0.2, 0.2], [0.12, 0.32], [0.09, 0.4], [0.11, 0.44]], 8), i % 2 ? "#b8693f" : "#9b5434", at(-0.6 + i * 0.3, top, 0.32 + (i % 2) * 0.1));
      for (let i = 0; i < 3; i++) P.add("clay", lathe([[0, 0], [0.16, 0], [0.24, 0.12], [0.26, 0.26], [0.17, 0.4], [0.12, 0.46]], 8), "#a85a34", at(-W / 2 - 0.35 + i * 0.01, 0, 0.5 - i * 0.55));
    } else if (kind === "cloth") {
      const cols = ["#b3261e", "#2f5f8f", "#e0a21a", "#3f7a3a", "#f1eadb"];
      cols.forEach((c, i) => P.add("plain", new THREE.CylinderGeometry(0.075, 0.075, 0.5, 6).rotateZ(Math.PI / 2), c, at(-0.2 + (i % 2) * 0.04, top + 0.075 + Math.floor(i / 2) * 0.15, 0.32 - (i % 2) * 0.1)));
      cols.slice(0, 3).forEach((c, i) => P.add("plain", new THREE.CylinderGeometry(0.075, 0.075, 0.42, 6), c, at(0.5 + i * 0.16, top + 0.21, 0.36)));
    } else if (kind === "veg") {
      heap(-0.5, top, 0.3, 0.2, "#4f8f3a", 7);
      heap(-0.1, top, 0.34, 0.2, "#c8341c", 7);
      heap(0.3, top, 0.3, 0.2, "#e07a1c", 7);
      heap(0.68, top, 0.34, 0.16, "#7aa63c", 5);
    } else if (kind === "fruit") {
      heap(-0.5, top, 0.3, 0.2, "#f08a1c", 8);
      heap(-0.08, top, 0.34, 0.2, "#e8c21c", 8);
      heap(0.34, top, 0.3, 0.2, "#c8341c", 8);
      P.add("plain", new THREE.CylinderGeometry(0.14, 0.12, 0.2, 8), "#7a8f3a", at(0.72, top + 0.1, 0.34));
    } else {
      // flowers: buckets of marigold heaps
      for (let i = 0; i < 4; i++) {
        P.add("clay", new THREE.CylinderGeometry(0.14, 0.11, 0.2, 8), "#7a5a3a", at(-0.56 + i * 0.38, top + 0.1, 0.32));
        P.add("plain", new THREE.OctahedronGeometry(0.16, 0), i % 2 ? "#f39a1b" : "#e0761c", at(-0.56 + i * 0.38, top + 0.28, 0.32));
      }
    }
    // idle vendors on some stalls: a flat low-poly figure, seated behind the counter (static, no skinned mesh)
    if (idx % 2 === 0) {
      const shirt = ["#6f8fb3", "#b3563a", "#5b8a5b"][idx % 3];
      const skin = SKIN[idx % 3];
      P.add("plain", new THREE.CylinderGeometry(0.15, 0.2, 0.55, 6), shirt, at(0.1, 1.0, -0.16));
      P.add("plain", new THREE.SphereGeometry(0.1, 6, 4), skin, at(0.1, 1.42, -0.16));
      P.add("plain", new THREE.CylinderGeometry(0.1, 0.12, 0.1, 6), idx % 4 ? "#d9a21b" : "#2a2a2a", at(0.1, 1.54, -0.16)); // dhaka topi
      P.add("plain", beam(V(sx - 0.05, 1.18, sz - 0.12), V(sx - 0.18, 0.95, sz + 0.2), 0.08), shirt);
      P.add("plain", beam(V(sx + 0.25, 1.18, sz - 0.12), V(sx + 0.36, 0.95, sz + 0.2), 0.08), shirt);
    }
  });
  // hanging cloth pieces / garlands along the awning's front edge, and a lamp on a few
  if (kind === "cloth") {
    ["#b3261e", "#e0a21a", "#2f5f8f", "#f1eadb"].forEach((c, i) => {
      const g = plane(0.34, 0.95);
      g.translate(0, -0.475, 0);
      P.add("cloth", g, c, at(-0.6 + i * 0.4, 2.04, 0.88));
    });
  } else {
    A.garlands.push({ a: V(sx - W / 2 + 0.05, 2.0, sz + 0.88), b: V(sx + W / 2 - 0.05, 2.0, sz + 0.88), drop: 0.22 });
  }
  if (idx % 2 === 1) A.lanterns.push(V(sx + W / 2 - 0.1, 1.95, sz + 0.72));
}

export function buildMarket(P: Parts, A: Anchors) {
  MARKET.stalls.forEach((s, i) => stall(P, A, s.x, MARKET.stallZ, s.kind, i));
  // drying sacks and a stacked-crate corner at both ends of the lane
  P.small(() => {
    for (const [x, z] of [[-10.2, 21.4], [9.8, 21.9]] as const) {
      P.add("clay", new THREE.CylinderGeometry(0.22, 0.28, 0.5, 7), "#d9c9a0", T(x, 0.25, z));
      P.add("clay", new THREE.CylinderGeometry(0.22, 0.28, 0.5, 7), "#cdb98a", T(x + 0.4, 0.25, z - 0.1));
      P.box("wood", 0.5, 0.35, 0.5, x - 0.1, 0.18, z - 0.5, COL.wood);
    }
  });
}

// ------------------------------------------------------------------ chautari

/** Height of the two stone tiers: the lower one is a sitting ledge (~0.45 m), the upper one carries the tree. */
const TIER = { lower: 0.45, upper: 0.86 };
const STONES = ["#a39d92", "#8f897f", "#b0a99c", "#9a9488", "#857f76", "#aaa294"];

/** The chautari's peepal (built once, local space: foot of the trunk at the origin) and where it stands. */
export const CHAUTARI_TREE_SEED = 3;
export function chautariPlacement() {
  return { x: CHAUTARI.x + 0.15, y: TIER.upper, z: CHAUTARI.z - 0.2 };
}
export const chautariTree = () => tree("chautari", CHAUTARI_TREE_SEED);

/**
 * Stone coursing on the four faces of a box tier: rows of dressed blocks (one quad each, 2 tris) in slightly different
 * greys, standing a hair proud of a dark core so the joints read as mortar lines.
 */
function stoneFaces(P: Parts, cx: number, cz: number, w: number, d: number, y0: number, y1: number, seed: number) {
  const r = seeded(seed);
  const courses = Math.max(1, Math.round((y1 - y0) / 0.2));
  const ch = (y1 - y0) / courses;
  const faces: [number, number, number][] = [[0, w, d], [Math.PI, w, d], [Math.PI / 2, d, w], [-Math.PI / 2, d, w]];
  for (const [rot, len, depth] of faces) {
    const M = T(cx, 0, cz, rot);
    for (let c = 0; c < courses; c++) {
      let x = -len / 2 + 0.02 + (c % 2) * 0.18;
      while (x < len / 2 - 0.1) {
        const bw = Math.min(0.4 + r() * 0.45, len / 2 - 0.02 - x);
        if (bw > 0.12) {
          const g = plane(bw - 0.03, ch - 0.03);
          g.translate(x + bw / 2, y0 + (c + 0.5) * ch, depth / 2 + 0.012);
          P.add("plain", g, STONES[Math.floor(r() * STONES.length)], M);
        }
        x += bw;
      }
    }
  }
}

/** Trunk, limbs, roots and hanging roots (shared wood bucket); the leaves are a separate mesh (chautariLeaves). */
export function buildChautari(P: Parts, A: Anchors) {
  const { x, z, lowerW, lowerD, upperW, upperD } = CHAUTARI;
  const S = COL.stone;
  const SD = COL.stoneDark;
  // two stone tiers on a brick footing: dressed blocks, a coping, and a 3-step stair on the south (+z) side
  P.box("brick", lowerW + 0.14, 0.1, lowerD + 0.14, x, 0.05, z, COL.brickDark);
  P.box("plain", lowerW, TIER.lower - 0.1, lowerD, x, 0.1 + (TIER.lower - 0.1) / 2, z, SD);
  stoneFaces(P, x, z, lowerW, lowerD, 0.1, TIER.lower - 0.07, 11);
  P.box("plain", lowerW + 0.12, 0.07, lowerD + 0.12, x, TIER.lower - 0.035, z, S);
  P.box("plain", upperW, TIER.upper - TIER.lower - 0.07, upperD, x, TIER.lower + (TIER.upper - TIER.lower - 0.07) / 2, z, SD);
  stoneFaces(P, x, z, upperW, upperD, TIER.lower, TIER.upper - 0.07, 23);
  P.box("plain", upperW + 0.12, 0.07, upperD + 0.12, x, TIER.upper - 0.035, z, S);
  for (let k = 0; k < 3; k++) P.box("plain", 1.5, 0.14 * (k + 1), 0.28, x, (0.14 * (k + 1)) / 2, z + lowerD / 2 + 0.28 * (2 - k) + 0.14, k % 2 ? S : SD);
  for (const sx of [-1, 1]) P.box("plain", 0.22, 0.3, 0.9, x + sx * 0.86, 0.15, z + lowerD / 2 + 0.45, SD); // cheek stones beside the stair
  // the tree
  const tr = chautariTree();
  const at = chautariPlacement();
  P.addRaw("wood", tr.bark, T(at.x, at.y, at.z));
  // a small shrine-stone at the foot of the trunk: oiled grey stone, red tika, a marigold garland, scattered petals
  const sx = at.x + 0.78;
  const sz = at.z + 0.62;
  P.small(() => {
    P.add("plain", new THREE.CylinderGeometry(0.2, 0.24, 0.06, 8), S, T(sx, at.y + 0.03, sz)); // little stone seat
    P.add("plain", new THREE.SphereGeometry(0.17, 8, 6).scale(0.8, 1.45, 0.8), SD, T(sx, at.y + 0.3, sz));
    P.add("plain", new THREE.CircleGeometry(0.07, 8), "#b3261e", T(sx, at.y + 0.34, sz + 0.128)); // the red tika
    P.add("plain", new THREE.CircleGeometry(0.035, 6), "#e0a21a", T(sx, at.y + 0.44, sz + 0.1, 0.3));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      P.add("plain", new THREE.OctahedronGeometry(0.04, 0), i % 3 === 1 ? "#e0761c" : COL.marigold, T(sx + Math.cos(a) * 0.15, at.y + 0.21 + Math.sin(a * 2) * 0.012, sz + Math.sin(a) * 0.15));
    }
    const rr = seeded(5);
    for (let i = 0; i < 9; i++) {
      const a = rr() * Math.PI * 2;
      const rad = 0.22 + rr() * 0.35;
      P.add("plain", new THREE.OctahedronGeometry(0.028, 0).scale(1, 0.4, 1), i % 2 ? COL.marigold : "#c8341c", T(sx + Math.cos(a) * rad, at.y + 0.012, sz + Math.sin(a) * rad));
    }
  });
  // cloth ribbons knotted round the trunk (red / saffron), with tails; plain rings + waving tails on the cloth material
  const ribbons: [number, string][] = [[0.95, COL.red], [1.08, COL.saffron], [1.34, COL.red]];
  ribbons.forEach(([h, c], i) => {
    const ax = tr.trunkAxisAt(h);
    const rad = tr.trunkRadiusAt(h) * 1.03 + 0.03;
    P.small(() => P.add("plain", new THREE.CylinderGeometry(rad, rad, 0.06, 12, 1, true), c, T(at.x + ax.x, at.y + h, at.z + ax.z)));
    const a = 0.9 + i * 1.7;
    const tail = plane(0.075, 0.5 + (i % 2) * 0.18);
    tail.translate(0, -(0.5 + (i % 2) * 0.18) / 2 - 0.04, 0);
    P.add("cloth", tail, c, T(at.x + ax.x + Math.sin(a) * (rad + 0.012), at.y + h, at.z + ax.z + Math.cos(a) * (rad + 0.012), a));
  });
  A.diyos.push(V(sx + 0.38, at.y + 0.04, sz + 0.1), V(x - 1.85, TIER.lower + 0.05, z + lowerD / 2 - 0.1), V(x + 1.85, TIER.lower + 0.05, z + lowerD / 2 - 0.1));
  A.bells.push(tr.limbPoint.clone().add(V(at.x, at.y - 0.22, at.z))); // a bell hung from the lowest big limb
}

/** The crown's leaf cards as one geometry (shared leaf material; this is the only tree that casts shadows). */
export function chautariLeaves(): THREE.BufferGeometry {
  const at = chautariPlacement();
  return leafGeometry([{ tree: chautariTree(), x: at.x, y: at.y, z: at.z, rot: 0, scale: 1 }]);
}

/** Furthest horizontal reach of the canopy from the town centre (for the wall test). */
export function canopyRadius(): number {
  const g = chautariLeaves();
  let best = 0;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) best = Math.max(best, Math.hypot(p.getX(i), p.getZ(i)));
  return best;
}

export function buildPlaces(P: Parts, A: Anchors) {
  buildPond(P, A);
  buildMarket(P, A);
  buildChautari(P, A);
}
