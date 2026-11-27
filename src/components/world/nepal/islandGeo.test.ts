// The island's rock mass is deterministic, in budget and clear of the town; the falls sit on the rim, clear of the gates.
import assert from "node:assert/strict";
import { test } from "node:test";
import type * as THREE from "three";
import { GATE_ANGLES, WALL } from "../zones";
import { FALL, RIM_R, TIP_Y, TOP_Y, buildFallGeometry, buildFloatRockGeometry, buildIslandGeometry, fallAnchors, fallPath, geometryHash, islandRadius, strata } from "./islandGeo";

const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;

test("the rock mass is deterministic: the same seed gives the same mesh", () => {
  assert.equal(geometryHash(buildIslandGeometry()), geometryHash(buildIslandGeometry()));
  assert.equal(geometryHash(buildFallGeometry()), geometryHash(buildFallGeometry()));
  assert.equal(islandRadius(1.3, -17.2), islandRadius(1.3, -17.2));
});

test("the rock mass stays inside its triangle budget, with finite smooth normals and colours", () => {
  const g = buildIslandGeometry();
  const n = tris(g);
  assert.ok(n >= 6000 && n <= 12000, `rock mass has ${n} tris`);
  for (const name of ["position", "normal", "color"]) {
    const a = g.attributes[name];
    for (let i = 0; i < a.array.length; i++) assert.ok(Number.isFinite(a.array[i]), `${name}[${i}] is not finite`);
  }
  assert.ok(tris(buildFloatRockGeometry()) < 400);
});

test("the underside is irregular: ledges, overhangs and a radius that never leaves the lip or goes negative", () => {
  let steps = 0;
  let minR = Infinity;
  let prev = islandRadius(0.4, -3);
  for (let y = -3.2; y > TIP_Y; y -= 0.2) {
    const r = islandRadius(0.4, y);
    minR = Math.min(minR, r);
    if (r - prev > 0.05) steps++; // a ledge: the wall steps back out going down
    assert.ok(r <= RIM_R + 0.4 + 1e-9);
    prev = r;
  }
  assert.ok(minR >= 0);
  assert.ok(steps >= 2, `only ${steps} ledges on this meridian`);
  const s = strata(1, -9);
  assert.ok(s.f >= 0 && s.f < 1);
});

test("every waterfall anchor sits on the rim and clear of the wall gates", () => {
  const anchors = fallAnchors();
  assert.ok(anchors.length >= 3);
  for (const a of anchors) {
    assert.ok(Math.abs(Math.hypot(a.x, a.z) - RIM_R) < 1e-9, "anchor is off the rim");
    assert.ok(Math.abs(Math.hypot(a.nx, a.nz) - 1) < 1e-9);
    for (const g of GATE_ANGLES) {
      const d = Math.abs(Math.atan2(Math.sin(a.th - g), Math.cos(a.th - g)));
      // the whole width of the water (at its widest) plus the gate must not overlap, measured at the rim
      const need = (WALL.gateHalf + (a.width * (1 + FALL.spread)) / 2) / RIM_R;
      assert.ok(d > need, `fall at ${a.th} touches the gate at ${g}`);
    }
  }
});

test("the falls reach far below the island and the cloud sea; lite drops the spray and mist cards", () => {
  assert.ok(fallPath(1).y < TIP_Y - 5, "falls should end below the tip");
  assert.ok(fallPath(0).y > fallPath(FALL.pool).y - 0.01, "rapids sit on the lip");
  const full = buildFallGeometry(false);
  const lite = buildFallGeometry(true);
  assert.ok(tris(full) < 2500, `falls have ${tris(full)} tris`);
  assert.ok(tris(lite) < tris(full));
  const cards = (g: ReturnType<typeof buildFallGeometry>) => [...g.attributes.aKind.array].filter((k) => k > 0.5).length / 4;
  assert.equal(cards(lite), 0);
  assert.ok(cards(full) <= 12 + 0.01 && cards(full) >= 9);
  // water never pokes above the lip
  const p = full.attributes.position;
  for (let i = 0; i < p.count; i++) if (full.attributes.aKind.getX(i) < 0.5) assert.ok(p.getY(i) <= TOP_Y + 0.06);
});
