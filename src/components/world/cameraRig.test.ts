import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_VIEW,
  DWELL_SECS,
  GestureTracker,
  PITCH_MAX,
  PITCH_MIN,
  YAW_LIMIT,
  ZONE_PRESETS,
  ZOOM_MAX,
  ZOOM_MIN,
  moveVector,
  newFrameState,
  noteManual,
  orbitBy,
  pickZone,
  updateFrame,
  viewOfZone,
  type Ring,
} from "./cameraRig";

const rings: Ring[] = [
  { id: "plaza", x: 0, z: 4.4 },
  { id: "skills-lab", x: 9.6, z: -3 },
  { id: "education", x: -11.3, z: -2.5 },
  { id: "about", x: -14, z: 8.2 },
];

test("every preset sits inside the zoom range and has enter < exit", () => {
  for (const [id, p] of Object.entries(ZONE_PRESETS)) {
    assert.ok(p.dist >= ZOOM_MIN && p.dist <= ZOOM_MAX, `${id} dist`);
    assert.ok(p.pitch >= PITCH_MIN && p.pitch <= PITCH_MAX, `${id} pitch`);
    assert.ok(Math.abs(p.yaw) <= YAW_LIMIT, `${id} yaw`);
    assert.ok(p.enter < p.exit, `${id} hysteresis`);
  }
});

test("zone -> preset pick: inside the enter radius, nearest wins, centre has none", () => {
  assert.equal(pickZone(9.6, -3, rings, null), "skills-lab");
  assert.equal(pickZone(-11.3, -2.5, rings, null), "education");
  assert.equal(pickZone(0, 4.4, rings, null), null); // plaza has no preset
  assert.equal(pickZone(0, 8.5, rings, null), null);
  assert.deepEqual(viewOfZone(null), DEFAULT_VIEW);
  assert.equal(viewOfZone("skills-lab").dist, ZONE_PRESETS["skills-lab"].dist);
});

test("hysteresis: enters at enter radius, holds until the exit radius", () => {
  const p = ZONE_PRESETS["skills-lab"];
  const mid = (p.enter + p.exit) / 2;
  assert.equal(pickZone(9.6 + mid, -3, rings, null), null); // between the radii, not yet framed
  assert.equal(pickZone(9.6 + mid, -3, rings, "skills-lab"), "skills-lab"); // already framed: held
  assert.equal(pickZone(9.6 + p.exit + 0.1, -3, rings, "skills-lab"), null); // past exit: let go
});

test("dwell: a zone change commits only after the dwell, and a flicker never commits", () => {
  const fs = newFrameState();
  assert.equal(updateFrame(fs, 9.6, -3, 0.1, rings), null);
  assert.equal(updateFrame(fs, 9.6, -3, 0.1, rings), null);
  assert.equal(fs.zone, null);
  // step out before the dwell ends: candidate resets
  assert.equal(updateFrame(fs, 0, 8.5, 0.1, rings), null);
  assert.equal(updateFrame(fs, 9.6, -3, 0.1, rings), null);
  assert.equal(fs.zone, null);
  // stay long enough
  let view = null;
  for (let t = 0; t < DWELL_SECS + 0.2 && !view; t += 0.1) view = updateFrame(fs, 9.6, -3, 0.1, rings);
  assert.ok(view);
  assert.equal(fs.zone, "skills-lab");
  assert.equal(view.dist, ZONE_PRESETS["skills-lab"].dist);
  // staying put returns nothing more
  assert.equal(updateFrame(fs, 9.6, -3, 0.1, rings), null);
});

test("manual latch: stays until the framed zone changes, then re-arms", () => {
  const fs = newFrameState();
  for (let i = 0; i < 6; i++) updateFrame(fs, 9.6, -3, 0.1, rings);
  assert.equal(fs.zone, "skills-lab");
  noteManual(fs);
  assert.equal(fs.manual, true);
  // walking about inside the zone never re-applies the preset
  for (let i = 0; i < 20; i++) assert.equal(updateFrame(fs, 10 + i * 0.05, -3, 0.1, rings), null);
  assert.equal(fs.manual, true);
  // leave for the centre, then enter another zone: the camera frames again
  let back = null;
  for (let i = 0; i < 8; i++) back = updateFrame(fs, 0, 8.5, 0.1, rings) ?? back;
  assert.deepEqual(back, DEFAULT_VIEW);
  assert.equal(fs.manual, false);
  let v = null;
  for (let i = 0; i < 8; i++) v = updateFrame(fs, -11.3, -2.5, 0.1, rings) ?? v;
  assert.equal(fs.zone, "education");
  assert.ok(v);
});

test("camera-relative move vector", () => {
  const near = (a: [number, number], b: [number, number]) => {
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9, `${a} vs ${b}`);
  };
  near(moveVector(0, -1, 0), [0, -1]); // forward = north at the south view
  near(moveVector(1, 0, 0), [1, 0]);
  // camera swung to the east (yaw +90): forward is west, right is north
  near(moveVector(0, -1, Math.PI / 2), [-1, 0]);
  near(moveVector(1, 0, Math.PI / 2), [0, -1]);
  // magnitude is preserved
  const [x, z] = moveVector(0.6, -0.8, 0.9);
  assert.ok(Math.abs(Math.hypot(x, z) - 1) < 1e-9);
});

test("orbit clamps yaw to +/-75 deg and pitch to 25..65 deg", () => {
  const a = orbitBy(0, DEFAULT_VIEW.pitch, -100000, 100000);
  assert.equal(a.yaw, YAW_LIMIT);
  assert.equal(a.pitch, PITCH_MAX);
  const b = orbitBy(0, DEFAULT_VIEW.pitch, 100000, -100000);
  assert.equal(b.yaw, -YAW_LIMIT);
  assert.equal(b.pitch, PITCH_MIN);
});

test("gesture: a short click is a tap; wiggling under the slop is still a tap", () => {
  const g = new GestureTracker();
  g.down(1, 100, 100, "mouse", 0);
  assert.equal(g.move(1, 103, 102, false), null);
  assert.equal(g.up(1).tap, true);
});

test("gesture: left-drag past the slop orbits and never taps", () => {
  const g = new GestureTracker();
  g.down(1, 100, 100, "mouse", 0);
  assert.equal(g.move(1, 104, 100, false), null);
  const d = g.move(1, 110, 100, false);
  assert.ok(d);
  assert.equal(d.dx, 10); // the first step covers the whole drag so far
  const d2 = g.move(1, 115, 100, false);
  assert.equal(d2?.dx, 5);
  assert.equal(g.up(1).tap, false);
});

test("gesture: right-drag orbits at once; a claimed press never orbits", () => {
  const g = new GestureTracker();
  g.down(1, 50, 50, "mouse", 2);
  assert.equal(g.move(1, 52, 50, false)?.dx, 2);
  assert.equal(g.up(1).tap, false);
  const c = new GestureTracker();
  c.down(2, 50, 50, "mouse", 0);
  assert.equal(c.move(2, 80, 50, true), null); // claimed: the stand/book handles it
  assert.equal(c.up(2).tap, false); // it was a drag: no walk either
});

test("gesture: one finger never orbits; two fingers orbit and pinch", () => {
  const g = new GestureTracker();
  g.down(1, 100, 100, "touch", 0);
  assert.equal(g.move(1, 160, 100, false), null);
  assert.equal(g.up(1).tap, false);

  const t = new GestureTracker();
  t.down(1, 100, 200, "touch", 0);
  t.down(2, 200, 200, "touch", 0);
  const spread = t.move(2, 250, 200, false); // one finger out by 50: spread 100 -> 150
  assert.ok(spread);
  assert.ok(Math.abs(spread.pinch - 1.5) < 1e-9);
  const drag = t.move(1, 100, 220, false); // midpoint moves down
  assert.ok(drag && drag.dy > 0);
  // lifting the fingers: neither is a tap, and the next lone press is a tap again
  assert.equal(t.up(2).tap, false);
  assert.equal(t.up(1).tap, false);
  t.down(3, 10, 10, "touch", 0);
  assert.equal(t.up(3).tap, true);
});

test("zoom limits are 6..62 (62 shows the whole island)", () => {
  assert.equal(ZOOM_MIN, 6);
  assert.equal(ZOOM_MAX, 62);
});

// --- fly-in ---------------------------------------------------------------------------------------
import { FLY_IN_SECS, easeInOutCubic, flyInPose, frozenFlyT, shouldFlyIn } from "./cameraRig";

test("fly-in starts high above the island and ends exactly on the rig pose", () => {
  const end = { pos: [3, 17, 25] as [number, number, number], look: [3, 1, 8.5] as [number, number, number] };
  const a = flyInPose(0, end);
  assert.ok(a.pos[1] > 40 && a.pos[1] > end.pos[1] + 25, "starts high");
  assert.deepEqual(flyInPose(1, end), end);
  assert.deepEqual(flyInPose(2, end), end, "clamps past the end");
  assert.deepEqual(flyInPose(-1, end), a, "clamps before the start");
});

test("fly-in height only ever goes down, and the path actually curves", () => {
  const end = { pos: [0, 17, 24] as [number, number, number], look: [0, 1, 8] as [number, number, number] };
  let prev = Infinity;
  let maxOff = 0;
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const p = flyInPose(t, end);
    assert.ok(p.pos[1] <= prev + 1e-9, `height rose at t=${t}`);
    prev = p.pos[1];
    // distance of the x coordinate from the straight start-end line
    const straight = flyInPose(t, end).pos[0];
    const lin = a0x() + (end.pos[0] - a0x()) * easeInOutCubic(t);
    maxOff = Math.max(maxOff, Math.abs(straight - lin));
  }
  assert.ok(maxOff > 2, "path is a straight line");
  assert.ok(FLY_IN_SECS > 2 && FLY_IN_SECS < 4.5);
  function a0x() {
    return flyInPose(0, end).pos[0];
  }
});

test("fly-in plays on a first visit only, never under reduced motion or in test runs", () => {
  const base = { reducedMotion: false, search: "", seen: false };
  assert.equal(shouldFlyIn(base), true);
  assert.equal(shouldFlyIn({ ...base, seen: true }), false);
  assert.equal(shouldFlyIn({ ...base, reducedMotion: true }), false);
  assert.equal(shouldFlyIn({ ...base, search: "?debug" }), false);
  assert.equal(shouldFlyIn({ ...base, search: "?robot=1" }), false);
  assert.equal(shouldFlyIn({ ...base, search: "?journey=1" }), false);
  assert.equal(shouldFlyIn({ ...base, seen: true, search: "?flyin=1" }), true, "?flyin=1 forces it");
  assert.equal(shouldFlyIn({ ...base, reducedMotion: true, search: "?flyin=1" }), false, "but never under reduced motion");
  assert.equal(frozenFlyT("?flyin=1&flyT=0.5"), 0.5);
  assert.equal(frozenFlyT("?flyin=1"), null);
  assert.equal(frozenFlyT("?flyT=9"), 1);
});

import { EAGLE_DIST_MAX, EAGLE_DIST_MIN, EAGLE_PITCH_MAX, EAGLE_PITCH_MIN, eagleOrbitBy, eaglePose, flyBetween, wrapEagleYaw } from "./cameraRig";
import { useWorld } from "../../store/world";

test("eagle pose clamps pitch and distance, and looks at the island centre", () => {
  const far = eaglePose(0, 0, 1000);
  const near = eaglePose(0, 10, 1);
  const d = (p: { pos: number[]; look: number[] }) => Math.hypot(p.pos[0] - p.look[0], p.pos[1] - p.look[1], p.pos[2] - p.look[2]);
  assert.ok(Math.abs(d(far) - EAGLE_DIST_MAX) < 1e-6);
  assert.ok(Math.abs(d(near) - EAGLE_DIST_MIN) < 1e-6);
  assert.ok(Math.abs((far.pos[1] - far.look[1]) / d(far) - Math.sin(EAGLE_PITCH_MIN)) < 1e-6);
  assert.ok(Math.abs((near.pos[1] - near.look[1]) / d(near) - Math.sin(EAGLE_PITCH_MAX)) < 1e-6);
});

test("eagle orbit: yaw is free, pitch clamped; yaw wraps", () => {
  const o = eagleOrbitBy(0, 1, -5000, 5000);
  assert.ok(o.yaw > Math.PI * 2, "full turns allowed");
  assert.equal(o.pitch, EAGLE_PITCH_MAX);
  const w = wrapEagleYaw(o.yaw);
  assert.ok(w > -Math.PI - 1e-9 && w <= Math.PI + 1e-9);
});

test("flyBetween ends exactly on both poses (up and back down)", () => {
  const a = { pos: [1, 2, 3] as [number, number, number], look: [0, 0, 0] as [number, number, number] };
  const b = eaglePose(1, 1, 60);
  assert.deepEqual(flyBetween(0, a, b), a);
  assert.deepEqual(flyBetween(1, a, b), b);
  assert.deepEqual(flyBetween(1, b, a), a);
});

test("eagle toggle, and cinema exits eagle", () => {
  const w = useWorld;
  w.setState({ cameraMode: "follow", cinema: null });
  w.getState().toggleEagle();
  assert.equal(w.getState().cameraMode, "eagle");
  w.getState().toggleEagle();
  assert.equal(w.getState().cameraMode, "follow");
  w.getState().toggleEagle();
  w.getState().openCinema("x");
  assert.equal(w.getState().cameraMode, "cinema");
  w.getState().toggleEagle();
  assert.equal(w.getState().cameraMode, "cinema", "no eagle during cinema");
  w.setState({ cameraMode: "follow", cinema: null });
});
