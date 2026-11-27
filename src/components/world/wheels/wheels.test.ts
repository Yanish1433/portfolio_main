import { test } from "node:test";
import assert from "node:assert/strict";
import { profile } from "@/content/profile";
import { GALLERY, zones } from "../zones";
import { FILTERS, frameWidth, GOOD_AT, layoutWheels, nearestWheel, pitchFor, plainGroup, plainGroupName, projectsForGroup, resizeGroups, ringSkills, STRONG_AT, strengthWord, wheelSummary } from "./wheelLayout";
import { NO_PROJECT_LINE, robotGroupLine, WHEEL_HINT } from "./wheelCopy";
import { arcPoints, THREAD_SECONDS, threadAlpha, threadBuffers, type V3 } from "./threads";

test("strength words use the fixed thresholds", () => {
  assert.equal(STRONG_AT, 75);
  assert.equal(GOOD_AT, 50);
  assert.equal(strengthWord(100), "Strong");
  assert.equal(strengthWord(75), "Strong");
  assert.equal(strengthWord(74), "Good");
  assert.equal(strengthWord(50), "Good");
  assert.equal(strengthWord(49), "Learning");
  assert.equal(strengthWord(0), "Learning");
});

test("plain group names", () => {
  assert.equal(plainGroupName("frontend", "Frontend"), "Websites & apps (frontend)");
  assert.equal(plainGroupName("backend", "Backend"), "Servers & logic (backend)");
  assert.equal(plainGroupName("database", "Database"), "Saving data (database)");
  assert.equal(plainGroupName("devops", "DevOps"), "Launching & running (devops)");
  assert.equal(plainGroupName("3d/ai", "3D & AI"), "3D & smart tools (3D & AI)");
  assert.deepEqual(plainGroup("mystery", "Other"), { plain: "Other", tech: "" });
  assert.equal(plainGroupName("mystery", "Other"), "Other");
});

test("card summary line: plain plurals", () => {
  assert.equal(wheelSummary(5, 3), "5 skills · used in 3 projects");
  assert.equal(wheelSummary(1, 1), "1 skill · used in 1 project");
  assert.equal(wheelSummary(4, 0), "4 skills · used in learning projects");
});

test("filters: All plus the five groups", () => {
  assert.deepEqual(FILTERS.map((f) => f.label), ["All", "Frontend", "Backend", "Database", "DevOps", "3D & AI"]);
});

test("real profile: one wheel per group, in order, with the group's skills and its own colour", () => {
  const wheels = layoutWheels(profile.skills);
  assert.equal(wheels.length, profile.skills.length);
  wheels.forEach((w, i) => {
    assert.equal(w.category, profile.skills[i].category);
    assert.equal(w.skills.length, profile.skills[i].skills.length);
  });
  assert.equal(new Set(wheels.map((w) => w.colour)).size, wheels.length);
});

test("1 to 8 groups: one row along x, evenly spaced, centred, never overlapping, inside the lane's footprint", () => {
  const obstacle = zones.find((z) => z.id === "skills-lab")!.obstacles.find((o) => o.kind === "rect" && o.x === GALLERY.x && o.z === GALLERY.z);
  assert.ok(obstacle && obstacle.kind === "rect");
  for (let n = 1; n <= 8; n++) {
    const groups = resizeGroups(profile.skills, n);
    assert.equal(groups.length, n, `n=${n}`);
    const wheels = layoutWheels(groups);
    assert.equal(wheels.length, n);
    const pitch = pitchFor(n);
    assert.ok(pitch <= GALLERY.maxPitch + 1e-9);
    assert.ok(n * pitch <= GALLERY.maxSpan + 1e-9, `n=${n} span`);
    assert.ok(wheels.every((w) => w.z === GALLERY.z), "one row");
    for (let i = 1; i < n; i++) assert.ok(Math.abs(wheels[i].x - wheels[i - 1].x - pitch) < 1e-9, `n=${n} spacing`);
    assert.ok(Math.abs((wheels[0].x + wheels[n - 1].x) / 2 - GALLERY.x) < 1e-9, "centred");
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const gap = Math.hypot(wheels[i].x - wheels[j].x, wheels[i].z - wheels[j].z) - wheels[i].radius - wheels[j].radius;
        assert.ok(gap > 0.08, `n=${n}: wheels ${i} and ${j} overlap (gap ${gap.toFixed(3)})`);
      }
    }
    // the collision box (zones.ts) covers the frame, and the frame stays west of the pati beside it
    assert.ok(frameWidth(n) <= (obstacle as { w: number }).w + 0.2, `n=${n} frame width ${frameWidth(n)}`);
    assert.ok(GALLERY.x + frameWidth(n) / 2 < 17.2, `n=${n} frame reaches the pati`);
  }
});

test("every wheel is within 2 m of the lane in front of the gallery", () => {
  const wheels = layoutWheels(resizeGroups(profile.skills, 8));
  // the avatar stands in front of the collision box (half depth) padded by its radius
  const laneZ = GALLERY.z + (GALLERY.d + 0.2) / 2 + 0.57;
  for (const w of wheels) assert.ok(laneZ - w.z <= 2, `wheel ${w.index} is ${(laneZ - w.z).toFixed(2)} m from the lane`);
});

test("groups with no skills get no wheel; at most eight wheels", () => {
  const groups = [...profile.skills, { category: "frontend" as const, label: "Empty", skills: [] }];
  assert.equal(layoutWheels(groups).length, profile.skills.length);
  const many = Array.from({ length: 12 }, (_, i) => ({ category: "frontend" as const, label: `G${i}`, skills: [{ name: "X", level: 60 }] }));
  assert.equal(layoutWheels(many).length, 8);
});

test("resizeGroups: null keeps the profile; extra copies keep the matching names", () => {
  assert.equal(resizeGroups(profile.skills, null), profile.skills);
  const big = resizeGroups(profile.skills, 8);
  const copy = big[profile.skills.length];
  assert.ok(copy.label.endsWith("2"));
  assert.ok(copy.skills.every((s) => "display" in s && s.display !== s.name && s.display!.startsWith(s.name)));
});

test("nearestWheel: within range or -1", () => {
  const wheels = [
    { x: 0, z: 0 },
    { x: 2, z: 0 },
  ];
  assert.equal(nearestWheel(wheels, 1.8, 0.3, 2), 1);
  assert.equal(nearestWheel(wheels, 1, 5, 2), -1);
});

test("projectsForGroup: the de-duplicated union of the skills' projects, first-seen order", () => {
  const p = (id: string) => ({ id, name: id.toUpperCase() });
  const byName: Record<string, { id: string; name: string }[]> = { React: [p("a"), p("b")], CSS: [p("b"), p("c")], Docker: [] };
  const got = projectsForGroup([{ name: "React" }, { name: "CSS" }, { name: "Docker" }, { name: "Unknown" }], (n) => byName[n] ?? []);
  assert.deepEqual(got.map((x) => x.id), ["a", "b", "c"]);
  assert.deepEqual(projectsForGroup([], () => [p("z")]), []);
});

test("ring names: the strongest eight, strongest first", () => {
  const skills = Array.from({ length: 11 }, (_, i) => ({ name: `S${i}`, level: i * 9 }));
  const ring = ringSkills(skills);
  assert.equal(ring.length, 8);
  assert.equal(ring[0].name, "S10");
  assert.ok(ring.every((s, i) => i === 0 || ring[i - 1].level >= s.level));
  assert.equal(ringSkills(skills.slice(0, 3)).length, 3);
});

test("robot line: group level, names up to two projects, counts more, no chip for none", () => {
  const p = (id: string, name: string) => ({ id, name });
  assert.deepEqual(robotGroupLine("Websites & apps", [p("a", "Barber On Demand"), p("b", "Goldstar 3D")]), {
    text: "Websites & apps skills were used in Barber On Demand and Goldstar 3D. Want to see?",
    projectId: "a",
    chip: "Take me to Barber On Demand",
  });
  assert.equal(robotGroupLine("Saving data", [p("a", "BookEasy")]).text, "Saving data skills were used in BookEasy. Want to see?");
  const three = robotGroupLine("Websites & apps", [p("a", "A"), p("b", "B"), p("c", "C")]);
  assert.equal(three.text, "Websites & apps skills were used in 3 projects. Want to see?");
  assert.equal(three.projectId, "a");
  const none = robotGroupLine("3D & smart tools", []);
  assert.equal(none.chip, null);
  assert.equal(none.projectId, null);
  assert.equal(NO_PROJECT_LINE, "Used in learning projects and practice.");
  assert.equal(WHEEL_HINT, "Each prayer wheel is a group of skills. Spin one to see the skills and where they were used.");
});

test("thread arcs start and end where asked, and rise in between", () => {
  const a: V3 = [14, 0.8, -3];
  const b: V3 = [-5, 1, -15];
  const pts = arcPoints(a, b, 20);
  assert.equal(pts.length, 21);
  assert.deepEqual(pts[0], a);
  assert.ok(Math.abs(pts[20][0] - b[0]) < 1e-9 && Math.abs(pts[20][2] - b[2]) < 1e-9);
  assert.ok(Math.max(...pts.map((p) => p[1])) > a[1] + 2);
});

test("thread buffers: one set for all arcs, indices in range, u runs 0..1", () => {
  const from: V3 = [14, 0.8, -3];
  const targets: V3[] = [
    [-5, 1, -15],
    [0, 1, -15],
    [5, 1, -15],
  ];
  const b = threadBuffers(from, targets, { radial: 5, segments: 30 });
  assert.equal(b.positions.length / 3, 3 * 31 * 5);
  assert.equal(b.triangles, 3 * 30 * 5 * 2);
  assert.ok(Math.max(...b.indices) < b.u.length);
  assert.equal(Math.min(...b.u), 0);
  assert.equal(Math.max(...b.u), 1);
  assert.ok(b.positions.every(Number.isFinite));
  assert.equal(threadBuffers(from, []).triangles, 0);
});

test("threads fade in, hold and fade out within 8 s", () => {
  assert.equal(THREAD_SECONDS, 8);
  assert.equal(threadAlpha(0), 0);
  assert.ok(threadAlpha(0.1) > 0 && threadAlpha(0.1) < 1);
  assert.equal(threadAlpha(3), 1);
  assert.ok(threadAlpha(7.5) > 0 && threadAlpha(7.5) < 1);
  assert.equal(threadAlpha(8), 0);
  assert.equal(threadAlpha(12), 0);
});

test("signboards: the group name is >= 20 px tall at the walk-up view, 1280x720 (step15)", async () => {
  const { CAM_FOV, projectNdc, pxPerMetre, viewOfZone, viewPose } = await import("../cameraRig");
  const { AVATAR_SCALE } = await import("../characters");
  const { SKILLS_MID } = await import("../zones");
  const { plaqueWidth, PLAQUE } = await import("./frame");
  const { SIGN_NAME_FLOOR, SIGN_NAME_MAX, signNamePx } = await import("./wheelLayout");
  const n = layoutWheels(profile.skills).length;
  assert.ok(n > 0 && SIGN_NAME_FLOOR <= SIGN_NAME_MAX);
  const pose = viewPose([SKILLS_MID.x, AVATAR_SCALE, SKILLS_MID.z], viewOfZone("skills-lab"));
  const depth = projectNdc(pose, [GALLERY.x, PLAQUE.y, GALLERY.z + PLAQUE.dz], CAM_FOV, 16 / 9).depth;
  const px = signNamePx(plaqueWidth(n), SIGN_NAME_FLOOR, pxPerMetre(depth, 720));
  assert.ok(px >= 20, `name is ${px.toFixed(1)} px tall (>= 20)`);
});

test("signboards: clear of the plinth, pedestal and drum, and every corner is in frame from the skills view (step15)", async () => {
  const { CAM_FOV, projectNdc, viewOfZone, viewPose } = await import("../cameraRig");
  const { AVATAR_SCALE } = await import("../characters");
  const { SKILLS_MID } = await import("../zones");
  const { PEDESTAL, PLAQUE, PLAQUE_THICK, PLINTH, plaqueHeight, plaqueWidth } = await import("./frame");
  const { DRUM_MAX_R, DRUM_Y } = await import("./wheelLayout");
  const pose = viewPose([SKILLS_MID.x, AVATAR_SCALE, SKILLS_MID.z], viewOfZone("skills-lab"));
  for (const count of [1, 3, 5, 8]) {
    const n = layoutWheels(resizeGroups(profile.skills, count)).length;
    const w = plaqueWidth(n);
    const h = plaqueHeight(n);
    // the board's frame is a box (thickness PLAQUE_THICK) tilted about x; check its four back and front corners
    const c = Math.cos(PLAQUE.tilt);
    const sn = Math.sin(PLAQUE.tilt);
    const corners: [number, number, number][] = [];
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const ly = (sy * (h + 0.04)) / 2;
        const lz = (sz * PLAQUE_THICK) / 2;
        // rotation about x by tilt: y' = y cos - z sin, z' = y sin + z cos
        corners.push([w / 2, PLAQUE.y + ly * c - lz * sn, GALLERY.z + PLAQUE.dz + ly * sn + lz * c]);
      }
    }
    const zs = corners.map((p) => p[2] - GALLERY.z);
    const ys = corners.map((p) => p[1]);
    assert.ok(Math.min(...ys) >= PLINTH.top + 0.04, `n=${n}: lower edge ${Math.min(...ys).toFixed(3)} sits on the plinth`);
    assert.ok(Math.min(...zs) >= PEDESTAL.halfDepth + 0.02, `n=${n}: back edge ${Math.min(...zs).toFixed(3)} is inside the pedestal`);
    // wherever the board is above the pedestal's top, it must also clear the drum
    assert.ok(Math.min(...zs) >= DRUM_MAX_R + 0.02 || Math.max(...ys) < DRUM_Y, `n=${n}: board touches the drum`);
    assert.ok(Math.max(...zs) <= PLINTH.halfDepth, `n=${n}: front edge ${Math.max(...zs).toFixed(3)} hangs off the plinth`);
    // in frame (with a margin for the HUD) from the skills preset: both end boards, all corners
    const wheels = layoutWheels(resizeGroups(profile.skills, count));
    for (const wh of [wheels[0], wheels[n - 1]]) {
      for (const p of corners) {
        for (const sx of [-1, 1]) {
          const q = projectNdc(pose, [wh.x + sx * p[0], p[1], p[2]], CAM_FOV, 16 / 9);
          assert.ok(Math.abs(q.x) < 0.98 || count > 5, `n=${n}: board corner x ${q.x.toFixed(2)} out of frame`);
          assert.ok(q.y > -0.92 && q.y < 0.9, `n=${n}: board corner y ${q.y.toFixed(2)} out of frame`);
        }
      }
    }
  }
});

test("drum: the brass rows and the engraved names fit the atlas, one row per wheel (step15)", async () => {
  const { BANDS, DOME_H, ROW_H, ROW_W } = await import("./brass");
  const { NAME_REPEATS } = await import("./spin");
  assert.ok(ROW_W * 5 > 0 && ROW_H * 8 <= 8192, "eight rows fit a texture");
  assert.ok(NAME_REPEATS >= 2 && ROW_W % NAME_REPEATS === 0);
  const order = [BANDS.rimLow, BANDS.nameLow, BANDS.orn, BANDS.nameHigh, BANDS.rimHigh];
  order.forEach((b, i) => {
    assert.ok(b[0] < b[1]);
    if (i) assert.ok(b[0] > order[i - 1][1], "bands do not overlap");
  });
  assert.ok(DOME_H > 0 && DOME_H < 0.25);
});
