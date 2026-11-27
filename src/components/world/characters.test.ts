import { test } from "node:test";
import assert from "node:assert/strict";
import { CHARACTERS, GAIT_CLIPS, characterById, clipTimeScale, gaitCycleRate } from "./characters";

test("Lakhey is the only character; stale ids resolve to nothing", () => {
  assert.equal(CHARACTERS.length, 1);
  assert.equal(characterById("lakhey")?.file, "/models/lakhey.glb");
  assert.equal(characterById("clay"), undefined);
  assert.equal(characterById("astro"), undefined);
});

test("clipTimeScale makes the clip's feet travel at the avatar's speed", () => {
  const scale = 0.9;
  const { run } = GAIT_CLIPS;
  const ts = clipTimeScale(4.5, run.speed, scale);
  assert.ok(Math.abs(ts * run.speed * scale - 4.5) < 1e-9);
  assert.equal(clipTimeScale(0, run.speed, scale), 0);
  assert.equal(clipTimeScale(3, 0, scale), 0);
});

test("gaitCycleRate matches the pure clips at the ends of the blend and is monotonic", () => {
  const scale = 0.9;
  for (const key of ["walk", "run"] as const) {
    const c = GAIT_CLIPS[key];
    const rate = gaitCycleRate(2, scale, key === "walk" ? 0 : 1);
    // cycles/s * clip duration = playback rate
    assert.ok(Math.abs(rate * c.duration - clipTimeScale(2, c.speed, scale)) < 1e-9);
  }
  assert.ok(gaitCycleRate(3, scale, 0.5) > 0);
  assert.ok(gaitCycleRate(4, scale, 1) > gaitCycleRate(2, scale, 1));
  assert.equal(gaitCycleRate(0, scale, 0.5), 0);
});
