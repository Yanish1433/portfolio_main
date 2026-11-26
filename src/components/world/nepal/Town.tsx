"use client";

// The whole static town, merged to ~1 draw call per material. The kit pieces
// are also exported as standalone components for reuse (see <KitPiece/>).
import { useMemo } from "react";
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
  GALLERY,
  zones,
} from "../zones";
import { MAT_KEYS, Parts, T, beam, box, lathe, plane, seeded, type MatKey } from "./geom";
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
import { buildHallParts } from "../halls/hallParts";
import { buildWheelGallery } from "../wheels/frame";
import { WHEELS } from "../wheels/wheelData";

export const TOWN_RADIUS = 22.9;

/** Renders one Built (or merged Parts) as one mesh per material. */
export function MergedParts({ parts }: { parts: Parts }) {
  const geoms = useMemo(() => parts.merge(), [parts]);
  const smallGeoms = useMemo(() => parts.mergeNoCast(), [parts]);
  return (
    <group>
      {MAT_KEYS.filter((k) => geoms.has(k)).map((k) => (
        <mesh key={k} geometry={geoms.get(k)} material={materialFor(k)} castShadow={CASTS[k]} receiveShadow />
      ))}
      {/* small props (stands, plaques, finials...): drawn, but they skip the shadow pass */}
      {MAT_KEYS.filter((k) => smallGeoms.has(k)).map((k) => (
        <mesh key={`small-${k}`} geometry={smallGeoms.get(k)} material={materialFor(k)} receiveShadow />
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

export type TownData = { parts: Parts; anchors: Anchors; lanePosts: THREE.Vector3[] };

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function banner(P: Parts, top: THREE.Vector3, color: string, len = 2.0) {
  const g = plane(0.38, len, 8);
  g.translate(0, -len / 2, 0);
  P.add("cloth", g, color, T(top.x, top.y, top.z));
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
    { a: V(16.2, 4.4, 2.4), b: V(16.3, 3.6, 12.0), drop: 0.8 },
  );

  // stone-slab paths
  const slab = (x0: number, z0: number, x1: number, z1: number, wdt: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    P.add("slab", box(wdt, 0.03, len), "#fff", T((x0 + x1) / 2, 0.015, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0)));
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

  // parapet around the raised town platform
  const seg = 72;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const r = TOWN_RADIUS - 0.15;
    const x0 = Math.sin(a0) * r;
    const z0 = Math.cos(a0) * r;
    const x1 = Math.sin(a1) * r;
    const z1 = Math.cos(a1) * r;
    const len = Math.hypot(x1 - x0, z1 - z0) + 0.02;
    const rot = Math.atan2(x1 - x0, z1 - z0);
    const south = (z0 + z1) / 2 > 6;
    const h = south ? 0.35 : 0.6;
    P.add("brick", box(0.32, h, len), COL.brickWarm, T((x0 + x1) / 2, h / 2, (z0 + z1) / 2, rot));
    P.add("plain", box(0.38, 0.06, len), COL.stone, T((x0 + x1) / 2, h + 0.03, (z0 + z1) / 2, rot));
  }

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
  const g = new THREE.ShapeGeometry(shape, 48);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Terraced fields stepping down from the town, then a hazy valley floor. */
function terrainGeometry() {
  const r = seeded(808);
  const pts: [number, number][] = [
    [TOWN_RADIUS - 0.1, -0.02],
    [TOWN_RADIUS - 0.1, -1.4],
  ];
  let rad = TOWN_RADIUS + 0.4;
  let y = -1.4;
  for (let i = 0; i < 8; i++) {
    const wdt = 2.6 + r() * 1.4 + i * 0.3;
    pts.push([rad, y], [rad + wdt, y - 0.25]);
    rad += wdt;
    y -= 1.2 + i * 0.25;
    pts.push([rad + 0.3, y]);
  }
  pts.push([rad + 18, y - 9], [rad + 45, -40], [210, -40]);
  const g = lathe(pts, 64).toNonIndexed();
  g.computeVertexNormals();
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const fields = ["#8fae5a", "#a9b860", "#c7b45a", "#7ea152", "#b5a24c", "#9cb766"].map((c) => new THREE.Color(c));
  const earth = new THREE.Color("#8a6446");
  const valley = new THREE.Color("#7f9a62");
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const yy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const ny = nrm.getY(i);
    const rr = Math.hypot(x, z);
    if (ny < 0.6) c.copy(earth);
    else if (yy < -20) c.copy(valley);
    else {
      const sector = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 22);
      const ring = Math.floor(rr / 3);
      c.copy(fields[(sector * 7 + ring * 3) % fields.length]);
    }
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export default function Town() {
  const town = useMemo(buildTown, []);
  const ground = useMemo(groundGeometry, []);
  const terrain = useMemo(terrainGeometry, []);
  const m = getMaterials();
  return (
    <group>
      <mesh geometry={ground} material={m.ground} receiveShadow />
      <mesh geometry={terrain} material={m.terrain} receiveShadow />
      <MergedParts parts={town.parts} />
    </group>
  );
}

export type { MatKey };
