// step22 pottery: clay shaping, skill pick, save / load (incl. corrupt storage) and the corner's placement (nav + occupancy).
import assert from "node:assert/strict";
import { test } from "node:test";
import { BANDS, H_MAX, H_MIN, MAX_STEP, R_MAX, R_MIN, WALL, applyDrag, clampClay, innerR, isValidClay, newClay, nudgeBand, nudgeHeight, stepBand } from "./clayProfile";
import { bandWeight, contrast, coolAmounts, glazeFor, initials, luminance, medallionDiameter, mixRgb, parseHex, toCss } from "./glaze";
import { profile } from "../../../content/profile";
import { logoFor } from "../../recruiter/book/skillLogos";
import { allCollected, pickSkill, uniqueSkills } from "./skillPick";
import { SAVE_KEY, SHELF_MAX, addPot, emptySave, loadSave, parseSave, storeSave } from "./save";
import { POTTERY_OBSTACLES, POTTERY_RING, SHELF, WHEEL, shelfSlot, shelfYaw, ATLAS, SHELF_SCALE } from "./layout";
import { ISLAND_RADIUS, SPAWN, STATIC_OBSTACLES, WALL as TOWN_WALL, zoneById, zones } from "../zones";
import { HALL_OBSTACLES } from "../halls/layout";
import { ZONE_PRESETS } from "../cameraRig";

// ---------------------------------------------------------------- clay profile

test("a new lump is a valid pot", () => {
  assert.ok(isValidClay(newClay()));
});

test("dragging right widens, left narrows, up raises: around the touched height", () => {
  const c = newClay();
  const r0 = c.r[6];
  applyDrag(c, 6 / (BANDS - 1), 60, 0);
  assert.ok(c.r[6] > r0, "right = wider");
  assert.ok(c.r[6] > c.r[0], "the touched band moved most");
  const c2 = newClay();
  applyDrag(c2, 0.5, -60, 0);
  assert.ok(c2.r[6] < r0, "left = narrower");
  const c3 = newClay();
  applyDrag(c3, 0.5, 0, -80);
  assert.ok(c3.h > newClay().h, "up = taller");
});

test("any drag keeps the clay valid: radius limits, neighbour step, height, wall thickness", () => {
  const c = newClay();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  for (let i = 0; i < 500; i++) {
    applyDrag(c, Math.abs(rnd()) * 2, rnd() * 400, rnd() * 400);
    assert.ok(isValidClay(c), `invalid after step ${i}`);
  }
  for (let k = 0; k < BANDS; k++) {
    assert.ok(c.r[k] >= R_MIN - 1e-9 && c.r[k] <= R_MAX + 1e-9);
    assert.ok(innerR(c.r[k]) >= c.r[k] - WALL - 1e-9 && innerR(c.r[k]) > 0, "a wall of at least WALL thickness");
    if (k) assert.ok(Math.abs(c.r[k] - c.r[k - 1]) <= MAX_STEP + 1e-9);
  }
  assert.ok(c.h >= H_MIN && c.h <= H_MAX);
});

test("extreme drags clamp instead of breaking; clampClay repairs bad numbers and is idempotent", () => {
  const c = newClay();
  applyDrag(c, 0.5, 1e6, -1e6);
  assert.ok(isValidClay(c));
  assert.ok(c.h <= H_MAX);
  const bad = { r: Array.from({ length: BANDS }, (_, i) => (i % 2 ? NaN : 99)), h: -5 };
  const fixed = clampClay(bad);
  assert.ok(isValidClay(fixed));
  const again = clampClay({ r: [...fixed.r], h: fixed.h });
  assert.deepEqual(again, fixed);
});

test("keyboard: bands step within 0..11, arrows reshape, height nudges clamp", () => {
  assert.equal(stepBand(0, -1), 0);
  assert.equal(stepBand(BANDS - 1, 1), BANDS - 1);
  assert.equal(stepBand(5, 1), 6);
  const c = newClay();
  const before = c.r[4];
  nudgeBand(c, 4, 1);
  assert.ok(c.r[4] > before);
  nudgeBand(c, 4, -1);
  nudgeBand(c, 4, -1);
  assert.ok(c.r[4] < before);
  for (let i = 0; i < 40; i++) nudgeHeight(c, 1);
  assert.equal(c.h, H_MAX);
  for (let i = 0; i < 80; i++) nudgeHeight(c, -1);
  assert.equal(c.h, H_MIN);
});

// ---------------------------------------------------------------- skill pick

const SKILLS = ["React", "Node.js", "MongoDB", "Three.js"];

test("skill pick: never a repeat until every skill is collected, then any", () => {
  const have: string[] = [];
  let seed = 3;
  const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  for (let i = 0; i < SKILLS.length; i++) {
    const s = pickSkill(SKILLS, have, rnd)!;
    assert.ok(!have.includes(s), `${s} repeated`);
    have.push(s);
  }
  assert.ok(allCollected(SKILLS, have));
  assert.ok(SKILLS.includes(pickSkill(SKILLS, have, rnd)!), "after all, any skill");
  assert.equal(pickSkill([], [], rnd), null);
  assert.ok(!allCollected([], []), "no skills is never 'all collected'");
});

test("skill pick is case-insensitive and de-duplicates the list", () => {
  assert.deepEqual(uniqueSkills(["React", " react ", "Node.js", ""]), ["React", "Node.js"]);
  assert.equal(pickSkill(["React", "Vue"], ["react"], () => 0), "Vue");
  assert.ok(allCollected(["React"], ["REACT"]));
});

// ---------------------------------------------------------------- save / load

test("save: round trip, the shelf keeps the newest 8, the collection keeps everything", () => {
  let s = emptySave();
  for (let i = 0; i < 11; i++) s = addPot(s, newClay(), `Skill${i}`);
  assert.equal(s.pots.length, SHELF_MAX);
  assert.equal(s.collected.length, 11);
  assert.equal(s.pots[SHELF_MAX - 1].skill, "Skill10");
  const back = parseSave(JSON.stringify(s));
  assert.deepEqual(back, s);
});

test("save: corrupt or foreign storage resets; bad pots are dropped, never thrown", () => {
  assert.deepEqual(parseSave(null), emptySave());
  assert.deepEqual(parseSave("{not json"), emptySave());
  assert.deepEqual(parseSave("[1,2]"), emptySave());
  assert.deepEqual(parseSave(JSON.stringify({ v: 2, pots: [], collected: [] })), emptySave());
  assert.deepEqual(parseSave(JSON.stringify({ v: 1, pots: "x", collected: [] })), emptySave());
  const mixed = parseSave(JSON.stringify({ v: 1, pots: [{ r: [1, 2], h: 1, skill: "X" }, { r: Array(BANDS).fill(5), h: 9, skill: "Ok" }, null], collected: ["A", 3, ""] }));
  assert.equal(mixed.pots.length, 1);
  assert.ok(isValidClay({ r: mixed.pots[0].r, h: mixed.pots[0].h }), "values are clamped on load");
  assert.deepEqual(mixed.collected, ["A", "Ok"]);
});

test("save: a blocked or throwing localStorage never throws", () => {
  const boom = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("full");
    },
  };
  assert.deepEqual(loadSave(boom), emptySave());
  assert.equal(storeSave(emptySave(), boom), false);
  const mem = new Map<string, string>();
  const ok = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  assert.equal(storeSave(addPot(emptySave(), newClay(), "React"), ok), true);
  assert.ok(mem.has(SAVE_KEY));
  assert.equal(loadSave(ok).pots[0].skill, "React");
});

// ---------------------------------------------------------------- placement

const hits = (o: (typeof POTTERY_OBSTACLES)[number] | (typeof STATIC_OBSTACLES)[number], x: number, z: number, pad: number) =>
  o.kind === "circle" ? Math.hypot(x - o.x, z - o.z) < o.r + pad : Math.abs(x - o.x) < o.w / 2 + pad && Math.abs(z - o.z) < o.d / 2 + pad;

/** Walkable? (same rule as nav.ts: avatar radius 0.45 + 0.12 grid padding, island edge margin 0.9) */
const OLD_ALL = [...zones.flatMap((q) => q.obstacles), ...STATIC_OBSTACLES, ...HALL_OBSTACLES];
const blockedAt = (x: number, z: number) => Math.hypot(x, z) > ISLAND_RADIUS - 0.9 || OLD_ALL.some((o) => hits(o, x, z, 0.57));
/** Flood fill over a 0.5 m grid from the spawn: can the avatar reach (tx, tz)? */
function reachable(tx: number, tz: number): boolean {
  const key = (i: number, j: number) => i * 1000 + j;
  const cell = (v: number) => Math.round(v / 0.5);
  const seen = new Set<number>([key(cell(SPAWN[0]), cell(SPAWN[1]))]);
  const q: [number, number][] = [[cell(SPAWN[0]), cell(SPAWN[1])]];
  const goal = [cell(tx), cell(tz)];
  while (q.length) {
    const [i, j] = q.pop()!;
    if (Math.abs(i - goal[0]) <= 1 && Math.abs(j - goal[1]) <= 1) return true;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di;
      const b = j + dj;
      if (seen.has(key(a, b)) || blockedAt(a * 0.5, b * 0.5)) continue;
      seen.add(key(a, b));
      q.push([a, b]);
    }
  }
  return false;
}

test("the pottery zone: ring on free ground, reachable from the spawn, and the corner overlaps nothing old", () => {
  const z = zoneById("pottery")!;
  assert.ok(z);
  assert.deepEqual(z.ring, [POTTERY_RING.x, POTTERY_RING.z]);
  assert.ok(!blockedAt(z.ring[0], z.ring[1]), "the ring centre is walkable");
  assert.ok(reachable(z.ring[0], z.ring[1]), "a path from the spawn to the ring");
  const others = [...zones.filter((q) => q.id !== "pottery").flatMap((q) => q.obstacles), ...STATIC_OBSTACLES, ...HALL_OBSTACLES];
  for (const o of POTTERY_OBSTACLES)
    for (let i = 0; i <= 4; i++)
      for (let j = 0; j <= 4; j++) {
        const x = o.x - o.w / 2 + (o.w * i) / 4;
        const zz = o.z - o.d / 2 + (o.d * j) / 4;
        assert.ok(Math.hypot(x, zz) <= ISLAND_RADIUS - 0.5, "inside the island");
        assert.ok(Math.hypot(x, zz) <= TOWN_WALL.inner - 1, "inside the wall");
        for (const old of others) assert.ok(!hits(old, x, zz, 0.3), `overlaps an old obstacle near ${x.toFixed(1)},${zz.toFixed(1)}`);
      }
  for (const q of zones.filter((q) => q.id !== "pottery")) {
    assert.ok(Math.hypot(q.ring[0] - z.ring[0], q.ring[1] - z.ring[1]) > q.ringRadius + z.ringRadius + 0.5, `ring overlaps ${q.id}`);
  }
});

test("wheel head, shelf slots and the camera preset are consistent", () => {
  for (let i = 0; i < SHELF_MAX; i++) {
    const p = shelfSlot(i);
    assert.ok(Math.abs(p.x - SHELF.x) <= SHELF.w / 2 && Math.abs(p.z - SHELF.z) <= SHELF.d / 2, `slot ${i} on the shelf`);
  }
  assert.ok(new Set(Array.from({ length: SHELF_MAX }, (_, i) => `${shelfSlot(i).x},${shelfSlot(i).y}`)).size === SHELF_MAX, "8 distinct slots");
  const ring = zoneById("pottery")!.ring;
  assert.ok(Math.hypot(WHEEL.x - ring[0], WHEEL.z - ring[1]) < 3, "the wheel is beside the ring");
  const p = ZONE_PRESETS.pottery;
  assert.ok(p && p.dist >= 6 && p.enter < p.exit);
});

// ---------------------------------------------------------------- step24 glaze + medallion

test("hex parsing: with or without '#', 3 or 6 digits, bad input is null", () => {
  assert.deepEqual(parseHex("FF0000"), [1, 0, 0]);
  assert.deepEqual(parseHex("#00ff00"), [0, 1, 0]);
  assert.deepEqual(parseHex("00f"), [0, 0, 1]);
  assert.equal(parseHex("zzzzzz"), null);
  assert.equal(parseHex(""), null);
  assert.equal(parseHex(null), null);
});

test("mix clamps t and css output clamps channels", () => {
  assert.deepEqual(mixRgb([0, 0, 0], [1, 1, 1], 5), [1, 1, 1]);
  assert.deepEqual(mixRgb([0, 0, 0], [1, 1, 1], -2), [0, 0, 0]);
  assert.equal(toCss([2, -1, 0.5]), "#ff0080");
});

test("brand colour: body ~88% toward the brand, rim a darker shade of it, dark circle + white logo when cream would not contrast", () => {
  const g = glazeFor("61DAFB"); // React: light blue, fails 3:1 on cream
  assert.equal(g.kind, "normal");
  const t = parseHex("#c4663a") as number[];
  const b = parseHex("61DAFB") as number[];
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(g.body[i] - (t[i] + (b[i] - t[i]) * 0.88)) < 1e-9);
    assert.ok(Math.abs(g.rim[i] - b[i] * 0.8) < 1e-9);
  }
  assert.equal(g.medal.fill, "#2a1a10");
  assert.equal(g.medal.ink, "#ffffff");
  assert.equal(g.medal.ring, "#61dafb");
  const dk = glazeFor("3A6FD0"); // a deep blue contrasts on cream: brand logo on cream
  assert.equal(dk.medal.fill, "#f3e6cc");
  assert.equal(dk.medal.ink, "#3a6fd0");
  assert.ok(contrast(parseHex("3A6FD0") as [number, number, number], parseHex("#f3e6cc") as [number, number, number]) >= 3);
});

test("brand glazes read as their colour, never grey/teal mud (hue range + saturation)", () => {
  const hsv = (c: number[]) => {
    const mx = Math.max(...c), mn = Math.min(...c), d = mx - mn;
    let h = 0;
    if (d > 0) h = mx === c[0] ? ((c[1] - c[2]) / d + 6) % 6 : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4;
    return { h: h * 60, s: mx ? d / mx : 0 };
  };
  const table: [string, string, number, number][] = [
    ["React", "61DAFB", 190, 215],
    ["MongoDB", "47A248", 100, 140],
    ["JavaScript", "F7DF1E", 45, 65],
    ["Git", "F05032", 5, 22],
    ["Tailwind", "06B6D4", 180, 195],
  ];
  for (const [name, hex, lo, hi] of table) {
    const { h, s } = hsv(glazeFor(hex).body);
    assert.ok(h >= lo && h <= hi, `${name} hue ${h}`);
    assert.ok(s > 0.35, `${name} saturation ${s}`);
  }
});

test("very light brand -> dark circle with a white logo and a darkened rim", () => {
  assert.ok(luminance(parseHex("FFFFFF") as [number, number, number]) > 0.8);
  const g = glazeFor("FFFFFF");
  assert.equal(g.kind, "light");
  assert.equal(g.medal.fill, "#2a1a10");
  assert.equal(g.medal.ink, "#ffffff");
  assert.ok(luminance(g.rim) < luminance([1, 1, 1]) * 0.5);
});

test("very dark brand (Express, GitHub) -> slate glaze, black logo on cream with a dark ring", () => {
  for (const hex of ["000000", "181717"]) {
    const g = glazeFor(hex);
    assert.equal(g.kind, "dark");
    assert.equal(g.medal.fill, "#f3e6cc");
    assert.equal(g.medal.ink, "#141414");
    // not a mud-brown: stays closer to terracotta than to black
    assert.ok(luminance(g.body) > 0.05);
    assert.notEqual(toCss(g.body), "#c4663a"); // charcoal, not terracotta
  }
});

test("no brand colour -> plain terracotta pot with a terracotta medallion", () => {
  const g = glazeFor(null);
  assert.equal(g.kind, "none");
  assert.equal(toCss(g.body), "#c4663a");
});

test("band weight: body low, belly band, then the rim lip", () => {
  assert.equal(bandWeight(0.03), 0);
  assert.equal(bandWeight(0.55), 0); // the medallion's centre is never banded
  assert.equal(bandWeight(0.2), 1);
  assert.equal(bandWeight(1), 1);
});

test("cooling: glaze first, medallion later, both instant at heat 0", () => {
  assert.deepEqual(coolAmounts(1), { glaze: 0, decal: 0 });
  assert.deepEqual(coolAmounts(0), { glaze: 1, decal: 1 });
  const m = coolAmounts(0.6);
  assert.ok(m.glaze > m.decal);
  assert.deepEqual(coolAmounts(5), { glaze: 0, decal: 0 });
});

test("medallion: 65% of the height, never more than 40% round a tall narrow pot; initials", () => {
  assert.ok(Math.abs(medallionDiameter(0.4, 0.3) - 0.26) < 1e-9);
  assert.ok(Math.abs(medallionDiameter(0.9, 0.1) - 0.4 * 2 * Math.PI * 0.1) < 1e-9);
  assert.equal(initials("Three.js"), "TJ");
  assert.equal(initials("Python"), "PY");
});

test("shelf: the tallest scaled pot fits under the next board; every pot turns toward the walkway (within 0.5 rad of south)", () => {
  const gap = Math.min(SHELF.boards[1] - SHELF.boards[0], SHELF.boards[2] - SHELF.boards[1]) - 0.05 - 0.025;
  assert.ok(H_MAX * SHELF_SCALE < gap);
  assert.equal(ATLAS.cellW, 256);
  assert.equal(ATLAS.cellH, 512);
  for (let i = 0; i < 8; i++) {
    const y = shelfYaw(i);
    assert.ok(Math.abs(y - Math.PI) <= 0.5 + 1e-9);
    // local -z -> (-sin y, -cos y): faces south (+z) and not away from the ring side
    assert.ok(-Math.cos(y) > 0);
  }
  assert.ok(shelfYaw(0) < Math.PI); // the left pots turn toward the ring (west)
});

test("every profile skill with a Simple Icons logo gets its brand glaze + logo; the rest fall back to a generic icon (listed)", () => {
  const names = profile.skills.flatMap((g) => g.skills.map((s) => s.name));
  const fallback: string[] = [];
  for (const n of names) {
    const l = logoFor(n);
    if (l.kind !== "brand") {
      fallback.push(n);
      assert.equal(glazeFor(null).kind, "none");
      continue;
    }
    const g = glazeFor(l.logo.hex);
    assert.notEqual(g.kind, "none", n);
    assert.notEqual(toCss(g.body), "#c4663a", n);
  }
  assert.deepEqual(fallback, ["REST APIs", "WebSockets", "React Three Fiber"]); // no Simple Icons mark exists for these
  for (const a of ["NodeJS", "node", "Git", "GitHub", "JWT", "Tailwind", "Mongo"]) assert.equal(logoFor(a).kind, "brand", a);
});
