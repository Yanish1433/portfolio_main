import test from "node:test";
import assert from "node:assert/strict";
import {
  DANCE_BLEND_SECS,
  DANCE_SECS,
  SPIN_SECS,
  danceCamAllowed,
  danceCamPose,
  dancePush,
  danceShotPose,
  newDanceCamState,
  reduceCamMode,
  spinYaw,
  stepDanceCam,
  type CamModeState,
  type Pose,
} from "./cameraRig";

const IMPACTS = [10.2, 10.8, 11.4];
const follow: Pose = { pos: [0, 11, 18], look: [0, 1, 8.5] };
const av = { x: 0, z: 8.5, heading: 0 };
const near = (a: readonly number[], b: readonly number[], eps = 1e-9) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < eps, `${a} vs ${b}`));

test("dance cam: eases in over ~0.8 s and out again, exact at both ends", () => {
  const d = newDanceCamState();
  const run = (active: boolean, secs: number) => {
    for (let t = 0; t < secs; t += 0.01) stepDanceCam(d, { active, allowed: true, manualTick: 0, reduced: false }, 0.01);
  };
  run(true, DANCE_BLEND_SECS / 2);
  assert.ok(d.w > 0.4 && d.w < 0.6);
  run(true, DANCE_BLEND_SECS);
  assert.equal(d.w, 1);
  run(false, DANCE_BLEND_SECS + 0.1);
  assert.equal(d.w, 0);
});

test("dance cam: a manual orbit / zoom during the dance latches it off until the next dance", () => {
  const d = newDanceCamState();
  const step = (o: { active: boolean; manualTick?: number }, n = 1) => {
    for (let i = 0; i < n; i++) stepDanceCam(d, { allowed: true, reduced: false, manualTick: 0, ...o }, 0.1);
  };
  step({ active: true }, 12);
  assert.equal(d.w, 1);
  step({ active: true, manualTick: 1 }, 1);
  assert.ok(d.latched);
  step({ active: true, manualTick: 1 }, 12);
  assert.equal(d.w, 0);
  step({ active: false, manualTick: 1 }, 2); // the dance ends
  step({ active: true, manualTick: 1 }, 12); // a fresh dance re-arms
  assert.equal(d.w, 1);
  // manual input while NOT dancing never latches
  const e = newDanceCamState();
  stepDanceCam(e, { active: false, allowed: true, reduced: false, manualTick: 5 }, 0.1);
  assert.ok(!e.latched);
});

test("dance cam: off in eagle / 360 / cinema (drops at once); reduced motion = no ease", () => {
  const d = newDanceCamState();
  for (let i = 0; i < 12; i++) stepDanceCam(d, { active: true, allowed: true, manualTick: 0, reduced: false }, 0.1);
  assert.equal(d.w, 1);
  stepDanceCam(d, { active: true, allowed: false, manualTick: 0, reduced: false }, 0.016);
  assert.equal(d.w, 0);
  assert.ok(danceCamAllowed("follow", false));
  for (const m of ["eagle", "cinema", "returning"]) assert.ok(!danceCamAllowed(m, false), m);
  assert.ok(!danceCamAllowed("follow", true));
  const r = newDanceCamState();
  stepDanceCam(r, { active: true, allowed: true, manualTick: 0, reduced: true }, 0.016);
  assert.equal(r.w, 1);
});

test("pose continuity: weight 0 is exactly the follow pose, weight 1 exactly the shot, no jumps while blending", () => {
  assert.deepEqual(danceCamPose(3, 0, follow, av, IMPACTS), follow);
  const shot = danceShotPose(3, av, IMPACTS);
  const full = danceCamPose(3, 1, follow, av, IMPACTS);
  near(full.pos, shot.pos);
  near(full.look, shot.look);
  let prev = danceCamPose(3, 0, follow, av, IMPACTS);
  for (let w = 0.01; w <= 1.0001; w += 0.01) {
    const p = danceCamPose(3, w, follow, av, IMPACTS);
    const step = Math.hypot(p.pos[0] - prev.pos[0], p.pos[1] - prev.pos[1], p.pos[2] - prev.pos[2]);
    assert.ok(step < 0.6, `blend step ${step} at w=${w}`);
    prev = p;
  }
});

test("dance shot: close and low, orbits ~50 deg, pushes in on the 3 impacts, static when reduced", () => {
  const a = danceShotPose(0, av, IMPACTS);
  const b = danceShotPose(DANCE_SECS, av, IMPACTS);
  const dist = (p: Pose) => Math.hypot(p.pos[0] - av.x, p.pos[2] - av.z);
  assert.ok(dist(a) < 8 && a.pos[1] < 1.6, "close and low");
  const ang = (p: Pose) => Math.atan2(p.pos[0] - av.x, p.pos[2] - av.z);
  const sweep = Math.abs(ang(b) - ang(a)) * (180 / Math.PI);
  assert.ok(sweep >= 40 && sweep <= 60, `sweep ${sweep}`);
  assert.equal(dancePush(5, IMPACTS), 0);
  for (const it of IMPACTS) assert.ok(dancePush(it + 0.1, IMPACTS) > 0.2, `push at ${it}`);
  assert.ok(dancePush(13, IMPACTS) < 0.05);
  near(danceShotPose(0, av, IMPACTS, true).pos, danceShotPose(11, av, IMPACTS, true).pos);
});

test("360 spin: one full turn in SPIN_SECS, continuous across the wrap, none under reduced motion", () => {
  let y = 0;
  const n = SPIN_SECS * 60;
  let maxStep = 0;
  for (let i = 0; i < n; i++) {
    const ny = spinYaw(y, 1 / 60, false);
    let d = Math.abs(ny - y);
    if (d > Math.PI) d = Math.PI * 2 - d; // the wrap
    maxStep = Math.max(maxStep, d);
    y = ny;
  }
  assert.ok(Math.abs(Math.sin(y)) < 1e-6 && Math.cos(y) > 0.999, `back at the start, yaw ${y}`);
  assert.ok(maxStep < 0.003);
  assert.equal(spinYaw(1, 5, true), 1);
});

test("mode machine: follow <-> eagle <-> 360, cinema wins, G never changes the mode, no stuck state", () => {
  const f: CamModeState = { mode: "follow", spin: false, cinema: false };
  const spun = reduceCamMode(f, "spin");
  assert.deepEqual(spun, { mode: "eagle", spin: true, cinema: false });
  assert.deepEqual(reduceCamMode(spun, "spin"), f); // O again leaves
  assert.deepEqual(reduceCamMode(spun, "exit-spin"), f); // Esc / walking
  assert.deepEqual(reduceCamMode(spun, "eagle"), f); // V also leaves
  const eagle = reduceCamMode(f, "eagle");
  assert.deepEqual(eagle, { mode: "eagle", spin: false, cinema: false });
  assert.deepEqual(reduceCamMode(eagle, "spin"), { mode: "eagle", spin: true, cinema: false }); // eagle -> 360 stays up
  assert.deepEqual(reduceCamMode(eagle, "exit-spin"), eagle); // Esc in plain eagle: nothing
  for (const s of [f, eagle, spun]) assert.deepEqual(reduceCamMode(s, "dance"), s); // G is ignored by the modes
  for (const mode of ["cinema", "returning"] as const) {
    const s: CamModeState = { mode, spin: false, cinema: mode === "cinema" };
    for (const a of ["eagle", "spin", "exit-spin"] as const) assert.deepEqual(reduceCamMode(s, a), s);
  }
  assert.equal(reduceCamMode({ mode: "follow", spin: false, cinema: true }, "spin").mode, "follow");
  let s = f;
  for (const a of ["spin", "eagle", "spin", "exit-spin", "spin", "spin", "eagle"] as const) s = reduceCamMode(s, a);
  assert.equal(s.spin, false);
  assert.equal(reduceCamMode(reduceCamMode(s, "spin"), "exit-spin").mode, "follow");
});
