// The path stones and the pathshala must stay reachable (offline check of the nav grid).
import assert from "node:assert/strict";
import { test } from "node:test";
import { profile } from "@/content/profile";
import { JOURNEY, stonePositions } from "./journey";
import { GHAR, ISLAND_RADIUS, MILESTONES, STATIC_OBSTACLES, TIMELINE_PATH, zones, type Obstacle } from "./zones";
import { HALL_OBSTACLES, SCROLL, SHELF, EASELS } from "./halls/layout";

// A small stand-in for nav.ts (which pulls in the store): the same 0.5 m grid, avatar radius + 0.12.
const obstacles: Obstacle[] = [...zones.flatMap((z) => z.obstacles), ...STATIC_OBSTACLES, ...HALL_OBSTACLES];
const PAD = 0.45 + 0.12;
function blockedAt(x: number, z: number, pad = PAD): boolean {
  if (Math.hypot(x, z) > ISLAND_RADIUS - 0.9) return true;
  return obstacles.some((o) => (o.kind === "circle" ? Math.hypot(x - o.x, z - o.z) < o.r + pad : Math.abs(x - o.x) < o.w / 2 + pad && Math.abs(z - o.z) < o.d / 2 + pad));
}
function reachable(from: [number, number], to: [number, number]): boolean {
  const C = 0.5;
  const key = (i: number, j: number) => i * 1000 + j;
  const cell = (v: number) => Math.floor((v + 24) / C);
  const centre = (i: number) => -24 + (i + 0.5) * C;
  const start: [number, number] = [cell(from[0]), cell(from[1])];
  const goal: [number, number] = [cell(to[0]), cell(to[1])];
  const seen = new Set([key(...start)]);
  const queue = [start];
  while (queue.length) {
    const [i, j] = queue.shift()!;
    if (Math.abs(i - goal[0]) <= 1 && Math.abs(j - goal[1]) <= 1) return true;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= 96 || nj >= 96 || seen.has(key(ni, nj)) || blockedAt(centre(ni), centre(nj))) continue;
      seen.add(key(ni, nj));
      queue.push([ni, nj]);
    }
  }
  return false;
}
const findPath = (a: { x: number; z: number }, b: { x: number; z: number }) => reachable([a.x, a.z], [b.x, b.z]);

test("one stone per stop of the journey, ending with the Next milestone stone", () => {
  assert.equal(MILESTONES.length, JOURNEY.length);
  assert.equal(JOURNEY[JOURNEY.length - 1].kind, "next");
  assert.ok(JOURNEY.length <= 6);
});

test("stones are well spaced, clear of the Ghar and off the lane itself", () => {
  for (let i = 0; i < MILESTONES.length; i++) {
    for (let j = i + 1; j < MILESTONES.length; j++) {
      const d = Math.hypot(MILESTONES[i][0] - MILESTONES[j][0], MILESTONES[i][1] - MILESTONES[j][1]);
      assert.ok(d >= 1.4, `stones ${i} and ${j} are ${d.toFixed(2)} m apart`);
    }
    const [x, z] = MILESTONES[i];
    assert.ok(Math.abs(x - GHAR.x) > GHAR.w / 2 + 0.9 || Math.abs(z - GHAR.z) > GHAR.d / 2 + 1.6, `stone ${i} is too close to the Ghar`);
  }
  // the lane's own middle line stays walkable
  const lane = stonePositions(TIMELINE_PATH, 5, 0);
  for (const [x, z] of lane) assert.ok(!blockedAt(x, z), `lane point ${x},${z} is blocked`);
});

test("every zone ring, the scroll ring and the walk-up spots can be reached from the plaza", () => {
  const from = { x: 0, z: 4.4 };
  for (const z of zones) assert.ok(findPath(from, { x: z.ring[0], z: z.ring[1] }), `no path to ${z.id}`);
  if (SCROLL) assert.ok(findPath(from, { x: SCROLL.ring[0], z: SCROLL.ring[1] }), "no path to the scroll");
  for (const e of EASELS) assert.ok(findPath(from, { x: e.spot.ring[0], z: e.spot.ring[1] }), "no path to an easel");
  if (SHELF) assert.ok(findPath(from, { x: SHELF.ring[0], z: SHELF.ring[1] }), "no path to the shelf");
});

test("nothing empty is built: no certificates means no easels, no courses means no shelf", () => {
  // (HALL follows profile.ts unless ?debug overrides, which node never sets)
  assert.equal(EASELS.length > 0, profile.certificates.length > 0);
  assert.equal(SHELF !== null, profile.courses.length > 0);
  assert.equal(SCROLL !== null, profile.education.length > 0);
});
