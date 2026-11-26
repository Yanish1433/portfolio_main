import { test } from "node:test";
import assert from "node:assert/strict";
import { FLAG_W, MIN_GAP, packWing, wingCentres } from "./spots";

const WING: [number, number] = [-9.2, -3.1];
const gaps = (r: { x: number; w: number }[]) => r.slice(1).map((s, i) => s.x - s.w / 2 - (r[i].x + r[i].w / 2));

test("packWing without a flagship is the old even spread", () => {
  for (let n = 1; n <= 4; n++) {
    const { xs, spacing } = wingCentres(n, WING);
    const r = packWing(n, WING);
    assert.deepEqual(r.map((s) => s.x), xs);
    for (const s of r) assert.equal(s.w, Math.min(1.6, spacing - MIN_GAP));
  }
});

test("packWing with a flagship: wider screen, gaps >= MIN_GAP, centred, inside the wing", () => {
  for (let n = 1; n <= 4; n++) {
    const flagAt = Math.floor(n / 2);
    const plain = packWing(n, WING);
    const r = packWing(n, WING, flagAt);
    assert.equal(r.length, n);
    for (const g of gaps(r)) assert.ok(g >= MIN_GAP - 1e-9, `n=${n} gap ${g}`);
    const left = r[0].x - r[0].w / 2;
    const right = r[n - 1].x + r[n - 1].w / 2;
    const room = WING[1] - WING[0] + plain[0].w;
    assert.ok(right - left <= room + 1e-9, `n=${n} fits`);
    assert.ok(Math.abs((left + right) / 2 - (WING[0] + WING[1]) / 2) < 1e-9, `n=${n} centred`);
    const flag = r[flagAt].w - 0.22;
    for (let i = 0; i < n; i++) {
      if (i === flagAt) continue;
      assert.ok(Math.abs(flag / (r[i].w - 0.22) - FLAG_W) < 0.02, `n=${n} flag ratio`);
      assert.ok(r[i].w > 1.3, `n=${n} others stay readable (${r[i].w})`);
    }
    // order left to right, no overlap
    for (let i = 1; i < n; i++) assert.ok(r[i].x > r[i - 1].x);
  }
});

test("a lone flagship gets the full bigger stand", () => {
  const [s] = packWing(1, WING, 0);
  assert.ok(s.w > 2.0 && s.w <= 2.2, String(s.w));
});
