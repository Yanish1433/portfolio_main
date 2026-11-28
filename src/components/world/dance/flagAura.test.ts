import { test } from "node:test";
import assert from "node:assert/strict";
import { flagDesign, flagPolys } from "./nepalFlag";
import { IMPACT_TIMES } from "./impactTimes";
import { MOON_POLYS, auraTimeline, buildFlagMask, channelCoverage, polyArea } from "./flagAura";

const mask = buildFlagMask(256);

test("mask size follows the flag ratio", () => {
  const d = flagDesign();
  assert.ok(Math.abs(mask.height / mask.width - d.height) < 0.01);
  assert.equal(mask.data.length, mask.width * mask.height * 4);
});

test("channel proportions match flagDesign()", () => {
  const d = flagDesign();
  const p = flagPolys(d);
  const total = d.height; // flag is 1 wide
  const rel = (got: number, want: number, tol: number) =>
    assert.ok(Math.abs(got - want) / want < tol, `got ${got} want ${want}`);
  rel(channelCoverage(mask, 1), polyArea(p.inner) / total, 0.02);
  rel(channelCoverage(mask, 0), (polyArea(p.outer) - polyArea(p.inner)) / total, 0.04);
  const moon = p.white.slice(0, MOON_POLYS).reduce((s, w) => s + polyArea(w), 0);
  rel(channelCoverage(mask, 2), moon / total, 0.08);
});

test("border draw-on value grows away from the hoist; nothing is drawn outside the cloth", () => {
  const w = mask.width;
  const at = (x: number, y: number) => {
    const col = Math.floor(x * w);
    const row = Math.floor(y * w);
    const i = (row * w + col) * 4;
    return mask.data.slice(i, i + 4);
  };
  assert.deepEqual([...at(0.9, 1.15)].slice(0, 3), [0, 0, 0]); // far upper-right: outside
  // bottom edge border pixel: R set, trace small near the hoist, larger toward the tip
  const near = at(0.1, 0.01);
  const far = at(0.85, 0.01);
  assert.ok(near[0] > 200 && far[0] > 200);
  assert.ok(near[3] < far[3], `${near[3]} < ${far[3]}`);
});

test("timeline: draw -> fill -> ignite in order", () => {
  const T = 15;
  const a = auraTimeline(0.5, T, IMPACT_TIMES);
  const b = auraTimeline(1.2, T, IMPACT_TIMES);
  const c = auraTimeline(2.5, T, IMPACT_TIMES);
  assert.ok(a.draw > 0 && a.draw < 1 && a.fill === 0 && a.ignite === 0);
  assert.ok(b.draw === 1 && b.fill > 0 && b.ignite === 0);
  assert.ok(c.fill === 1 && c.ignite === 1);
  assert.equal(auraTimeline(0, T, IMPACT_TIMES).draw, 0);
});

test("timeline: flash peaks at each impact and decays", () => {
  const T = 15;
  assert.equal(auraTimeline(10.1, T, IMPACT_TIMES).flash, 0);
  for (const im of IMPACT_TIMES) {
    const hit = auraTimeline(im, T, IMPACT_TIMES);
    assert.equal(hit.flash, 1);
    assert.equal(hit.sinceImpact, 0);
    assert.ok(auraTimeline(im + 0.4, T, IMPACT_TIMES).flash < 0.3);
  }
  assert.ok(auraTimeline(10.5, T, IMPACT_TIMES).sinceImpact > 0.29);
});

test("timeline: dissolve ends at the duration", () => {
  const T = 15;
  assert.equal(auraTimeline(T - 3, T, IMPACT_TIMES).dissolve, 0);
  const mid = auraTimeline(T - 0.5, T, IMPACT_TIMES).dissolve;
  assert.ok(mid > 0 && mid < 1);
  assert.equal(auraTimeline(T, T, IMPACT_TIMES).dissolve, 1);
});
