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
