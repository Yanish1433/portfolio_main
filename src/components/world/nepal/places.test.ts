// The step8c places: they sit on free cells of the nav grid (clear of every old obstacle and entrance ring),
// inside the walkable island and the wall, and can be reached from the spawn point.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { CHAUTARI, ISLAND_RADIUS, MARKET, POND, SPAWN, STATIC_OBSTACLES, WALL, zones, type Obstacle } from "../zones";
import { HALL_OBSTACLES } from "../halls/layout";
import { Parts } from "./geom";
import { buildPlaces, canopyRadius } from "./placesGeo";
import { buildPagoda } from "./kit";
import { PAGODA } from "../zones";
import { pigeonSpots, buildPigeonGeometry } from "./pigeonData";

const rect = (x: number, z: number, w: number, d: number): Obstacle => ({ kind: "rect", x, z, w, d });
const NEW: Obstacle[] = [
  rect(POND.x, POND.z, POND.w + 0.3, POND.d + 0.3),
  ...MARKET.stalls.map((s) => rect(s.x, MARKET.stallZ, MARKET.stallW + 0.2, 1.5)),
  rect(CHAUTARI.x, CHAUTARI.z, CHAUTARI.lowerW + 0.3, CHAUTARI.lowerD + 0.3),
];
const OLD: Obstacle[] = [...zones.flatMap((z) => z.obstacles), ...STATIC_OBSTACLES.filter((o) => !NEW.some((n) => JSON.stringify(n) === JSON.stringify(o))), ...HALL_OBSTACLES];

const hits = (o: Obstacle, x: number, z: number, pad: number) =>
  o.kind === "circle" ? Math.hypot(x - o.x, z - o.z) < o.r + pad : Math.abs(x - o.x) < o.w / 2 + pad && Math.abs(z - o.z) < o.d / 2 + pad;

/** Footprint corners + centre of a rect obstacle. */
const sample = (o: Obstacle & { kind: "rect" }): [number, number][] => {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) pts.push([o.x - o.w / 2 + (o.w * i) / 4, o.z - o.d / 2 + (o.d * j) / 4]);
  return pts;
};

test("every new place sits on free ground: clear of old obstacles (+0.6 m), entrance rings (+1 m) and each other", () => {
  for (const o of NEW) {
    if (o.kind !== "rect") continue;
    for (const [x, z] of sample(o)) {
      for (const old of OLD) assert.ok(!hits(old, x, z, 0.6), `place at ${o.x},${o.z} overlaps an old obstacle near ${x.toFixed(1)},${z.toFixed(1)}`);
      for (const q of zones) assert.ok(Math.hypot(x - q.ring[0], z - q.ring[1]) > q.ringRadius + 1, `place at ${o.x},${o.z} crowds ring ${q.id}`);
    }
  }
  for (let i = 0; i < NEW.length; i++)
    for (let j = i + 1; j < NEW.length; j++) {
      const a = NEW[i] as { x: number; z: number; w: number; d: number };
      const b = NEW[j] as { x: number; z: number; w: number; d: number };
      assert.ok(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.z - b.z) >= (a.d + b.d) / 2, "two new places overlap");
    }
});

test("footprints are inside the walkable island, and every roof, canopy and awning is inside the wall", () => {
  for (const o of NEW) {
    if (o.kind !== "rect") continue;
    for (const [x, z] of sample(o)) assert.ok(Math.hypot(x, z) <= ISLAND_RADIUS - 0.2, `corner ${x.toFixed(1)},${z.toFixed(1)} is off the island`);
  }
  const P = new Parts();
  buildPlaces(P, { bells: [], diyos: [], lanterns: [], garlands: [] });
  const v = new THREE.Vector3();
  let best = 0;
  for (const map of [P.buckets, P.noCast]) for (const list of map.values()) for (const g of list) for (let i = 0; i < g.attributes.position.count; i++) best = Math.max(best, Math.hypot(g.attributes.position.getX(i), g.attributes.position.getZ(i)));
  void v;
  assert.ok(best <= WALL.inner - 0.3, `places reach r ${best.toFixed(2)}`);
  assert.ok(canopyRadius() <= WALL.inner - 0.3, `canopy reaches r ${canopyRadius().toFixed(2)}`);
  const pg = buildPagoda({ tiers: 5, steps: 5, base: PAGODA.base, guardians: true }).parts;
  let pr = 0;
  for (const map of [pg.buckets, pg.noCast]) for (const list of map.values()) for (const g of list) for (let i = 0; i < g.attributes.position.count; i++) pr = Math.max(pr, Math.hypot(g.attributes.position.getX(i), g.attributes.position.getZ(i)));
  assert.ok(pr + Math.hypot(PAGODA.x, PAGODA.z) <= WALL.inner - 0.3);
});

// ---- nav grid: same cells as nav.ts (0.5 m, avatar 0.45 + 0.12), over the island
const ALL: Obstacle[] = [...OLD, ...NEW];
const PAD = 0.57;
const blockedAt = (x: number, z: number) => Math.hypot(x, z) > ISLAND_RADIUS - 0.9 || ALL.some((o) => hits(o, x, z, PAD));
const C = 0.5;
const H = 26;
const N = (H * 2) / C;
const centre = (i: number) => -H + (i + 0.5) * C;
const cell = (v: number) => Math.floor((v + H) / C);
function flood(from: [number, number]) {
  const seen = new Uint8Array(N * N);
  const q: [number, number][] = [[cell(from[0]), cell(from[1])]];
  seen[q[0][1] * N + q[0][0]] = 1;
  while (q.length) {
    const [i, j] = q.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N || seen[nj * N + ni] || blockedAt(centre(ni), centre(nj))) continue;
      seen[nj * N + ni] = 1;
      q.push([ni, nj]);
    }
  }
  return seen;
}
const near = (seen: Uint8Array, x: number, z: number, r: number) => {
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (seen[(cell(z) + dj) * N + cell(x) + di]) return true;
  return false;
};

test("each new place is reachable from the spawn point (a free cell right beside its front)", () => {
  const seen = flood(SPAWN);
  assert.ok(near(seen, POND.x, POND.z + POND.d / 2 + 0.9, 1), "pond steps unreachable");
  assert.ok(near(seen, POND.x, POND.z - POND.d / 2 - 0.9, 1), "pond north rim unreachable");
  for (const s of MARKET.stalls) assert.ok(near(seen, s.x, MARKET.laneZ, 1), `stall ${s.kind} unreachable`);
  assert.ok(near(seen, CHAUTARI.x, CHAUTARI.z + CHAUTARI.lowerD / 2 + 1.0, 1), "chautari steps unreachable");
  // and every old zone ring still is
  for (const z of zones) assert.ok(near(seen, z.ring[0], z.ring[1], 2), `zone ${z.id} unreachable`);
});

test("ASCII map of the town (printed with MAP=1)", () => {
  if (!process.env.MAP) return;
  let out = "\n";
  const R = 26;
  for (let z = -R; z <= R; z++) {
    let row = String(z).padStart(4) + " ";
    for (let x = -R; x <= R; x++) {
      const r = Math.hypot(x, z);
      let ch = " ";
      if (r > WALL.inner) ch = "#";
      else if (r > ISLAND_RADIUS) ch = "w";
      else if (NEW.some((o) => hits(o, x, z, 0))) ch = "N";
      else if (OLD.some((o) => hits(o, x, z, 0))) ch = "X";
      else if (zones.some((q) => Math.hypot(x - q.ring[0], z - q.ring[1]) < q.ringRadius)) ch = "o";
      else ch = ".";
      row += ch;
    }
    out += row + "\n";
  }
  console.log(out);
});

test("pigeons: enough perches of every kind, and a light bird mesh", () => {
  const spots = pigeonSpots();
  for (const k of ["ground", "pond", "temple", "roof"] as const) assert.ok(spots.filter((s) => s.kind === k).length >= 4, `few ${k} perches`);
  for (const s of spots) assert.ok(Math.hypot(s.x, s.z) < WALL.inner, "perch outside the wall");
  const g = buildPigeonGeometry();
  assert.ok(g.attributes.position.count / 3 <= 300, `bird has ${g.attributes.position.count / 3} tris`);
  assert.equal(g.attributes.aWing.count, g.attributes.position.count);
});
