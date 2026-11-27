// Every roof of the town must sit inside the wall, and nothing of the island may stick out beyond its rim.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { HOUSES, ISLAND_RADIUS, PAGODA, PALACE, PATIS, SHRINES, TEA_STALL, WALL } from "../zones";
import { buildHouse, buildPagoda, buildPalace, buildPati } from "./kit";
import { T, type Parts } from "./geom";
import { FLOAT_ROCKS, RIM_R, TIP_Y, TOP_Y, buildIslandGeometry, islandRadius } from "./islandGeo";

/** Largest horizontal distance from the town centre of any vertex of a built piece. */
function maxRadius(p: Parts, m: THREE.Matrix4) {
  let best = 0;
  const v = new THREE.Vector3();
  for (const map of [p.buckets, p.noCast]) {
    for (const list of map.values()) {
      for (const g of list) {
        const pos = g.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m);
          best = Math.max(best, Math.hypot(v.x, v.z));
        }
      }
    }
  }
  return best;
}

test("every building, roof and eave is inside the town wall (with 0.3 m to spare)", () => {
  const limit = WALL.inner - 0.3;
  HOUSES.forEach((h, i) => assert.ok(maxRadius(buildHouse(h).parts, T(h.x, 0, h.z, h.rot)) <= limit, `house ${i} pokes out`));
  assert.ok(maxRadius(buildPalace({ w: PALACE.w, d: PALACE.d }).parts, T(PALACE.x, 0, PALACE.z)) <= limit, "palace pokes out");
  assert.ok(maxRadius(buildPagoda({ tiers: 5, steps: 5, base: PAGODA.base, guardians: true }).parts, T(PAGODA.x, 0, PAGODA.z)) <= limit);
  for (const s of SHRINES) assert.ok(maxRadius(buildPagoda({ tiers: s.tiers, steps: s.steps, base: s.base, guardians: false }).parts, T(s.x, 0, s.z)) <= limit, "shrine pokes out");
  for (const p of PATIS) assert.ok(maxRadius(buildPati({ w: p.w, d: p.d }).parts, T(p.x, 0, p.z, p.rot)) <= limit, "pati pokes out");
  assert.ok(maxRadius(buildPati({ w: TEA_STALL.w, d: TEA_STALL.d, tea: true }).parts, T(TEA_STALL.x, 0, TEA_STALL.z, TEA_STALL.rot)) <= limit, "tea stall pokes out");
});

test("the walkable island ends well inside the wall (nobody can walk off or into it)", () => {
  assert.ok(ISLAND_RADIUS + 0.45 <= WALL.inner - 0.3);
});

test("nothing renders outside the wall except the island's own rim, and the rock top sits just under the disc", () => {
  const g = buildIslandGeometry();
  const pos = g.attributes.position;
  let maxR = 0;
  let topY = -Infinity;
  const topRing = new Set<number>();
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    maxR = Math.max(maxR, r);
    // the grass annulus (flat, at the lip) is the only thing at the top
    if (Math.abs(pos.getY(i) - TOP_Y) < 1e-6 && r > WALL.inner) topRing.add(i);
    if (pos.getY(i) > topY && r < RIM_R - 0.05) topY = Math.max(topY, pos.getY(i));
  }
  assert.ok(RIM_R - WALL.outer >= 0.5 && RIM_R - WALL.outer <= 1.5, "lip should stick out a metre or so");
  // the grass tufts on the lip are the tallest bits: nothing climbs higher than a metre above the lip
  assert.ok(topY < TOP_Y + 1.3, `something rises ${topY} above the lip`);
  assert.ok(maxR <= RIM_R + 0.8, `rock mass reaches ${maxR} (rim ${RIM_R})`);
  assert.ok(topRing.size > 0, "no grass annulus");
  // the top is under the town disc (y = 0) but not so far under that a gap shows beside the wall plinth
  assert.ok(TOP_Y < 0 && TOP_Y > -0.2);
  // the flank directly under the wall plinth (r up to wall outer + 0.1) is solid at every depth the plinth reaches
  for (let k = 0; k < 360; k += 3) {
    const th = (k / 180) * Math.PI;
    for (const y of [-0.2, -0.6, -1.1]) assert.ok(islandRadius(th, y) > WALL.outer + 0.1, `gap under the wall at ${k} deg, y ${y}`);
  }
});

test("the island hangs below the town and floating rocks stay clear of it", () => {
  assert.ok(islandRadius(0, TIP_Y + 0.5) < 3);
  for (const [x, y, z, s] of FLOAT_ROCKS) {
    const th = Math.atan2(x, z);
    const r = Math.hypot(x, z);
    assert.ok(r - s > islandRadius(th, Math.min(y, TOP_Y)) + 1, "floating rock touches the island");
  }
});
