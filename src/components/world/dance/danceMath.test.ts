import { test } from "node:test";
import assert from "node:assert/strict";
import { HAND_BONE_RE, POP_IN_SECS, easeOutBack, popScale, stepPop, waveAmp } from "./danceMath";

test("pop overshoots then settles at 1", () => {
  assert.ok(Math.abs(easeOutBack(0)) < 1e-9);
  assert.ok(Math.abs(easeOutBack(1) - 1) < 1e-9);
  let max = 0;
  for (let i = 0; i <= 100; i++) max = Math.max(max, easeOutBack(i / 100));
  assert.ok(max > 1.05 && max < 1.2);
});

test("pop timer takes ~0.35 s in and clamps", () => {
  let p = 0;
  for (let i = 0; i < 100; i++) p = stepPop(p, true, POP_IN_SECS / 10);
  assert.equal(p, 1);
  assert.equal(popScale(1, true), 1);
  assert.equal(popScale(0, false), 0);
});

test("wave strengthens with hand speed", () => {
  assert.ok(waveAmp(3) > waveAmp(0));
  assert.equal(waveAmp(30), waveAmp(3));
});

test("hand bone pattern matches the wrist, not the fingers", () => {
  assert.ok(HAND_BONE_RE.test("mixamorigRightHand"));
  assert.ok(HAND_BONE_RE.test("hand_r"));
  assert.ok(!HAND_BONE_RE.test("mixamorigRightHandIndex1"));
  assert.ok(!HAND_BONE_RE.test("mixamorigLeftHand"));
});
