import { test } from "node:test";
import assert from "node:assert/strict";
import { ISLAND_RADIUS, WALL } from "../zones";
import { arrowDegrees, CENTER, hitZone, MAP_R, mapHidden, mapToWorld, SCALE, worldToMap, type MapVisibility } from "./mapMath";

const near = (a: number, b: number, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("the world centre is the map centre", () => {
  assert.deepEqual(worldToMap(0, 0), [CENTER, CENTER]);
});

test("the wall's outside face lands on the circle's edge, the island edge just inside", () => {
  const [ex, ey] = worldToMap(WALL.outer, 0);
  near(ex, CENTER + MAP_R);
  near(ey, CENTER);
  const [ix] = worldToMap(ISLAND_RADIUS, 0);
  assert.ok(ix < CENTER + MAP_R && ix > CENTER);
});

test("north (-z) is up, east (+x) is right", () => {
  const [, ny] = worldToMap(0, -10);
  const [ex] = worldToMap(10, 0);
  assert.ok(ny < CENTER);
  assert.ok(ex > CENTER);
});

test("points beyond the map are clamped onto the circle", () => {
  const [x, y] = worldToMap(500, 500);
  near(Math.hypot(x - CENTER, y - CENTER), MAP_R);
  const [ux, uy] = worldToMap(500, 500, 0, false);
  assert.ok(Math.hypot(ux - CENTER, uy - CENTER) > MAP_R);
});

test("mapToWorld inverts worldToMap, also with a turn", () => {
  for (const rot of [0, 0.7]) {
    const [mx, my] = worldToMap(-12.5, 7.25, rot);
    const [x, z] = mapToWorld(mx, my, rot);
    near(x, -12.5);
    near(z, 7.25);
  }
  near(SCALE * WALL.outer, MAP_R);
});

test("arrow: heading 0 faces south (down), +90° of heading faces east (right)", () => {
  near(((arrowDegrees(0) % 360) + 360) % 360, 180);
  near(((arrowDegrees(Math.PI / 2) % 360) + 360) % 360, 90);
  near(((arrowDegrees(Math.PI) % 360) + 360) % 360, 0);
});

test("hit-test picks the nearest target within the radius", () => {
  const ts = [
    { id: "a", x: 50, y: 50 },
    { id: "b", x: 60, y: 50 },
  ];
  assert.equal(hitZone(58, 50, ts, 12)?.id, "b");
  assert.equal(hitZone(52, 50, ts, 12)?.id, "a");
  assert.equal(hitZone(120, 120, ts, 12), null);
  assert.equal(hitZone(0, 0, [], 12), null);
});

const base: MapVisibility = { loaded: true, character: true, pickerOpen: false, cinema: false, cameraMode: "follow", intro: false, phone: false, bookOpen: false };

test("hidden rule: loading, intro, cinema, eagle and its glides, phone book panel", () => {
  assert.equal(mapHidden(base), false);
  assert.equal(mapHidden({ ...base, loaded: false }), true);
  assert.equal(mapHidden({ ...base, character: false }), true);
  assert.equal(mapHidden({ ...base, intro: true }), true);
  assert.equal(mapHidden({ ...base, cinema: true }), true);
  for (const m of ["eagle", "cinema", "returning"]) assert.equal(mapHidden({ ...base, cameraMode: m }), true);
  assert.equal(mapHidden({ ...base, bookOpen: true }), false); // desktop keeps it beside the book
  assert.equal(mapHidden({ ...base, bookOpen: true, phone: true }), true);
});
