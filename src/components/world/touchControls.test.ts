// step23: phone controls: joystick math, touch routing, touch orbit in the gesture tracker, fixed-UI rect collisions.
import assert from "node:assert/strict";
import { test } from "node:test";
import { GestureTracker } from "./cameraRig";
import { RUN_SPEED, WALK_SPEED } from "./input";
import { JOY_DEAD, JOY_RADIUS, JOY_RUN_AT, dprCap, findOverlaps, joySpeed, joyVector, phoneRects, routeTouch } from "./touchControls";

test("joystick: inside the dead zone is zero", () => {
  const o = joyVector(JOY_RADIUS * (JOY_DEAD - 0.02), 0);
  assert.deepEqual([o.x, o.y, o.mag], [0, 0, 0]);
  assert.equal(joyVector(0, 0).mag, 0);
});

test("joystick: magnitude is analog past the dead zone and clamps at the base radius", () => {
  const half = joyVector(JOY_RADIUS * 0.56, 0);
  assert.ok(half.mag > 0.4 && half.mag < 0.6 && half.y === 0);
  const far = joyVector(JOY_RADIUS * 3, JOY_RADIUS * 4);
  assert.equal(far.mag, 1);
  assert.ok(Math.abs(Math.hypot(far.kx, far.ky) - JOY_RADIUS) < 1e-9, "knob stays on the rim");
  assert.ok(Math.abs(Math.hypot(far.x, far.y) - 1) < 1e-9);
  const up = joyVector(0, -JOY_RADIUS);
  assert.ok(up.y < 0 && up.x === 0, "up on screen is -y");
});

test("joystick: small push walks, past 0.85 runs, speed never decreases", () => {
  assert.equal(joySpeed(0), 0);
  assert.ok(joySpeed(0.3) < WALK_SPEED);
  assert.ok(Math.abs(joySpeed(0.6) - WALK_SPEED) < 1e-9);
  assert.equal(joySpeed(JOY_RUN_AT), RUN_SPEED);
  assert.equal(joySpeed(1), RUN_SPEED);
  assert.equal(joySpeed(5), RUN_SPEED);
  let prev = -1;
  for (let m = 0; m <= 1.0001; m += 0.01) {
    const v = joySpeed(m);
    assert.ok(v >= prev - 1e-9);
    prev = v;
  }
});

test("routing: a first touch in the bottom-left zone is the joystick, elsewhere tap/orbit, two fingers pinch", () => {
  const W = 390;
  const H = 844;
  assert.equal(routeTouch({ x: 80, y: 700 }, 1, W, H), "joystick");
  assert.equal(routeTouch({ x: 195, y: 500 }, 1, W, H), "joystick", "the zone edge");
  assert.equal(routeTouch({ x: 300, y: 700 }, 1, W, H), "tap-orbit", "right side");
  assert.equal(routeTouch({ x: 80, y: 200 }, 1, W, H), "tap-orbit", "top-left is the camera");
  assert.equal(routeTouch({ x: 80, y: 700 }, 2, W, H), "pinch");
  assert.equal(routeTouch({ x: 80, y: 700 }, 1, W, H, undefined, true), "tap-orbit", "stick already held");
});

test("gesture tracker: one-finger touch orbit only when enabled, still a tap when it does not move", () => {
  const off = new GestureTracker();
  off.down(1, 300, 300, "touch", 0);
  assert.equal(off.move(1, 360, 340, false), null);
  const on = new GestureTracker({ touchOrbit: true });
  on.down(1, 300, 300, "touch", 0);
  assert.equal(on.move(1, 302, 301, false), null, "inside the tap slop");
  const d = on.move(1, 360, 340, false);
  assert.ok(d && d.dx === 60 && d.dy === 40 && d.pinch === 1, "first step covers the drag so far");
  assert.deepEqual(on.move(1, 370, 340, false), { dx: 10, dy: 0, pinch: 1 });
  assert.equal(on.up(1).tap, false);
  on.down(2, 100, 100, "touch", 0);
  assert.equal(on.up(2).tap, true, "a still touch is a tap -> walk");
  // two fingers still pinch
  on.down(3, 100, 400, "touch", 0);
  on.down(4, 200, 400, "touch", 0);
  const p = on.move(4, 300, 400, false);
  assert.ok(p && p.pinch > 1);
});

test("dpr: phones cap at 1.5, desktop keeps its cap", () => {
  assert.equal(dprCap(true, 3), 1.5);
  assert.equal(dprCap(true, 1), 1);
  assert.equal(dprCap(false, 2), 1.5);
});

test("layout: no fixed phone UI overlaps another at 390x844, 360x740 and landscape 844x390", () => {
  for (const [w, h] of [
    [390, 844],
    [360, 740],
    [844, 390],
  ]) {
    const rects = phoneRects(w, h);
    assert.deepEqual(findOverlaps(rects), [], `${w}x${h}`);
    for (const r of rects) {
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h, `${r.id} on screen at ${w}x${h}`);
    }
  }
});
