import { test } from "node:test";
import assert from "node:assert/strict";
import { profile } from "../../../content/profile";
import { GENERIC, logoFor } from "./skillLogos";

const all = profile.skills.flatMap((g) => g.skills.map((s) => s.name));

test("every listed skill resolves to a brand logo or a generic icon", () => {
  for (const name of all) {
    const l = logoFor(name);
    if (l.kind === "brand") {
      assert.ok(l.logo.path.length > 20, name);
      assert.match(l.logo.hex, /^[0-9A-F]{6}$/);
    } else assert.ok(GENERIC[l.icon], name);
  }
});

test("the generic icon is used only where Simple Icons has no mark", () => {
  assert.deepEqual(
    all.filter((n) => logoFor(n).kind === "generic"),
    ["REST APIs", "WebSockets", "React Three Fiber"],
  );
});

test("lookup ignores case and unknown skills fall back", () => {
  assert.equal(logoFor("NODE.JS").kind, "brand");
  assert.deepEqual(logoFor("Something New"), { kind: "generic", icon: "code" });
});
