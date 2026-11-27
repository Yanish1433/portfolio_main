"use client";

// The whole static town, merged to ~1 draw call per material. The kit pieces
// are also exported as standalone components for reuse (see <KitPiece/>).
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  BELL,
  COURTYARD,
  DHARA,
  HOUSES,
  HULAK,
  MILESTONES,
  PAGODA,
  PALACE,
  PATIS,
  SHRINES,
  TEA_SIGN,
  TEA_STALL,
  TIMELINE_PATH,
  TREES,
  GALLERY,
  MARKET,
  CHAUTARI,
  POND,
  GATE_ANGLES,
  WALL,
  zones,
} from "../zones";
import { MAT_KEYS, Parts, T, beam, box, lathe, plane, type MatKey } from "./geom";
import {
  COL,
  buildBell,
  buildDhara,
  buildHouse,
  buildHulak,
  buildPagoda,
  buildPalace,
  buildPati,
  milestone,
  PALACE_GATE_X,
  transformAnchors,
  type Anchors,
  type Built,
} from "./kit";
import { CASTS, getMaterials, materialFor } from "./materials";
import { buildPlaces, POND_HOLE } from "./placesGeo";
import { leafGeometry, tree, TOWN_TREE_KINDS, type Placed } from "./trees";
import { buildHallParts } from "../halls/hallParts";
import { buildWheelGallery } from "../wheels/frame";
import { WHEELS } from "../wheels/wheelData";

export const TOWN_RADIUS = WALL.outer;

/** Renders one Built (or merged Parts) as one mesh per material. */
export function MergedParts({ parts }: { parts: Parts }) {
  // Small props (stands, plaques, finials...) are merged into the same mesh as the big pieces:
  // they then also enter the shadow pass, which costs no extra draw call (one mesh per material).
  const geoms = useMemo(() => parts.mergeAll(), [parts]);
  return (
    <group>
      {MAT_KEYS.filter((k) => geoms.has(k)).map((k) => (
        <mesh key={k} geometry={geoms.get(k)} material={materialFor(k)} castShadow={CASTS[k]} receiveShadow />
      ))}
    </group>
  );
}

/** Standalone kit piece, e.g. <KitPiece built={buildPagoda({ tiers: 3, steps: 2, base: 4 })} />. */
export function KitPiece({ built, position = [0, 0, 0], rotation = 0 }: { built: Built; position?: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      <MergedParts parts={built.parts} />
    </group>
  );
}

/** The square's trees (zones.ts TREES), grown once: species by index, a slow turn so no two look alike. */
let townTreeCache: Placed[] | null = null;
export function townTrees(): Placed[] {
  if (!townTreeCache) townTreeCache = TREES.map(([x, z, s], i) => ({ tree: tree(TOWN_TREE_KINDS[i % TOWN_TREE_KINDS.length], 11 + i * 5), x, y: 0, z, rot: i * 1.9, scale: s }));
  return townTreeCache;
}

/** All of the square's leaf cards: ONE mesh on the shared leaf material, no shadows (only the chautari tree casts). */
function TownLeaves() {
  const geo = useMemo(() => {
    const g = leafGeometry(townTrees());
    if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) g.setDrawRange(0, Math.floor((g.index!.count / 6) * 0.55) * 6);
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={getMaterials().leaf} />;
}

export type TownData = { parts: Parts; anchors: Anchors; lanePosts: THREE.Vector3[] };

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function banner(P: Parts, top: THREE.Vector3, color: string, len = 2.0) {
  const g = plane(0.38, len, 8);
  g.translate(0, -len / 2, 0);
  P.add("cloth", g, color, T(top.x, top.y, top.z));
}

/**
 * The old-city wall: a tiled brick curtain with a stone plinth, pilasters, a tiled coping, and four
 * gates (south, east, north, west) each flanked by two tower stubs with pyramid roofs. It runs along
 * WALL.inner..outer, beyond every roof of the town. The south arc is lower so the 45 deg camera sees over it.
 */
function buildWall(P: Parts, A: Anchors) {
  const seg = 80;
  const mid = (WALL.inner + WALL.outer) / 2;
  const thick = WALL.outer - WALL.inner;
  const gateTheta = (th: number) => GATE_ANGLES.some((g) => Math.abs(Math.atan2(Math.sin(th - g), Math.cos(th - g))) < (WALL.gateHalf + 0.2) / mid);
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    if (gateTheta(am)) continue;
    const x0 = Math.sin(a0) * mid;
    const z0 = Math.cos(a0) * mid;
    const x1 = Math.sin(a1) * mid;
    const z1 = Math.cos(a1) * mid;
    const len = Math.hypot(x1 - x0, z1 - z0) * 1.04;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const rot = Math.atan2(x1 - x0, z1 - z0);
    // south (z > 0) stays low; the rest of the circle is a proper 2.6 m curtain
    const h = 2.6 - 1.45 * Math.min(1, Math.max(0, (Math.cos(am) - 0.25) / 0.6));
    P.add("brick", box(thick, h + 1.2, len), COL.brickWarm, T(cx, (h - 1.2) / 2, cz, rot));
    P.add("plain", box(thick + 0.16, 0.34, len), COL.stone, T(cx, 0.17, cz, rot)); // plinth
    P.add("roof", box(thick + 0.5, 0.16, len), "#ffffff", T(cx, h + 0.1, cz, rot)); // tiled coping
    if (i % 5 === 2) {
      // pilaster on the town side
      const px = Math.sin(am) * (WALL.inner - 0.08);
      const pz = Math.cos(am) * (WALL.inner - 0.08);
      P.add("brick", box(0.7, h + 0.1, 0.7), COL.brick, T(px, h / 2, pz, rot));
      P.add("plain", box(0.86, 0.12, 0.86), COL.stone, T(px, h + 0.12, pz, rot));
    }
  }
  // gates
  for (const g of GATE_ANGLES) {
    const gx = Math.sin(g) * mid;
    const gz = Math.cos(g) * mid;
    const place = (lx: number, lz: number) => V(gx + Math.cos(g) * lx + Math.sin(g) * lz, 0, gz - Math.sin(g) * lx + Math.cos(g) * lz);
    const M = T(gx, 0, gz, g);
    const towerX = WALL.gateHalf + 1.5;
    const th = g === 0 ? 3.0 : 4.8; // the south gate stays low so the camera can see over it
    const k = th / 4.8;
    for (const s of [-1, 1]) {
      const tx = s * towerX;
      P.add("brick", box(3.0, th + 0.6, 3.3), COL.brickWarm, T(0, 0, 0).setPosition(tx, (th + 0.6) / 2, 0).premultiply(M));
      P.add("plain", box(3.3, 0.4, 3.6), COL.stone, T(0, 0.2, 0).setPosition(tx, 0.2, 0).premultiply(M));
      P.add("wood", box(3.2, 0.22, 3.5), COL.woodDark, T(0, 0, 0).setPosition(tx, th + 0.5, 0).premultiply(M));
      // upper window slits
      for (const dz of [-1, 1]) P.add("window", box(0.5, 0.9, 0.05), "#ffffff", T(0, 0, 0).setPosition(tx, th * 0.7, dz * 1.67).premultiply(M), 1);
      // pyramid roof + gold finial
      const roof = new THREE.ConeGeometry(2.9, 1.9 * Math.max(k, 0.7), 4, 1).rotateY(Math.PI / 4).translate(0, 0.95 * Math.max(k, 0.7), 0);
      P.add("roof", roof, "#ffffff", T(0, 0, 0).setPosition(tx, th + 0.7, 0).premultiply(M));
      P.small(() => P.add("gold", lathe([[0, 0], [0.1, 0], [0.05, 0.16], [0, 0.34]], 6), COL.gold, T(0, 0, 0).setPosition(tx, th + 0.7 + 1.9 * Math.max(k, 0.7), 0).premultiply(M)));
    }
    // lintel across the opening: brick arch band + carved wooden beam, tiled cap
    const span = WALL.gateHalf * 2 + 0.2;
    P.add("brick", box(span + 0.4, 1.1, thick + 0.3), COL.brickWarm, T(0, 0, 0).setPosition(0, th - 0.8, 0).premultiply(M));
    P.add("wood", box(span, 0.3, thick + 0.5), COL.woodDark, T(0, 0, 0).setPosition(0, th - 1.5, 0).premultiply(M));
    P.add("roof", box(span + 1.2, 0.16, thick + 0.9), "#ffffff", T(0, 0, 0).setPosition(0, th - 0.15, 0).premultiply(M));
    // the gate opens onto the island's rim: a carved-stone sill and a low railing keep the drop from looking like a hole
    P.add("plain", box(span, 0.2, 0.7), COL.stone, T(0, 0, 0).setPosition(0, 0.1, thick / 2 + 0.1).premultiply(M));
    for (const px of [-1.9, -0.95, 0, 0.95, 1.9]) P.add("plain", box(0.2, 0.85, 0.2), COL.stone, T(0, 0, 0).setPosition(px, 0.425, thick / 2 + 0.95).premultiply(M));
    P.add("plain", box(span + 0.2, 0.12, 0.2), COL.stone, T(0, 0, 0).setPosition(0, 0.8, thick / 2 + 0.95).premultiply(M));
    // lamps and a marigold garland across each gate
    A.garlands.push({ a: place(-WALL.gateHalf - 0.3, 0).setY(th - 1.9), b: place(WALL.gateHalf + 0.3, 0).setY(th - 1.9), drop: 0.35 });
    A.diyos.push(place(-WALL.gateHalf - 0.1, -1.4).setY(0.45), place(WALL.gateHalf + 0.1, -1.4).setY(0.45));
  }
}

/** Build every static piece of the town into world space (cached for the session). */
let townCache: TownData | null = null;
export function buildTown(): TownData {
  if (townCache) return townCache;
  const P = new Parts();
  const A: Anchors = { bells: [], diyos: [], lanterns: [], garlands: [] };
  const place = (b: Built, x: number, z: number, rot = 0) => {
    const m = T(x, 0, z, rot);
    P.append(b.parts, m);
    transformAnchors(b.anchors, m, A);
  };

  place(buildPagoda({ tiers: 5, steps: 5, base: PAGODA.base, guardians: true }), PAGODA.x, PAGODA.z);
  for (const s of SHRINES) place(buildPagoda({ tiers: s.tiers, steps: s.steps, base: s.base, guardians: false }), s.x, s.z);
  place(buildPalace({ w: PALACE.w, d: PALACE.d }), PALACE.x, PALACE.z);
  for (const h of HOUSES) place(buildHouse(h), h.x, h.z, h.rot);
  // the few trees in the square: procedural peepal / broadleaf / ashoka (bark here, leaf cards in <TownLeaves/>)
  townTrees().forEach((t) => P.addRaw("wood", t.tree.bark, T(t.x, 0, t.z, t.rot, t.scale)));
  for (const p of PATIS) place(buildPati({ w: p.w, d: p.d }), p.x, p.z, p.rot);
  place(buildPati({ w: TEA_STALL.w, d: TEA_STALL.d, tea: true }), TEA_STALL.x, TEA_STALL.z, TEA_STALL.rot);
  place(buildDhara(DHARA.w, DHARA.d), DHARA.x, DHARA.z);
  place(buildBell(), BELL.x, BELL.z);
  const mail = zones.find((z) => z.id === "mailbox")!;
  place(buildHulak(), HULAK.x, HULAK.z, Math.atan2(mail.ring[0] - HULAK.x, mail.ring[1] - HULAK.z));

  // project dalan, degree plaques, certificate easels and the course shelf (laid out from profile.ts)
  buildHallParts(P, A);

  // pathshala courtyard walls with a little gateway
  const cx = (COURTYARD.x0 + COURTYARD.x1) / 2;
  const cw = COURTYARD.x1 - COURTYARD.x0;
  const wall = (x: number, z: number, w: number, d: number) => {
    P.box("brick", w, 1.0, d, x, 0.5, z, COL.brickWarm);
    P.box("plain", w + 0.06, 0.08, d + 0.06, x, 1.04, z, COL.stone);
  };
  wall(cx, COURTYARD.z0, cw, 0.3);
  wall(cx, COURTYARD.z1, cw, 0.3);
  wall(COURTYARD.x1, (COURTYARD.z0 + COURTYARD.gate[0]) / 2, 0.3, COURTYARD.gate[0] - COURTYARD.z0);
  wall(COURTYARD.x1, (COURTYARD.gate[1] + COURTYARD.z1) / 2, 0.3, COURTYARD.z1 - COURTYARD.gate[1]);
  for (const z of COURTYARD.gate) P.box("brick", 0.45, 1.6, 0.45, COURTYARD.x1, 0.8, z, COL.brick);
  A.garlands.push({ a: V(COURTYARD.x1, 1.55, COURTYARD.gate[0]), b: V(COURTYARD.x1, 1.55, COURTYARD.gate[1]), drop: 0.35 });
  A.diyos.push(V(COURTYARD.x1, 1.62, COURTYARD.gate[0]), V(COURTYARD.x1, 1.62, COURTYARD.gate[1]));
  A.lanterns.push(V(COURTYARD.x1 + 0.3, 1.2, -2.5));

  // prayer-wheel gallery: frame, roof, pedestals, plaque boards, butter lamps (the golden drums are wheels/WheelGallery.tsx)
  buildWheelGallery(P, A, WHEELS);
  // woven mat on the lane in front of the wheels
  P.box("plain", 6.6, 0.02, 1.9, GALLERY.x, 0.011, GALLERY.z + 1.95, "#c8a96b");

  // lane: stone milestones and lamp posts
  P.small(() => {
    for (const [x, z] of MILESTONES) milestone(P, T(x, 0, z, Math.PI * 0.25));
  });
  const lanePosts: THREE.Vector3[] = [];
  for (let i = 0; i < TIMELINE_PATH.length - 1; i++) {
    const [ax, az] = TIMELINE_PATH[i];
    const [bx, bz] = TIMELINE_PATH[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / len;
    const nz = (bx - ax) / len;
    const n = Math.round(len / 1.6);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      for (const s of [-1, 1]) {
        const x = ax + (bx - ax) * t + nx * s * 1.25;
        const z = az + (bz - az) * t + nz * s * 1.25;
        P.small(() => P.box("plain", 0.22, 0.55, 0.22, x, 0.275, z, COL.stone));
        lanePosts.push(V(x, 0.57, z));
        A.diyos.push(V(x, 0.57, z));
      }
    }
  }

  // banner poles (dhwaja) at the golden gate (between the dalan wings) and the tea stall
  const gateZ = PALACE.z + PALACE.d / 2 + 1.6;
  for (const s of [-1, 1]) {
    const x = PALACE_GATE_X + s * 1.6;
    P.add("wood", beam(V(x, 0, gateZ), V(x, 4.6, gateZ), 0.12), COL.woodDark);
    P.add("wood", beam(V(x - 0.3, 4.4, gateZ), V(x + 0.3, 4.4, gateZ), 0.07), COL.woodDark);
    P.small(() => P.add("gold", lathe([[0, 0], [0.08, 0], [0.04, 0.12], [0, 0.26]], 6), COL.gold, T(x, 4.6, gateZ)));
    banner(P, V(x, 4.36, gateZ), s < 0 ? COL.red : COL.saffron, 2.4);
  }
  P.add("wood", beam(V(TEA_STALL.x + 1.7, 0, TEA_STALL.z + 1.9), V(TEA_STALL.x + 1.7, 3.4, TEA_STALL.z + 1.9), 0.1), COL.woodDark);
  banner(P, V(TEA_STALL.x + 1.7, 3.35, TEA_STALL.z + 1.9), COL.red, 1.5);
  // legs + frame of the clickable tea-stall sign
  for (const s of [-1, 1]) P.add("wood", beam(V(TEA_SIGN.x + s * 0.95, 0, TEA_SIGN.z), V(TEA_SIGN.x + s * 0.95, TEA_SIGN.y + 0.45, TEA_SIGN.z), 0.1), COL.woodDark);
  P.box("wood", 2.3, 0.1, 0.12, TEA_SIGN.x, TEA_SIGN.y + 0.45, TEA_SIGN.z, COL.woodDark);
  P.box("wood", 2.2, 0.9, 0.06, TEA_SIGN.x, TEA_SIGN.y, TEA_SIGN.z, COL.woodDark);
  // hanging cloth banners from a few house windows
  for (const h of HOUSES.slice(1, 4)) {
    const m = T(h.x, 0, h.z, h.rot);
    banner(P, V(h.w * 0.3, 4.2, h.d / 2 + 0.25).applyMatrix4(m), COL.saffron, 1.6);
  }

  // garlands strung between buildings across lanes
  A.garlands.push(
    { a: V(-12.3, 4.0, 5.6), b: V(-16.4, 4.2, 4.6), drop: 0.5 },
    { a: V(-12.5, 4.6, -15.5), b: V(-9.9, 4.4, -16.2), drop: 0.5 },
    { a: V(12.5, 4.6, -15.5), b: V(9.9, 4.4, -16.2), drop: 0.5 },
    { a: V(17.6, 4.4, 3.4), b: V(16.3, 3.6, 12.0), drop: 0.8 },
  );

  // stone-slab paths
  // Each slab sits a hair higher than the one before (0.7 mm steps), so where two paths cross their
  // coplanar tops never z-fight.
  let slabN = 0;
  const slab = (x0: number, z0: number, x1: number, z1: number, wdt: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const lift = 0.0007 * slabN++;
    P.add("slab", box(wdt, 0.03, len), "#fff", T((x0 + x1) / 2, 0.015 + lift, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0)));
  };
  const pb = PAGODA.base / 2 + 0.9;
  slab(0, 18.5, 0, PAGODA.z + PAGODA.base / 2 + 0.6, 2.2); // main axis from the south
  slab(-pb, PAGODA.z - pb, pb, PAGODA.z - pb, 1.4); // ring around the plinth
  slab(-pb, PAGODA.z + pb, pb, PAGODA.z + pb, 1.4);
  slab(-pb, PAGODA.z - pb, -pb, PAGODA.z + pb, 1.4);
  slab(pb, PAGODA.z - pb, pb, PAGODA.z + pb, 1.4);
  slab(PALACE_GATE_X, PAGODA.z - pb, PALACE_GATE_X, PALACE.z + PALACE.d / 2 + 0.8, 2.2); // to the golden gate
  const hall = zones.find((z) => z.id === "project-hall")!;
  slab(-pb, PAGODA.z - pb, hall.ring[0], hall.ring[1], 1.6); // to the dalan entrance
  slab(-pb, -2.5, COURTYARD.x1 + 0.4, -2.5, 1.8); // to the pathshala
  slab(pb, -3, 11, -3, 1.8); // to pottery square
  slab(0.8, 9.5, 10, 8.2, 1.4); // to the hulak
  for (let i = 0; i < TIMELINE_PATH.length - 1; i++) {
    const [ax, az] = TIMELINE_PATH[i];
    const [bx, bz] = TIMELINE_PATH[i + 1];
    slab(ax, az, bx, bz, 1.9);
  }
  slab(-1, 7.4, TIMELINE_PATH[0][0], TIMELINE_PATH[0][1], 1.6);
  // step8c: the main axis runs on to the market lane in front of the south gate; a lane of slabs along the stalls
  slab(0, 18.5, 0, MARKET.laneZ, 2.2);
  slab(MARKET.stalls[0].x - 1.2, MARKET.laneZ, MARKET.stalls[MARKET.stalls.length - 1].x + 2.2, MARKET.laneZ, 1.5);
  // the pond: down the west side of the tank from the post box, then along its steps
  slab(7.3, 8.6, 7.3, POND.z + POND.d / 2 + 1.5, 1.1);
  slab(7.3, POND.z + POND.d / 2 + 1.5, POND.x + POND.w / 2 - 0.8, POND.z + POND.d / 2 + 1.5, 1.4);
  slab(POND.x, 8.9, POND.x, POND.z - POND.d / 2 - 0.9, 1.3);
  // the chautari: along the east corridor from the skills lane, up to the steps
  slab(11, -3, 11, 0.4, 1.5);
  slab(11, 0.4, CHAUTARI.x, 0.4, 1.5);
  slab(CHAUTARI.x, 0.4, CHAUTARI.x, CHAUTARI.z + CHAUTARI.lowerD / 2 + 0.9, 1.5);

  buildPlaces(P, A);
  buildWall(P, A);

  townCache = { parts: P, anchors: A, lanePosts };
  return townCache;
}

/** Herringbone ground disc with a hole cut for the sunken water spout. */
function groundGeometry() {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, TOWN_RADIUS, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  const x0 = DHARA.x - DHARA.w / 2;
  const x1 = DHARA.x + DHARA.w / 2;
  const y0 = -(DHARA.z + DHARA.d / 2);
  const y1 = -(DHARA.z - DHARA.d / 2);
  hole.moveTo(x0, y0);
  hole.lineTo(x0, y1);
  hole.lineTo(x1, y1);
  hole.lineTo(x1, y0);
  hole.lineTo(x0, y0);
  shape.holes.push(hole);
  const pond = new THREE.Path();
  pond.moveTo(POND_HOLE.x0, -POND_HOLE.z0);
  pond.lineTo(POND_HOLE.x0, -POND_HOLE.z1);
  pond.lineTo(POND_HOLE.x1, -POND_HOLE.z1);
  pond.lineTo(POND_HOLE.x1, -POND_HOLE.z0);
  pond.lineTo(POND_HOLE.x0, -POND_HOLE.z0);
  shape.holes.push(pond);
  const g = new THREE.ShapeGeometry(shape, 48);
  g.rotateX(-Math.PI / 2);
  return g;
}

export default function Town() {
  const town = useMemo(buildTown, []);
  const ground = useMemo(groundGeometry, []);
  const m = getMaterials();
  return (
    <group>
      <mesh geometry={ground} material={m.ground} receiveShadow />
      <MergedParts parts={town.parts} />
      <TownLeaves />
    </group>
  );
}

export type { MatKey };
