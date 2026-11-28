import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DWELL_MS, PLACE_IDS, allCollected, countStamps, modeBlocked, parseStamps, serialize, shouldStamp } from "./logic";

const follow = { cinema: null, cameraMode: "follow" };

describe("passport rules", () => {
  it("has the 8 places, not the plaza", () => {
    assert.equal(PLACE_IDS.length, 8);
    assert.ok(!(PLACE_IDS as readonly string[]).includes("plaza"));
  });
  it("needs the dwell time; passing through does not count", () => {
    assert.equal(shouldStamp("about", DWELL_MS - 1, false, {}), false);
    assert.equal(shouldStamp("about", DWELL_MS, false, {}), true);
    assert.equal(shouldStamp("plaza", 5000, false, {}), false);
    assert.equal(shouldStamp(null, 5000, false, {}), false);
  });
  it("ignores duplicates", () => {
    assert.equal(shouldStamp("about", 3000, false, { about: "2026-01-01T00:00:00Z" }), false);
  });
  it("blocks during cinema, eagle / 360 and a dance", () => {
    assert.equal(modeBlocked(follow, 100, 0), false);
    assert.equal(modeBlocked({ cinema: "p", cameraMode: "cinema" }, 100, 0), true);
    assert.equal(modeBlocked({ cinema: null, cameraMode: "eagle" }, 100, 0), true);
    assert.equal(modeBlocked(follow, 100, 3100), true);
    assert.equal(modeBlocked(follow, 3200, 3100), false);
    assert.equal(shouldStamp("about", 3000, true, {}), false);
  });
  it("saves and loads, and corrupt data gives an empty book", () => {
    const s = { about: "2026-05-01T10:00:00.000Z", pottery: "2026-05-02T10:00:00.000Z" };
    assert.deepEqual(parseStamps(serialize(s)), s);
    for (const bad of [null, "", "{nope", "[]", '{"v":2,"stamps":{}}', '{"v":1,"stamps":5}', '{"v":1,"stamps":[1]}']) assert.deepEqual(parseStamps(bad), {});
    assert.deepEqual(parseStamps('{"v":1,"stamps":{"plaza":"2026-01-01","about":"junk","kiosk":"2026-01-01"}}'), { kiosk: "2026-01-01" });
  });
  it("counts and detects all collected", () => {
    const all = Object.fromEntries(PLACE_IDS.map((id) => [id, "2026-01-01T00:00:00Z"]));
    assert.equal(countStamps({}), 0);
    assert.equal(countStamps({ about: "2026-01-01" }), 1);
    assert.equal(allCollected(all), true);
    assert.equal(allCollected({ ...all, about: "" }), false);
  });
});
