// The Hire-me lantern must not block anything: occupancy, rings, spawn, paths and the wheel sightline.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_VIEW } from "../cameraRig";
import { HALL_OBSTACLES } from "../halls/layout";
import { DRUM_Y } from "../wheels/wheelLayout";
import { GALLERY, GHAR, ISLAND_RADIUS, SPAWN, STATIC_OBSTACLES, TIMELINE_PATH, zones } from "../zones";
import { HIRE_LANTERN as L, lanternBody } from "./lanternSpec";

// nav.ts (blockedAt) uses TS parameter properties that node's strip-only mode can't load, so the same overlap rule is repeated here.
const solids = [...zones.flatMap((z) => z.obstacles), ...STATIC_OBSTACLES, ...HALL_OBSTACLES];
const blockedAt = (x: number, z: number, pad: number) =>
  Math.hypot(x, z) > ISLAND_RADIUS - 0.9 ||
  solids.some((o) => (o.kind === "circle" ? Math.hypot(x - o.x, z - o.z) < o.r + pad : Math.abs(x - o.x) < o.w / 2 + pad && Math.abs(z - o.z) < o.d / 2 + pad));

test("the lantern post stands on free ground, clear of every ring, the spawn and the timeline lane", () => {
  assert.ok(!blockedAt(L.x, L.z, 0.9), "inside or hard against an obstacle");
  assert.ok(Math.hypot(L.x - SPAWN[0], L.z - SPAWN[1]) > 3, "too near the spawn");
  for (const z of zones) assert.ok(Math.hypot(L.x - z.ring[0], L.z - z.ring[1]) > z.ringRadius + 1.5, `crowds the ${z.id} ring`);
  for (const [x, z] of TIMELINE_PATH) assert.ok(Math.hypot(L.x - x, L.z - z) > 2, "on the timeline lane");
  assert.ok(Math.abs(L.x - GHAR.x) > GHAR.w / 2 + 1, "beside the Ghar, not against it");
});

test("the lantern is not between the default camera and the prayer wheels", () => {
  const dy = Math.sin(DEFAULT_VIEW.pitch) * DEFAULT_VIEW.dist;
  const dz = Math.cos(DEFAULT_VIEW.pitch) * DEFAULT_VIEW.dist;
  const b = lanternBody();
  for (const [px, pz] of [SPAWN, [GALLERY.x, GALLERY.z + 2.4], [8, 6]] as [number, number][]) {
    const cam = [px, 1 + dy, pz + dz];
    for (const wx of [GALLERY.x - 3, GALLERY.x, GALLERY.x + 3]) {
      const tgt = [wx, DRUM_Y, GALLERY.z + 0.2];
      // closest approach (in x/y at the lantern's z) of the sight line to the lantern body
      const t = (b.z - cam[2]) / (tgt[2] - cam[2]);
      if (t < 0 || t > 1) continue;
      const x = cam[0] + (tgt[0] - cam[0]) * t;
      const y = cam[1] + (tgt[1] - cam[1]) * t;
      const clear = Math.abs(x - b.x) > 0.6 + 0.2 || Math.abs(y - b.y) > L.bodyH / 2 + 0.2;
      assert.ok(clear, `lantern hides wheel x=${wx} from a camera over ${px},${pz}`);
    }
  }
});
