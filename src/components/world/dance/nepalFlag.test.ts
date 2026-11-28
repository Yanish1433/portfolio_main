import { test } from "node:test";
import assert from "node:assert/strict";
import { flagBounds, flagDesign, flagPolys, nepalFlagShape } from "./nepalFlag";

const near = (a: number, b: number, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("outer height / width is the constitutional 1.2190", () => {
  const b = flagBounds();
  assert.ok(Math.abs(b.height / b.width - 1.219) < 0.002, String(b.height / b.width));
  near(b.minX, 0);
  near(b.minY, 0);
});

test("inner tips share x; the outer upper tip reaches further than the lower", () => {
  const d = flagDesign();
  const [, iB, , iG] = d.inner;
  near(iB[0], iG[0]);
  const [, oB, , oG] = d.outer;
  assert.ok(oG[0] > oB[0]);
});

test("lower pennant is taller than the upper (0.707 vs 0.626 of AB)", () => {
  const [A, , E, , C] = flagDesign().inner;
  const lower = E[1] - A[1];
  const upper = C[1] - E[1];
  assert.ok(lower > upper);
  near(lower / upper, 0.7071 / 0.6262, 1e-3);
});

test("border is the same width on every edge (incl. both notch edges)", () => {
  const d = flagDesign();
  const n = d.inner.length;
  for (let i = 0; i < n; i++) {
    const a = d.outer[i];
    const b = d.outer[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // distance of both inner vertices of this edge from the outer edge line
    for (const q of [d.inner[i], d.inner[(i + 1) % n]]) {
      const dist = Math.abs((b[0] - a[0]) * (a[1] - q[1]) - (a[0] - q[0]) * (b[1] - a[1])) / l;
      near(dist, d.border, 1e-9);
    }
  }
});

test("emblems follow the construction; ray counts 8 and 12; both in their pennants", () => {
  const d = flagDesign();
  assert.equal(d.moon.half.rays, 8);
  assert.equal(d.sun.rays, 12);
  const notchY = d.inner[2][1];
  assert.ok(d.moon.half.cy > notchY, "moon in the upper pennant");
  assert.ok(d.sun.cy + d.sun.r < notchY, "sun in the lower pennant");
  // Construction ratios (AB = inner width): sun radii LN : MN, moon half radii TS : TM.
  assert.ok(d.sun.r > d.sun.rIn);
  assert.ok(d.moon.half.r > d.moon.half.rIn);
  near(d.sun.rIn / d.sun.r, 0.1357 / 0.214, 2e-3);
  near(d.moon.half.r / d.sun.r, 0.1287 / 0.214, 2e-3);
  // Everything sits inside the crimson field.
  for (const e of [d.sun, d.moon.half]) assert.ok(e.cx - e.r > d.border);
});

test("flagPolys gives blue, crimson and white shapes (lune + 8 + disc + 12 rays + half disc)", () => {
  const p = flagPolys();
  assert.equal(p.outer.length, 5);
  assert.equal(p.white.length, 1 + 1 + 8 + 1 + 12);
  assert.equal(nepalFlagShape(), p.outer);
});
