import { test } from "node:test";
import assert from "node:assert/strict";
import { profile } from "@/content/profile";
import { POT_ROW_Z } from "../zones";
import { FILTERS, GOOD_AT, layoutPots, nearestPot, plainGroup, plainGroupName, potSummary, POT_W, resizeSkills, rowX, STRONG_AT, strengthWord } from "./potLayout";
import { NO_PROJECT_LINE, robotSkillLine } from "./skillCopy";
import { arcPoints, THREAD_SECONDS, threadAlpha, threadBuffers, type V3 } from "./threads";

const total = (g: { skills: unknown[] }[]) => g.reduce((a, x) => a + x.skills.length, 0);

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

test("tooltip line: years only when present, plain plurals", () => {
  assert.equal(potSummary("React", 3, 2), "React: 3 years · used in 2 projects");
  assert.equal(potSummary("Git", 1, 1), "Git: 1 year · used in 1 project");
  assert.equal(potSummary("Blender", undefined, 0), "Blender: used in learning projects");
  assert.equal(potSummary("Docker", 0, 3), "Docker: used in 3 projects");
});

test("filters: All plus the five groups", () => {
  assert.deepEqual(FILTERS.map((f) => f.label), ["All", "Frontend", "Backend", "Database", "DevOps", "3D & AI"]);
});

test("real profile: one row per group, five rows keep the old x positions", () => {
  const pots = layoutPots(profile.skills);
  assert.equal(pots.length, total(profile.skills));
  assert.equal(new Set(pots.map((p) => p.row)).size, profile.skills.length);
  assert.deepEqual([0, 1, 2, 3, 4].map((r) => rowX(r, 5)), [12.9, 13.8, 14.7, 15.6, 16.5]);
  const colours = new Map(pots.map((p) => [p.category, p.colour]));
  assert.equal(colours.size, 5);
  assert.equal(new Set(colours.values()).size, 5);
});

test("a stronger skill is a bigger pot (taller and wider) within a row", () => {
  const frontend = layoutPots(profile.skills).filter((p) => p.category === "frontend");
  const strong = frontend.reduce((a, b) => (b.level > a.level ? b : a));
  const weak = frontend.reduce((a, b) => (b.level < a.level ? b : a));
  assert.ok(strong.level > weak.level);
  assert.ok(strong.height > weak.height && strong.girth > weak.girth);
});

test("3 to 30 skills: pots stay inside the square and never overlap", () => {
  for (let n = 3; n <= 30; n++) {
    const groups = resizeSkills(profile.skills, n);
    assert.equal(total(groups), n, `n=${n}`);
    const pots = layoutPots(groups);
    assert.equal(pots.length, n);
    for (const p of pots) {
      const r = (POT_W * p.girth) / 2;
      assert.ok(p.z - r >= POT_ROW_Z[0] - 0.01 && p.z + r <= POT_ROW_Z[1] + 0.01, `n=${n} pot ${p.index} z`);
      assert.ok(p.x >= 12.8 && p.x <= 16.6);
    }
    for (let i = 0; i < pots.length; i++) {
      for (let j = i + 1; j < pots.length; j++) {
        const gap = Math.hypot(pots[i].x - pots[j].x, pots[i].z - pots[j].z) - (POT_W / 2) * (pots[i].girth + pots[j].girth);
        assert.ok(gap > 0.02, `n=${n}: pots ${i} and ${j} overlap (gap ${gap.toFixed(3)})`);
      }
    }
  }
});

test("more than five groups still get their own rows", () => {
  const groups = [...profile.skills, { category: "frontend" as const, label: "Extra", skills: [{ name: "X", level: 60 }] }];
  const pots = layoutPots(groups);
  assert.equal(new Set(pots.map((p) => p.row)).size, 6);
  assert.ok(Math.max(...pots.map((p) => p.x)) <= 16.5 + 1e-9);
});

test("resizeSkills: null keeps the profile; extra copies keep the matching name", () => {
  assert.equal(resizeSkills(profile.skills, null), profile.skills);
  const big = resizeSkills(profile.skills, 25).flatMap((g) => g.skills);
  const copy = big.find((s) => "display" in s && s.display);
  assert.ok(copy && "display" in copy && copy.display !== copy.name && copy.display!.startsWith(copy.name));
});

test("nearestPot: within range or -1", () => {
  const pots = [
    { x: 0, z: 0 },
    { x: 2, z: 0 },
  ];
  assert.equal(nearestPot(pots, 1.8, 0.3, 1.2), 1);
  assert.equal(nearestPot(pots, 1, 5, 1.2), -1);
});

test("robot line: names up to two projects, counts more, no chip for none", () => {
  const p = (id: string, name: string) => ({ id, name });
  assert.deepEqual(robotSkillLine("React", [p("a", "BookEasy"), p("b", "SyncBoard")]), {
    text: "React was used in BookEasy and SyncBoard. Want to see?",
    projectId: "a",
    chip: "Take me to BookEasy",
  });
  assert.equal(robotSkillLine("React", [p("a", "BookEasy")]).text, "React was used in BookEasy. Want to see?");
  const three = robotSkillLine("React", [p("a", "A"), p("b", "B"), p("c", "C")]);
  assert.equal(three.text, "React was used in 3 projects. Want to see?");
  assert.equal(three.projectId, "a");
  const none = robotSkillLine("Blender", []);
  assert.equal(none.chip, null);
  assert.equal(none.projectId, null);
  assert.equal(NO_PROJECT_LINE, "Used in learning projects and practice.");
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
