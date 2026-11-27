import assert from "node:assert/strict";
import { test } from "node:test";
import type { Vec2 } from "@/store/world";
import { arrivedAt, footprintsAlong, MAX_FOOTPRINTS, passedIndex, pathLength, STRIDE } from "./footprints";
import { SECTIONS, sectionTarget } from "./sections";
import { SPAWN } from "../zones";

test("footprints: ~0.6 m apart along the path, count follows its length, alternating feet", () => {
  const path: Vec2[] = [[0, 0], [0, 6]];
  const fps = footprintsAlong(path);
  assert.equal(fps.length, 10);
  fps.forEach((f, i) => assert.equal(f.left, i % 2 === 0));
  // same-foot spacing is two strides, consecutive feet one stride along the path
  for (let i = 1; i < fps.length; i++) assert.ok(Math.abs(fps[i].z - fps[i - 1].z - STRIDE) < 1e-9);
  // first one is a stride out (not under the avatar), all point along +z, feet sit either side of the line
  assert.ok(Math.abs(fps[0].z - STRIDE) < 1e-9);
  assert.ok(fps.every((f) => Math.abs(f.heading) < 1e-9));
  assert.ok(fps.filter((f) => f.left).every((f) => f.x > 0) && fps.filter((f) => !f.left).every((f) => f.x < 0));
});

test("footprints: spacing holds round a corner, and the count is capped", () => {
  const fps = footprintsAlong([[0, 0], [3, 0], [3, 3]]);
  assert.ok(fps.length >= 9 && fps.length <= 11);
  assert.ok(Math.abs(fps[0].heading - Math.PI / 2) < 1e-9 && Math.abs(fps[fps.length - 1].heading) < 1e-9);
  assert.equal(footprintsAlong([[0, 0], [0, 500]]).length, MAX_FOOTPRINTS);
  assert.deepEqual(footprintsAlong([[0, 0]]), []);
  assert.deepEqual(footprintsAlong([[1, 1], [1, 1]]), []);
});

test("passedIndex only moves forward and tracks the avatar", () => {
  const fps = footprintsAlong([[0, 0], [0, 12]]);
  assert.equal(passedIndex(fps, 0, 0.1, 0), 0);
  const at = passedIndex(fps, 0, 3.0, 0, 20);
  assert.ok(Math.abs(fps[at].z - 3.0) < STRIDE);
  // walking back never un-passes a footprint
  assert.ok(passedIndex(fps, 0, 0, at) >= at);
});

test("arrival and path length", () => {
  assert.ok(arrivedAt(1, 1, [1.5, 1], 1));
  assert.ok(!arrivedAt(5, 1, [1.5, 1], 1));
  assert.equal(pathLength([[0, 0], [3, 4]]), 5);
});

test("every Go-to section resolves to a point inside the town (nav.ts needs the browser, so a straight line stands in)", () => {
  assert.ok(SECTIONS.length >= 6);
  for (const s of SECTIONS) {
    const t = sectionTarget(s);
    if (!t) continue; // Workshop only exists when the profile has GitHub-only projects
    const fps = footprintsAlong([SPAWN, t.to]);
    assert.ok(fps.length > 3 && fps.length < MAX_FOOTPRINTS, `${s.id}: ${fps.length}`);
  }
  assert.ok(SECTIONS.filter((s) => sectionTarget(s)).length >= 6);
});

test("quick tour: walking (straight lines +25% for detours, run speed) plus the pauses is about a minute", async () => {
  const { QUICK_TOUR_STOPS, quickTourDurationMs } = await import("@/lib/robot/quickTour");
  const { zoneById } = await import("../zones");
  const { RUN_SPEED } = await import("../input");
  let from: Vec2 = SPAWN;
  const legs: number[] = [];
  for (const id of QUICK_TOUR_STOPS) {
    const to = zoneById(id)!.ring;
    legs.push(pathLength([from, to]) * 1.25);
    from = to;
  }
  const secs = quickTourDurationMs(legs, RUN_SPEED * 0.9) / 1000;
  console.log(`quick tour ~ ${secs.toFixed(1)} s, legs ${legs.map((l) => l.toFixed(0)).join("/")} m`);
  assert.ok(secs >= 45 && secs <= 80, `${secs}`);
});
