// The guestbook flag string must block nothing: its posts stand on free ground, clear of the lantern, chautari and paths.
import assert from "node:assert/strict";
import { test } from "node:test";
import { HALL_OBSTACLES } from "../halls/layout";
import { HIRE_LANTERN } from "../nepal/lanternSpec";
import { CHAUTARI, GHAR, ISLAND_RADIUS, SPAWN, STATIC_OBSTACLES, TIMELINE_PATH, zones } from "../zones";
import { flagCount, flagLayout, FLAG_COLORS, GUESTBOOK as G } from "./flagSpec";

// same overlap rule as nav.ts (repeated here: node's strip-only mode can't load its parameter properties)
const solids = [...zones.flatMap((z) => z.obstacles), ...STATIC_OBSTACLES, ...HALL_OBSTACLES];
const lerp = (t: number) => ({ x: G.postA.x + (G.postB.x - G.postA.x) * t, z: G.postA.z + (G.postB.z - G.postA.z) * t });
const blockedAt = (x: number, z: number, pad: number) =>
  Math.hypot(x, z) > ISLAND_RADIUS - 0.9 ||
  solids.some((o) => (o.kind === "circle" ? Math.hypot(x - o.x, z - o.z) < o.r + pad : Math.abs(x - o.x) < o.w / 2 + pad && Math.abs(z - o.z) < o.d / 2 + pad));

test("both posts and the whole string stand on free ground", () => {
  for (const p of [G.postA, G.postB]) assert.ok(!blockedAt(p.x, p.z, 1.0), `post ${p.x},${p.z} blocked`);
  for (let t = 0; t <= 1; t += 0.05) assert.ok(!blockedAt(lerp(t).x, lerp(t).z, 0.6), `string at t=${t} over an obstacle`);
});

test("clear of the lantern, chautari, spawn, timeline lane and every ring", () => {
  for (const p of [G.postA, G.postB]) {
    assert.ok(Math.hypot(p.x - HIRE_LANTERN.x, p.z - HIRE_LANTERN.z) > 10, "near the lantern");
    assert.ok(Math.hypot(p.x - CHAUTARI.x, p.z - CHAUTARI.z) > CHAUTARI.lowerW / 2 + 2, "crowds the chautari");
    assert.ok(Math.hypot(p.x - SPAWN[0], p.z - SPAWN[1]) > 3, "near the spawn");
    for (const [x, z] of TIMELINE_PATH) assert.ok(Math.hypot(p.x - x, p.z - z) > 2, "on the timeline lane");
    for (const zn of zones) assert.ok(Math.hypot(p.x - zn.ring[0], p.z - zn.ring[1]) > zn.ringRadius + 1, `crowds the ${zn.id} ring`);
    assert.ok(Math.hypot(p.x - GHAR.x, p.z - GHAR.z) > 6, "by the Ghar");
  }
});

test("flag layout: count, colour order, positions along the string, unique atlas cells", () => {
  assert.equal(flagCount(0), 5);
  assert.equal(flagCount(12), 12);
  assert.equal(flagCount(99), 30);
  const f = flagLayout(30);
  assert.equal(f.length, 30);
  assert.deepEqual(f.slice(0, 5).map((p) => p.color), [0, 1, 2, 3, 4]);
  assert.equal(FLAG_COLORS[f[0].color], "#2b6cc4");
  assert.equal(new Set(f.map((p) => `${p.cellCol},${p.cellRow}`)).size, 30);
  for (const p of f) {
    assert.ok(p.x > G.postA.x && p.x < G.postB.x, "flag off the string");
    assert.ok(p.y - G.flagH > 1.5 && p.y < G.postH, "flag too low or above the post");
    assert.ok(p.cellRow < G.atlas.rows);
  }
  // a short string is centred and its flags don't overlap
  const few = flagLayout(5);
  const zs = few.map((p) => p.x);
  assert.ok(Math.abs((zs[0] + zs[4]) / 2 - (G.postA.x + G.postB.x) / 2) < 1e-9);
  for (let i = 1; i < zs.length; i++) assert.ok(zs[i] - zs[i - 1] > G.flagW);
});
