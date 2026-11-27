import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hotkeyAllowed, outsideClickCloses, routeLine, walkedAway } from "./guideRules";

describe("guide rules", () => {
  it("lines become tips while closed and no tour", () => {
    assert.equal(routeLine({ guideOpen: false, tourActive: false }), "tip");
    assert.equal(routeLine({ guideOpen: true, tourActive: false }), "show");
    assert.equal(routeLine({ guideOpen: false, tourActive: true }), "show");
  });
  it("closes when leaving the zone or walking > 6 m", () => {
    const a = { x: 0, z: 0, zone: "hall" };
    assert.equal(walkedAway(a, { x: 3, z: 3, zone: "hall" }), false);
    assert.equal(walkedAway(a, { x: 6.5, z: 0, zone: "hall" }), true);
    assert.equal(walkedAway(a, { x: 0, z: 0, zone: "plaza" }), true);
    assert.equal(walkedAway(null, { x: 99, z: 0, zone: "x" }), false);
  });
  it("outside click ignores the guide and the chat input", () => {
    assert.equal(outsideClickCloses(true, false, false), true);
    assert.equal(outsideClickCloses(true, true, false), false);
    assert.equal(outsideClickCloses(true, false, true), false);
    assert.equal(outsideClickCloses(false, false, false), false);
  });
  it("H is ignored when typing, in panels, cinema, eagle view", () => {
    const ok = { typing: false, panelOpen: false, cinema: false, eagle: false, modifier: false };
    assert.equal(hotkeyAllowed(ok), true);
    for (const k of ["typing", "panelOpen", "cinema", "eagle", "modifier"] as const) assert.equal(hotkeyAllowed({ ...ok, [k]: true }), false);
  });
});
