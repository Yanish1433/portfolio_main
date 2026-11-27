import { test } from "node:test";
import assert from "node:assert/strict";
import { containFit } from "./gharFit";

test("containFit: whole image always inside the frame, aspect kept, centred", () => {
  for (const [img, frame] of [[0.75, 0.9], [1.5, 0.9], [0.9, 0.9], [0.5, 2], [3, 0.4]]) {
    const f = containFit(img, frame);
    assert.ok(f.w <= 1 + 1e-9 && f.h <= 1 + 1e-9 && (f.w > 0.999 || f.h > 0.999));
    assert.ok(Math.abs((f.w * frame) / f.h - img) < 1e-9, `aspect ${img} in ${frame}`);
  }
  assert.deepEqual(containFit(0.9, 0.9), { w: 1, h: 1 });
  assert.deepEqual(containFit(0, 1), { w: 1, h: 1 });
});
