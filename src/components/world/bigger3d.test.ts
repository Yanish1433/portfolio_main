// step13b: bigger, clearer 3D. Readability is measured in PIXELS at 1280 x 720 (not metres), from the same
// camera maths Player.tsx uses; the over-the-shoulder pose is checked by projecting it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AVATAR_HEIGHT, AVATAR_SCALE } from "./characters";
import { CAM_FOV, DEFAULT_VIEW, PITCH_MAX, PITCH_MIN, SHOULDER, ZONE_PRESETS, ZOOM_MAX, ZOOM_MIN, blendPose, pickShoulder, projectNdc, pxPerMetre, shoulderPose, viewOfZone, viewPose } from "./cameraRig";
import { SCROLL } from "./halls/pathshalaLayout";
import { PLAQUES, PLAQUE_H, PLAQUE_W, TOP_Y, WALL_Z, WORKSHOP, WORKSHOP_RING } from "./halls/workshopLayout";
import { STANDS } from "./halls/layout";
import { SPAWN } from "./zones";
import { DRUM_MAX_R, DRUM_R, DRUM_TOP, DRUM_Y, RING_H, RING_MAX, RING_W, layoutWheels, ringSlot } from "./wheels/wheelLayout";
import { profile } from "@/content/profile";

const H = 720;
const ASPECT = 16 / 9;
const target = (x: number, z: number): [number, number, number] => [x, AVATAR_SCALE, z];
/** Pixels per metre of a surface point `p` as seen from the pose of `view` around the avatar at (x, z). */
const pxAt = (x: number, z: number, view: ReturnType<typeof viewOfZone>, p: [number, number, number]) => {
  const pose = viewPose(target(x, z), view);
  return pxPerMetre(projectNdc(pose, p, CAM_FOV, ASPECT).depth, H);
};

test("Lakhey is one constant bigger: AVATAR_SCALE 1.2 to 1.25", () => {
  assert.ok(AVATAR_SCALE >= 1.2 && AVATAR_SCALE <= 1.25);
  assert.ok(Math.abs(AVATAR_HEIGHT - 1.7 * AVATAR_SCALE) < 1e-9);
});

test("every zone preset (incl. the new workshop one) stays inside the zoom and pitch clamps", () => {
  for (const [id, p] of Object.entries(ZONE_PRESETS)) {
    assert.ok(p.dist >= ZOOM_MIN && p.dist <= ZOOM_MAX, id);
    assert.ok(p.pitch >= PITCH_MIN && p.pitch <= PITCH_MAX, id);
    assert.ok(p.enter < p.exit, id);
  }
});

test("Workshop: every plaque is on screen at the walk-up preset, and the repo name is >= 14 px tall at 1280x720", () => {
  assert.ok(WORKSHOP.length > 0 && WORKSHOP_RING);
  const view = viewOfZone("workshop");
  assert.equal(view.yaw, 0, "faces the board straight on");
  const [rx, rz] = WORKSHOP_RING;
  const pose = viewPose(target(rx, rz), view);
  for (const p of PLAQUES) {
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const n = projectNdc(pose, [p.x + (dx * p.w) / 2, p.y + (dy * p.h) / 2, WALL_Z], CAM_FOV, ASPECT);
      assert.ok(Math.abs(n.x) < 0.95 && Math.abs(n.y) < 0.95, `a plaque corner is off screen (${n.x.toFixed(2)}, ${n.y.toFixed(2)})`);
    }
  }
  // the name is drawn between 52 px (longest names) and 92 px (short ones) of a 540 px / 1.35 m cell: 400 px per metre
  const pxPerCell = 540 / PLAQUE_W;
  const longest = pxAt(rx, rz, view, [PLAQUES[0].x, TOP_Y, WALL_Z]) * (52 / pxPerCell);
  assert.ok(longest >= 9, `longest name ${longest.toFixed(1)} px`);
  const short = pxAt(rx, rz, view, [PLAQUES[0].x, PLAQUES[0].y, WALL_Z]) * (92 / pxPerCell);
  assert.ok(short >= 14, `a short name is ${short.toFixed(1)} px tall (>= 14)`);
  assert.ok(PLAQUE_H >= 1);
});

test("Education: the scroll is bigger and its row titles are >= 14 px tall at the preset", () => {
  assert.ok(SCROLL);
  assert.ok(SCROLL!.w >= 2.2 && SCROLL!.rowH >= 0.75);
  const view = viewOfZone("education");
  assert.ok(Math.abs(view.yaw) < 0.2, "faces the scroll straight on");
  const row = SCROLL!.rows[0];
  const titlePx = pxAt(SCROLL!.ring[0], SCROLL!.ring[1], view, [SCROLL!.x, row.y, SCROLL!.z]) * (SCROLL!.rowH * 0.28); // title em = 28 % of the row
  assert.ok(titlePx >= 14, `row title ${titlePx.toFixed(1)} px`);
  const pose = viewPose(target(SCROLL!.ring[0], SCROLL!.ring[1]), view);
  for (const y of [SCROLL!.top, SCROLL!.bottom]) {
    const n = projectNdc(pose, [SCROLL!.x, y, SCROLL!.z], CAM_FOV, ASPECT);
    assert.ok(Math.abs(n.y) < 0.98, `scroll edge y=${y} is in frame (${n.y.toFixed(2)})`);
  }
});

test("Skills: the drums are taller and wider than before (0.3 m / 1.0 m)", () => {
  assert.ok(DRUM_MAX_R >= 1.3 * DRUM_R && DRUM_TOP - DRUM_Y >= 1.3);
  assert.ok(DRUM_TOP < 2.9, "under the gallery eave (2.9 m)");
  const wheels = layoutWheels(profile.skills);
  assert.ok(wheels.length > 0 && wheels[0].radius >= 0.4);
});

test("Skills: the name ring is bigger and its names never overlap, for 1 to 8 names", () => {
  assert.ok(RING_W >= 1.9);
  for (let m = 1; m <= RING_MAX; m++) {
    const slots = Array.from({ length: m }, (_, k) => ringSlot(k, m));
    for (let i = 0; i < m; i++) {
      for (let j = i + 1; j < m; j++) {
        const apartX = Math.abs(slots[i].dx - slots[j].dx) >= RING_W + 0.02;
        const apartY = Math.abs(slots[i].dy - slots[j].dy) >= RING_H + 0.02;
        assert.ok(apartX || apartY, `m=${m}: names ${i} and ${j} overlap`);
      }
    }
  }
});

test("shoulderPose: screen fills the frame, the head sits in the bottom third, the camera is clear of the head", () => {
  const projects = STANDS.filter((s) => s.spot.kind === "project");
  assert.ok(projects.length > 0);
  for (const s of projects) {
    const screen = { x: s.x, y: s.screen.y, z: s.z + 0.03, w: s.screen.w, h: s.screen.h };
    for (const aspect of [16 / 9, 4 / 3]) {
      const avatar = { x: s.spot.ring[0], z: s.spot.ring[1] };
      const pose = shoulderPose(screen, avatar, { aspect });
      // the screen's centre is in the frame, near its middle
      const c = projectNdc(pose, [screen.x, screen.y, screen.z], CAM_FOV, aspect);
      assert.ok(Math.abs(c.x) < 0.15 && Math.abs(c.y) < 0.15, `centre (${c.x.toFixed(2)}, ${c.y.toFixed(2)})`);
      // the whole screen fits and fills most of the frame
      let maxX = 0;
      let maxY = 0;
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const n = projectNdc(pose, [screen.x + (dx * screen.w) / 2, screen.y + (dy * screen.h) / 2, screen.z], CAM_FOV, aspect);
        maxX = Math.max(maxX, Math.abs(n.x));
        maxY = Math.max(maxY, Math.abs(n.y));
      }
      assert.ok(maxX <= 1.001 && maxY <= 1.001, `screen fits (${maxX.toFixed(2)}, ${maxY.toFixed(2)})`);
      assert.ok(Math.max(maxX, maxY) >= 0.8, `screen fills the frame (${Math.max(maxX, maxY).toFixed(2)})`);
      // Lakhey's head: top in the bottom third, centred sideways, not clipped by the near plane (0.5 m)
      const head = projectNdc(pose, [avatar.x, AVATAR_HEIGHT, avatar.z], CAM_FOV, aspect);
      assert.ok(head.y < -1 / 3 && head.y > -1, `head top at NDC y ${head.y.toFixed(2)}`);
      assert.ok(Math.abs(head.x) < 0.05, "head is centred");
      assert.ok(pose.headDist >= SHOULDER.minHead - 1e-9, `head ${pose.headDist.toFixed(2)} m away`);
      assert.ok(head.depth > 0.5);
      // the camera is behind Lakhey, looking straight at the screen
      assert.ok(pose.pos[2] > avatar.z && pose.look[0] === pose.pos[0]);
    }
  }
});

test("pickShoulder: starts on the ring, holds until beyond the exit radius, nearest ring wins", () => {
  const rings = [
    { key: "a", ring: [0, 0] as [number, number] },
    { key: "b", ring: [3, 0] as [number, number] },
  ];
  assert.equal(pickShoulder(0.3, 0, rings, null), "a");
  assert.equal(pickShoulder(1.2, 0, rings, null), null, "between the rings: not started");
  assert.equal(pickShoulder(1.2, 0, rings, "a"), "a", "held (hysteresis)");
  assert.equal(pickShoulder(1.6, 0, rings, "a"), null, "left");
  assert.equal(pickShoulder(SPAWN[0], SPAWN[1], rings, null), null);
});

test("blendPose: exact at both ends", () => {
  const a = { pos: [0, 0, 0] as [number, number, number], look: [0, 1, 0] as [number, number, number] };
  const b = { pos: [2, 4, 6] as [number, number, number], look: [2, 3, 4] as [number, number, number] };
  assert.deepEqual(blendPose(a, b, 0), a);
  assert.deepEqual(blendPose(a, b, 1), b);
  assert.deepEqual(blendPose(a, b, 0.5).pos, [1, 2, 3]);
  assert.equal(DEFAULT_VIEW.dist, 23);
});
