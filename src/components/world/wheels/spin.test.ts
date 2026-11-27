import { test } from "node:test";
import assert from "node:assert/strict";
import { atRow, NAME_REPEATS, newWave, rowDistance, snapYaw, stepWave, WAVE_DUR, WAVE_PERIOD, WAVE_STEP, waveCycle, waveSpin } from "./spin";

const TAU = Math.PI * 2;

test("wave: nothing before a wheel's turn; each wheel starts 0.35 s after the previous", () => {
  assert.equal(waveSpin(0, 0), 0);
  assert.equal(waveSpin(0.5 * WAVE_STEP, 1), 0);
  assert.ok(waveSpin(0.3, 0) > 0);
  assert.equal(waveSpin(WAVE_STEP * 2, 2), 0);
  assert.ok(waveSpin(WAVE_STEP * 2 + 0.2, 2) > 0);
  // left to right: during the first wave, wheel i has turned at least as much as wheel i+1
  for (let t = 0; t < 4; t += 0.1) for (let i = 0; i < 4; i++) assert.ok(waveSpin(t, i) >= waveSpin(t, i + 1) - 1e-9);
});

test("wave: eases up and down, two whole turns clockwise, then holds still until the next wave", () => {
  const speedAt = (t: number) => waveSpin(t + 0.05, 0) - waveSpin(t, 0);
  assert.ok(speedAt(0.05) < speedAt(WAVE_DUR / 2 - 0.025)); // slower at the start than in the middle
  assert.ok(speedAt(WAVE_DUR - 0.1) < speedAt(WAVE_DUR / 2 - 0.025)); // and at the end
  assert.ok(Math.abs(waveSpin(WAVE_DUR, 0) - 2 * TAU) < 1e-9);
  assert.ok(Math.abs(waveSpin(WAVE_DUR + 1, 0) - 2 * TAU) < 1e-9);
  assert.ok(Math.abs(waveSpin(WAVE_PERIOD - 0.01, 0) - 2 * TAU) < 1e-9);
  assert.ok(waveSpin(WAVE_PERIOD + 0.3, 0) > 2 * TAU);
  assert.ok(Math.abs(waveSpin(WAVE_PERIOD + WAVE_DUR, 0) - 4 * TAU) < 1e-9);
  for (let t = 0; t < 14; t += 0.05) assert.ok(waveSpin(t + 0.05, 2) >= waveSpin(t, 2) - 1e-12); // never turns back
});

test("wave: a wheel stops with a name facing the camera (whole turns, so the snap is a no-op)", () => {
  for (let i = 0; i < 5; i++) {
    for (const t of [4.5, 5.9, 11, 17]) {
      const y = waveSpin(t, i);
      assert.ok(Math.abs(snapYaw(y) - y) < 1e-9, `wheel ${i} at ${t}`);
    }
  }
  assert.equal(snapYaw(0.1), 0);
  assert.ok(Math.abs(snapYaw(Math.PI * 0.9) - Math.PI) < 1e-9);
  assert.equal(NAME_REPEATS, 2);
});

test("wave: lastCycle lets a wheel finish its current turn and no more", () => {
  const c = waveCycle(1.5, 1);
  assert.equal(c, 0);
  assert.ok(waveSpin(1.5, 1, c) < 2 * TAU);
  assert.ok(Math.abs(waveSpin(31.5, 1, c) - 2 * TAU) < 1e-9);
  assert.equal(waveCycle(0, 2), -1);
  assert.equal(waveSpin(40, 2, -1), 0);
});

test("at the row: inside the skills zone or within 3 m of it", () => {
  const w = [
    { x: 10, z: 0 },
    { x: 12, z: 0 },
    { x: 14, z: 0 },
  ];
  assert.equal(rowDistance(w, 12, 2), 2);
  assert.equal(rowDistance(w, 17, 0), 3);
  assert.ok(atRow(w, 12, 2.9, null));
  assert.ok(!atRow(w, 12, 3.5, null));
  assert.ok(atRow(w, 12, 9, "skills-lab"));
  assert.ok(!atRow(w, 20, 0, "market"));
});

test("stepWave: starts after standing still ~0.5 s, and winds down on leaving", () => {
  const s = newWave();
  stepWave(s, 0.3, true, false, 3);
  assert.equal(s.active, false);
  stepWave(s, 0.3, true, true, 3); // still walking: resets
  assert.equal(s.still, 0);
  stepWave(s, 0.3, true, false, 3);
  stepWave(s, 0.3, true, false, 3);
  assert.equal(s.active, true);
  for (let k = 0; k < 20; k++) stepWave(s, 0.1, true, false, 3);
  assert.ok(s.t > 1.5);
  stepWave(s, 0.1, false, false, 3); // leaves mid-wave
  assert.equal(s.active, false);
  assert.equal(s.lastCycle.length, 3);
  for (let k = 0; k < 200; k++) stepWave(s, 0.1, false, false, 3);
  assert.equal(s.lastCycle.length, 0); // wound down
  assert.equal(s.t, 0);
});
