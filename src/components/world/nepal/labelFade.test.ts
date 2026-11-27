import { test } from "node:test";
import assert from "node:assert/strict";
import { LABEL_GONE, LABEL_NEAR, labelNearK, labelOpacity } from "./labelFade";

test("labels fade out inside ~6 m of the camera and are gone by 4.5 m", () => {
  assert.equal(LABEL_NEAR, 6);
  assert.equal(labelNearK(30), 1);
  assert.equal(labelNearK(LABEL_NEAR), 1);
  assert.ok(labelNearK(5.2) > 0 && labelNearK(5.2) < 1);
  assert.equal(labelNearK(LABEL_GONE), 0);
  assert.equal(labelNearK(1), 0);
  assert.ok(labelNearK(5.5) > labelNearK(5));
});

test("far label clear of the avatar is fully visible", () => {
  assert.equal(labelOpacity(0.6, 22, 23), 1);
});

test("a label over the avatar fades; in front of the avatar it nearly vanishes, behind it leaves a ghost", () => {
  const front = labelOpacity(0, 18, 23);
  const behind = labelOpacity(0, 28, 23);
  assert.ok(front < 0.05);
  assert.ok(behind >= 0.15 && behind < 0.2);
});

test("a close label is hidden; the speech bubble still dims a far one", () => {
  assert.equal(labelOpacity(0.6, 3, 10), 0);
  assert.equal(labelOpacity(0.6, 22, 23, 0.25), 0.25);
});
