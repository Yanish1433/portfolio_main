import { test } from "node:test";
import assert from "node:assert/strict";
import { KEYS, deriveTheme, formatTime, parseTime, themeAt, timeToLook, wrapMinutes } from "./timeLook";

test("keyframes are strictly ordered, 0:00 to 24:00", () => {
  assert.equal(KEYS[0].at, 0);
  assert.equal(KEYS[KEYS.length - 1].at, 1440);
  for (let i = 1; i < KEYS.length; i++) assert.ok(KEYS[i].at > KEYS[i - 1].at);
});

test("continuous across midnight", () => {
  const a = timeToLook(1439);
  const b = timeToLook(1440);
  const c = timeToLook(0);
  assert.deepEqual(b, c);
  assert.ok(Math.abs(a.t - c.t) < 1e-6);
  assert.ok(Math.abs(a.fog[0] - c.fog[0]) < 1e-6);
});

test("night is dark, midday is bright, dusk lamps come on", () => {
  assert.equal(timeToLook(0).t, 1);
  assert.equal(timeToLook(12 * 60).t, 0);
  assert.ok(timeToLook(12 * 60).sunI > timeToLook(23 * 60).sunI);
  assert.ok(timeToLook(19 * 60).t > timeToLook(18 * 60).t);
  assert.ok(timeToLook(6 * 60).t < timeToLook(5 * 60).t);
});

test("small steps never jump", () => {
  let prev = timeToLook(0);
  for (let m = 1; m <= 1440; m++) {
    const l = timeToLook(m);
    assert.ok(Math.abs(l.t - prev.t) < 0.05, `t jump at ${m}`);
    assert.ok(Math.abs(l.sunI - prev.sunI) < 0.1, `sunI jump at ${m}`);
    prev = l;
  }
});

test("sun is up at noon, down at midnight", () => {
  assert.ok(timeToLook(720).sunDir[1] > 0.8);
  assert.ok(timeToLook(0).sunDir[1] < 0);
});

test("theme thresholds and hysteresis", () => {
  assert.equal(themeAt(12 * 60), "day");
  assert.equal(themeAt(22 * 60), "night");
  assert.equal(themeAt(18 * 60 + 45), "night");
  assert.equal(themeAt(6 * 60 + 14), "night");
  assert.equal(themeAt(6 * 60 + 15), "day");
  // dead band: staying put inside it
  assert.equal(deriveTheme(18 * 60 + 50, "day"), "day");
  assert.equal(deriveTheme(18 * 60 + 50, "night"), "night");
  assert.equal(deriveTheme(19 * 60 + 5, "day"), "night");
  assert.equal(deriveTheme(6 * 60 + 20, "night"), "night");
  assert.equal(deriveTheme(6 * 60 + 25, "night"), "day");
  assert.equal(deriveTheme(6 * 60 + 10, "day"), "day");
  assert.equal(deriveTheme(5 * 60 + 50, "day"), "night");
});

test("parse / format", () => {
  assert.equal(parseTime("06:42"), 402);
  assert.equal(parseTime("24:00"), null);
  assert.equal(parseTime("x"), null);
  assert.equal(formatTime(402), "6:42 am");
  assert.equal(formatTime(0), "12:00 am");
  assert.equal(formatTime(13 * 60 + 5), "1:05 pm");
  assert.equal(wrapMinutes(-15), 1425);
});
