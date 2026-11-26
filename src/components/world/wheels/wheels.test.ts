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
