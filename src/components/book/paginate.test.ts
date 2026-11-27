import assert from "node:assert/strict";
import { test } from "node:test";
import { paginate, pageLabel } from "./paginate";

test("no text gives no pages", () => assert.deepEqual(paginate([]), []));
test("short text stays on one page", () => assert.deepEqual(paginate(["a", "b"]), [["a", "b"]]));
test("splits by paragraph without losing or reordering text", () => {
  const paras = ["x".repeat(150), "y".repeat(150), "z".repeat(150)];
  const pages = paginate(paras, 260);
  assert.equal(pages.length, 3);
  assert.deepEqual(pages.flat(), paras);
});
test("never splits inside a paragraph", () => assert.deepEqual(paginate(["x".repeat(900)], 100), [["x".repeat(900)]]));
test("labels pages", () => assert.equal(pageLabel(0, 3), "Page 1 of 3"));

import { inkPlan, nextIndex, pageView, viewStart } from "./paginate";

test("views", () => {
  assert.equal(viewStart(3, 2), 2);
  assert.deepEqual(pageView(2, 2, 3), [2]);
  assert.deepEqual(pageView(0, 1, 3), [0]);
});
test("turning stays inside the book", () => {
  assert.equal(nextIndex(0, 1, 2, 5), 2);
  assert.equal(nextIndex(4, 1, 2, 5), 4);
  assert.equal(nextIndex(0, -1, 2, 5), 0);
  assert.equal(nextIndex(3, -1, 1, 5), 2);
});
test("ink plan is sequential and short", () => {
  const plan = inkPlan([10, 30, 60], 1800);
  assert.equal(plan[0].delay, 0);
  assert.equal(plan[1].delay, plan[0].duration);
  assert.ok(plan[2].delay + plan[2].duration <= 1800 + 3);
  assert.deepEqual(inkPlan([]), []);
});
