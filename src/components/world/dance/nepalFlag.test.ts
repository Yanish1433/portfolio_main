import { test } from "node:test";
import assert from "node:assert/strict";
import { FLAG_HEIGHT, flagBounds, flagEmblems, nepalFlagShape } from "./nepalFlag";

test("flag height / width is the constitutional 1.219", () => {
  const b = flagBounds();
  assert.ok(Math.abs(b.height / b.width - 1.219) < 0.001);
  assert.equal(b.minX, 0);
  assert.equal(b.minY, 0);
});

test("outline is two pennants: five vertices, notch inside the fly tip", () => {
  const p = nepalFlagShape();
  assert.equal(p.length, 5);
  const [A, B, E, F, C] = p;
  assert.deepEqual(A, [0, 0]);
  assert.deepEqual(B, [1, 0]);
  assert.equal(C[1], FLAG_HEIGHT);
  assert.ok(E[0] > 0 && E[0] < B[0]);
  assert.equal(E[1], F[1]); // horizontal notch edge
  assert.ok(F[0] > E[0] && F[0] < 1);
  assert.ok(F[1] > 0 && F[1] < C[1]);
});

test("moon sits in the upper pennant, sun in the lower, both inside the flag", () => {
  const { moon, sun } = flagEmblems();
  const notchY = nepalFlagShape()[2][1];
  assert.ok(moon.cy > notchY);
  assert.ok(sun.cy < notchY);
  for (const e of [moon, sun]) assert.ok(e.cx - e.r > 0 && e.cx + e.r < 1);
});
