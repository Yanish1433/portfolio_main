// step10b layout: the Ghar sits at the centre right in front of SPAWN (and never triggers on load);
// nothing tall hides the prayer wheels from the default camera (south, 45 deg).
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_VIEW, ZONE_PRESETS } from "./cameraRig";
import { DRUM_Y } from "./wheels/wheelLayout";
import { GALLERY, GHAR, HOUSES, HULAK, PAGODA, PATIS, SHRINES, SPAWN, STATIC_OBSTACLES, TIMELINE_PATH, TREES, zoneById, zones } from "./zones";

test("the Ghar is at the centre, front (+z) to the start, and SPAWN is outside its ring and camera preset", () => {
  assert.equal(GHAR.x, 0);
  assert.ok(GHAR.rot === 0 && GHAR.z > PAGODA.z + PAGODA.base / 2 && GHAR.z < SPAWN[1], "between the pagoda and the spawn");
  const about = zoneById("about")!;
  const d = Math.hypot(SPAWN[0] - about.ring[0], SPAWN[1] - about.ring[1]);
  assert.ok(d > about.ringRadius + 2, `spawn ${d.toFixed(1)} m from the Ghar ring`);
  assert.ok(d > ZONE_PRESETS.about.enter, "spawn must not frame the about preset");
  for (const id of ["skills-lab", "timeline", "education", "mailbox", "project-hall"]) {
    const z = zoneById(id)!;
    assert.ok(Math.hypot(SPAWN[0] - z.ring[0], SPAWN[1] - z.ring[1]) > Math.max(z.ringRadius + 2, ZONE_PRESETS[id]?.enter ?? 0), `spawn crowds ${id}`);
  }
});

type Box = { x0: number; x1: number; z0: number; z1: number; h: number; name: string };
const boxes = (): Box[] => {
  const b: Box[] = [];
  const add = (name: string, x: number, z: number, w: number, d: number, h: number, rot = 0) => {
    const q = Math.abs(Math.sin(rot)) > 0.5;
    const hw = (q ? d : w) / 2;
    const hd = (q ? w : d) / 2;
    b.push({ name, x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd, h });
  };
  for (const h of HOUSES) add(`house ${h.x},${h.z}`, h.x, h.z, h.w, h.d, h.floors * 2.6 + 2, h.rot);
  for (const p of PATIS) add(`pati ${p.x}`, p.x, p.z, p.w, p.d, 3, p.rot);
  for (const s of SHRINES) add(`shrine ${s.x}`, s.x, s.z, s.base, s.base, s.tiers * 2 + 1);
  add("pagoda", PAGODA.x, PAGODA.z, PAGODA.base, PAGODA.base, 14);
  for (const [x, z] of TREES) add(`tree ${x},${z}`, x, z, 1.5, 1.5, 6);
  return b;
};

/** Does the segment a->b (3D) pass through the box? (slab method) */
function hit(a: [number, number, number], b: [number, number, number], bx: Box): boolean {
  const lo = [bx.x0, 0, bx.z0];
  const hi = [bx.x1, bx.h, bx.z1];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 3; i++) {
    const d = b[i] - a[i];
    if (Math.abs(d) < 1e-9) {
      if (a[i] < lo[i] || a[i] > hi[i]) return false;
    } else {
      let ta = (lo[i] - a[i]) / d;
      let tb = (hi[i] - a[i]) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
  }
  return true;
}

test("nothing tall stands between the default camera and the prayer wheels", () => {
  const off = DEFAULT_VIEW.dist; // camera sits 'dist' away, south, 45 deg
  const dy = Math.sin(DEFAULT_VIEW.pitch) * off;
  const dz = Math.cos(DEFAULT_VIEW.pitch) * off;
  const all = boxes();
  const ring = zoneById("skills-lab")!.ring;
  const players: [number, number][] = [SPAWN, [ring[0], ring[1]], [GALLERY.x, GALLERY.z + 2.4], [GALLERY.x + 3, GALLERY.z + 2.4], [GALLERY.x - 3, GALLERY.z + 2.4], [8, 6], [GALLERY.x, GALLERY.z + 6]];
  const wheelXs = [GALLERY.x - GALLERY.maxSpan / 2, GALLERY.x, GALLERY.x + GALLERY.maxSpan / 2];
  for (const [px, pz] of players) {
    const cam: [number, number, number] = [px, 1 + dy, pz + dz];
    for (const wx of wheelXs) {
      const target: [number, number, number] = [wx, DRUM_Y, GALLERY.z + 0.2];
      for (const bx of all) {
        // the gallery's own frame is not an occluder
        if (bx.x0 < GALLERY.x + 4 && bx.x1 > GALLERY.x - 4 && Math.abs((bx.z0 + bx.z1) / 2 - GALLERY.z) < 1) continue;
        assert.ok(!hit(cam, target, bx), `${bx.name} hides wheel x=${wx.toFixed(1)} from a camera over ${px},${pz}`);
      }
    }
  }
});

test("step27: Contact is clear of the pottery corner and every other ring, off all obstacles, (reachability: journey.test.ts)", () => {
  const mail = zoneById("mailbox")!;
  const POTTERY_RING = { x: zoneById("pottery")!.ring[0], z: zoneById("pottery")!.ring[1] };
  assert.ok(Math.hypot(mail.ring[0] - POTTERY_RING.x, mail.ring[1] - POTTERY_RING.z) >= 7, "mailbox ring >= 7 m from the pottery ring");
  assert.ok(Math.hypot(HULAK.x - POTTERY_RING.x, HULAK.z - POTTERY_RING.z) >= 7, "box >= 7 m from the pottery ring");
  for (const z of zones) {
    if (z.id === "mailbox") continue;
    assert.ok(Math.hypot(mail.ring[0] - z.ring[0], mail.ring[1] - z.ring[1]) >= 4, `mailbox ring too close to ${z.id}`);
  }
  for (const o of STATIC_OBSTACLES) {
    if (o.kind === "rect") assert.ok(Math.abs(HULAK.x - o.x) > o.w / 2 + 0.5 || Math.abs(HULAK.z - o.z) > o.d / 2 + 0.5, "box inside an obstacle");
    else assert.ok(Math.hypot(HULAK.x - o.x, HULAK.z - o.z) > o.r + 0.5, "box inside an obstacle");
  }
  for (const [x, z] of TIMELINE_PATH) assert.ok(Math.hypot(HULAK.x - x, HULAK.z - z) >= 1.5, "box on the lane");
});
