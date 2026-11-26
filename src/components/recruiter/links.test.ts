import test from "node:test";
import assert from "node:assert/strict";
import { isPlaceholder, isRealEmail, isRealLink } from "./links";

test("placeholder text is detected", () => {
  assert.equal(isPlaceholder("Placeholder City, Country"), true);
  assert.equal(isPlaceholder(""), true);
  assert.equal(isPlaceholder(undefined), true);
  assert.equal(isPlaceholder("Kathmandu, Nepal"), false);
});

test("only real links pass", () => {
  assert.equal(isRealLink("#"), false);
  assert.equal(isRealLink(""), false);
  assert.equal(isRealLink(null), false);
  assert.equal(isRealLink("https://github.com/Yanish1433"), true);
  assert.equal(isRealLink("/resume.pdf"), true);
  assert.equal(isRealLink("#contact"), false);
});

test("email must look like an address", () => {
  assert.equal(isRealEmail("#"), false);
  assert.equal(isRealEmail("you@example.com"), true);
  assert.equal(isRealEmail("mailto:you@example.com"), true);
  assert.equal(isRealEmail("Placeholder@x.com"), false);
});
