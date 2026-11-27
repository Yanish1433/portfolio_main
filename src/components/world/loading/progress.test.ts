import assert from "node:assert/strict";
import { test } from "node:test";
import { barValue, HOLD, tipAt, TIPS } from "./progress";

test("the bar follows loaded/total as whole percent", () => {
  assert.equal(barValue(0, 0, 0, false), 0);
  assert.equal(barValue(1, 4, 0, false), 25);
  assert.equal(barValue(3, 4, 0, false), 75);
});

test("the bar never goes backwards when the total grows", () => {
  const a = barValue(3, 4, 0, false);
  const b = barValue(3, 9, a, false);
  assert.equal(b, a);
});

test("it holds at 95 % until ready, then jumps to 100", () => {
  assert.equal(barValue(10, 10, 0, false), HOLD * 100);
  assert.equal(barValue(10, 10, 95, true), 100);
});

test("bad input is clamped", () => {
  assert.equal(barValue(-2, 5, 0, false), 0);
  assert.equal(barValue(9, 5, 0, false), 95);
});

test("tips wrap around", () => {
  assert.equal(tipAt(0), TIPS[0]);
  assert.equal(tipAt(TIPS.length), TIPS[0]);
  assert.equal(tipAt(-1), TIPS[TIPS.length - 1]);
});
