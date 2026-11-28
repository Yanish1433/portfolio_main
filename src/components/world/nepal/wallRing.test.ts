// The wall ring: one generator, full 360 deg coverage minus the gate openings, same materials everywhere.
import assert from "node:assert/strict";
import { test } from "node:test";
import { GATE_ANGLES, WALL } from "../zones";
import { WALL_JOIN, WALL_MATS, WALL_MID, wallSegments } from "./wallRing";

const TAU = Math.PI * 2;
const norm = (a: number) => ((a % TAU) + TAU) % TAU;

test("segments cover 360 deg minus the gate openings: no gap over 1 cm, no overlap", () => {
  const segs = wallSegments();
  const sorted = [...segs].sort((a, b) => a.a0 - b.a0);
  let gapTotal = 0;
  sorted.forEach((s, i) => {
    assert.ok(s.a1 > s.a0);
    const next = sorted[(i + 1) % sorted.length];
    const nextStart = i + 1 < sorted.length ? next.a0 : next.a0 + TAU;
    const gap = (nextStart - s.a1) * WALL_MID; // metres along the centre line
    assert.ok(gap > -1e-9, `overlap at segment ${i}`);
    if (gap > 1e-6) {
      // the only gaps are the four gate openings, and each is centred on a gate
      const centre = norm((s.a1 + nextStart) / 2);
      assert.ok(GATE_ANGLES.some((g) => Math.abs(norm(g) - centre) < 1e-9 || Math.abs(norm(g) - centre) > TAU - 1e-9), `stray gap of ${gap} m`);
      assert.ok(gap <= 2 * WALL_JOIN * 1.02 + 0.2, "gate opening too wide");
      assert.ok(gap >= 2 * WALL.gateHalf, "gate opening narrower than the gateway");
      gapTotal++;
    } else assert.ok(gap < 0.01, `gap of ${gap} m`);
  });
  assert.equal(gapTotal, GATE_ANGLES.length);
});

test("every segment uses the same material set, and pilasters/lamps/flags sit at a regular spacing", () => {
  const segs = wallSegments();
  for (const s of segs) assert.deepEqual([...s.mats], [...WALL_MATS]);
  const q = segs.filter((s) => s.quarter === 0);
  assert.equal(segs.length, q.length * 4);
  for (let i = 0; i < segs.length; i++) {
    assert.equal(segs[i].pilaster, segs[i % q.length].pilaster);
    assert.equal(segs[i].lamp, segs[i % q.length].lamp);
  }
  assert.ok(segs.filter((s) => s.lamp).length >= 20 && segs.filter((s) => s.flags).length >= 20);
  for (const s of segs) assert.ok(s.h > 1 && s.h <= 2.6 + 1e-9);
});
