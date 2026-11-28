import { test } from "node:test";
import assert from "node:assert/strict";
import { CYCLE_MIN, flowMinutes, parseAnchor, rateFor, resolvePaused, resolveStart } from "./flow";
import { resolveMinutes } from "./clock";
import { timeToLook } from "@/components/world/nepal/timeLook";
import type { Look } from "@/components/world/nepal/timeLook";

const T0 = 1_700_000_000_000;
const MIN_MS = (CYCLE_MIN * 60000) / 1440; // real ms per game minute

test("one full day takes CYCLE_MIN real minutes; the clock wraps at 24 h", () => {
  assert.equal(CYCLE_MIN, 8);
  assert.ok(Math.abs(rateFor() * CYCLE_MIN * 60000 - 1440) < 1e-9);
  const a = { m: 100, at: T0 };
  assert.equal(flowMinutes(a, T0), 100);
  assert.ok(Math.abs(flowMinutes(a, T0 + 60 * MIN_MS) - 160) < 1e-6);
  assert.ok(Math.abs(flowMinutes(a, T0 + CYCLE_MIN * 60000) - 100) < 1e-6); // a whole day later
  assert.ok(Math.abs(flowMinutes({ m: 1430, at: T0 }, T0 + 30 * MIN_MS) - 20) < 1e-6); // wraps past midnight
  for (let k = 0; k < 5000; k += 37) {
    const v = flowMinutes(a, T0 + k * 997);
    assert.ok(v >= 0 && v < 1440);
  }
});

test("start time resolution is unchanged without an anchor", () => {
  const cases = [
    { time: "07:30", saved: "900", nowMin: 600 },
    { theme: "night", saved: "720", nowMin: 600 },
    { saved: "400", nowMin: 900 },
    { saved: "now", nowMin: 1130 },
    { legacy: "night", nowMin: 600 },
    { nowMin: 1125 },
  ];
  for (const c of cases) {
    const want = resolveMinutes({ time: c.time, theme: c.theme, saved: c.saved, legacy: c.legacy, now: c.nowMin });
    assert.equal(resolveStart({ ...c, nowMs: T0, paused: false }), want, JSON.stringify(c));
  }
});

test("an anchor continues the cycle; URL time beats it; paused freezes it", () => {
  const anchor = { m: 400, at: T0 };
  const later = T0 + 100 * MIN_MS;
  assert.ok(Math.abs(resolveStart({ nowMin: 0, anchor, nowMs: later, paused: false }) - 500) < 1e-6);
  assert.equal(resolveStart({ nowMin: 0, anchor, nowMs: later, paused: true }), 400);
  assert.equal(resolveStart({ time: "22:00", nowMin: 0, anchor, nowMs: later, paused: false }), 1320);
  assert.equal(resolveStart({ theme: "day", nowMin: 0, anchor, nowMs: later, paused: false }), 720);
});

test("pause/resume keeps the minute and a pick re-anchors", () => {
  // pause = anchor re-set to the current minute, frozen; resume = new anchor at the same minute
  const running = { m: 300, at: T0 };
  const pausedAt = flowMinutes(running, T0 + 50 * MIN_MS); // 350
  const resumed = { m: pausedAt, at: T0 + 10 * 60000 }; // user waits 10 real minutes paused
  assert.ok(Math.abs(flowMinutes(resumed, resumed.at) - 350) < 1e-6);
  assert.ok(Math.abs(flowMinutes(resumed, resumed.at + 10 * MIN_MS) - 360) < 1e-6);
  const picked = { m: 1080, at: T0 + 99_000 }; // a manual pick at 18:00
  assert.ok(Math.abs(flowMinutes(picked, picked.at + 30 * MIN_MS) - 1110) < 1e-6);
});

test("reduced motion pauses by default; a saved choice wins", () => {
  assert.equal(resolvePaused(null, true), true);
  assert.equal(resolvePaused(null, false), false);
  assert.equal(resolvePaused("0", true), false);
  assert.equal(resolvePaused("1", false), true);
  assert.equal(resolvePaused("junk", true), true);
});

test("parseAnchor rejects junk", () => {
  assert.deepEqual(parseAnchor('{"m":12,"at":5}'), { m: 12, at: 5 });
  for (const bad of [null, "", "x", "{}", '{"m":"a","at":1}', "null"]) assert.equal(parseAnchor(bad), null);
});

const flat = (l: Look): number[] => [l.t, l.sunI, l.hemiI, ...l.sun, ...l.hemiSky, ...l.hemiGround, ...l.fog, ...l.skyTop, ...l.skyMid, ...l.skyHorizon, ...l.cloud, ...l.sunDir, ...l.lightOff.map((v) => v / 24)]; // light offset is in world units (~24 wide): scale it to the 0..1 range of the rest

test("the look is continuous: no jump between adjacent minutes (incl. the midnight wrap and the tod boundaries)", () => {
  const EPS = 0.1; // the biggest honest step is a smoothstep through dusk (~0.03/min); the old midnight sun flip was > 1
  let worst = 0;
  let at = 0;
  for (let m = 0; m < 1440; m++) {
    const a = flat(timeToLook(m));
    const b = flat(timeToLook((m + 1) % 1440));
    for (let i = 0; i < a.length; i++) {
      const d = Math.abs(a[i] - b[i]);
      if (d > worst) {
        worst = d;
        at = m;
      }
    }
  }
  assert.ok(worst < EPS, `max step ${worst.toFixed(3)} at ${at}`);
  // and across the four tod boundaries specifically
  for (const edge of [330, 600, 990, 1155]) {
    const a = timeToLook(edge - 1);
    const b = timeToLook(edge + 1);
    assert.ok(Math.abs(a.t - b.t) < 0.1);
    assert.ok(Math.abs(a.sunI - b.sunI) < 0.3);
  }
});
