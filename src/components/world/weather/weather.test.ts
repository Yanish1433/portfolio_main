import test from "node:test";
import assert from "node:assert/strict";
import { approach, BLEND, CYCLE_LEN, DRY, parseForce, targetWeather, weatherAt, weatherOff, type OffRules } from "./weather";

const on: OffRules = { reducedMotion: false, lite: false, cinema: false, debug: false, forced: null };

test("cycle: clear at start, mist mid, rain later, periodic", () => {
  assert.deepEqual(weatherAt(0), { mist: 0, rain: 0, wet: 0 });
  assert.equal(weatherAt(150 + 75).mist, 1);
  assert.equal(weatherAt(150 + 150 + 120 + 90).rain, 1);
  assert.deepEqual(weatherAt(40), weatherAt(40 + CYCLE_LEN));
});

test("blends are smooth and bounded", () => {
  const mid = weatherAt(150 + BLEND / 2).mist;
  assert.ok(mid > 0 && mid < 1);
  let prev = 0;
  for (let t = 0; t < CYCLE_LEN; t += 1) {
    const f = weatherAt(t);
    for (const v of [f.mist, f.rain, f.wet]) assert.ok(v >= 0 && v <= 1);
    assert.ok(Math.abs(f.mist - prev) < 0.1);
    prev = f.mist;
  }
});

test("ground stays wet after the rain ends, then dries", () => {
  const end = 150 + 150 + 120 + 180;
  assert.equal(weatherAt(end + 1).rain, 0);
  assert.ok(weatherAt(end + 1).wet > 0.9);
  assert.equal(weatherAt(end + DRY + 1).wet, 0);
});

test("?weather= forces a state", () => {
  assert.equal(parseForce("rain"), "rain");
  assert.equal(parseForce("x"), null);
  assert.deepEqual(targetWeather(0, { ...on, forced: "rain" }), { mist: 0, rain: 1, wet: 1 });
  assert.equal(targetWeather(0, { ...on, forced: "mist" }).mist, 1);
  assert.deepEqual(targetWeather(240, { ...on, forced: "clear" }), { mist: 0, rain: 0, wet: 0 });
});

test("off switches force everything clear", () => {
  for (const k of ["reducedMotion", "lite", "cinema"] as const) {
    const o = { ...on, [k]: true, forced: "rain" as const };
    assert.equal(weatherOff(o), true);
    assert.deepEqual(targetWeather(300, o), { mist: 0, rain: 0, wet: 0 });
  }
  assert.equal(weatherOff({ ...on, debug: true }), true);
  assert.equal(weatherOff({ ...on, debug: true, forced: "rain" }), false);
});

test("approach ramps, never overshoots", () => {
  assert.equal(approach(0, 1, 1, 0.25), 0.25);
  assert.equal(approach(0.9, 1, 1, 0.25), 1);
  assert.equal(approach(1, 0, 2, 0.25), 0.5);
});
