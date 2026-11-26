import test from "node:test";
import assert from "node:assert/strict";
import { profile, type Project } from "@/content/profile";
import { builtLine, openToText, teamCards } from "./proof";

const mk = (over: Partial<Project>): Project => ({
  id: "x", name: "X", tagline: "", description: "", problem: "", stack: [], highlights: [], liveUrl: "https://x.dev", repoUrl: null, caseStudyUrl: null, demoVideo: null, year: 2026, featured: true, ...over,
});

test("the real profile gets its four cards and the built line", () => {
  assert.equal(builtLine(profile), "Built and shipped 2 full-stack apps on my own, from design to deployment");
  assert.deepEqual(teamCards(profile).map((c) => c.id), ["realtime", "auth", "3d", "product"]);
  const cards = teamCards(profile);
  assert.match(cards[0].evidence, /Barber On Demand/);
  assert.match(cards[1].evidence, /both projects/);
  assert.match(cards[3].evidence, /Cloudflare/);
});

test("no evidence, no card; nothing shipped, no claim", () => {
  assert.deepEqual(teamCards({ projects: [mk({ stack: ["React"] })] }), []);
  assert.equal(builtLine({ projects: [mk({ liveUrl: null })] }), null);
  assert.equal(builtLine({ projects: [mk({})] }), "Built and shipped 1 full-stack app on my own, from design to deployment");
});

test("a claim covers only the projects that back it", () => {
  const a = mk({ id: "a", name: "A", stack: ["JWT", "Express", "Zod"] });
  const b = mk({ id: "b", name: "B", stack: ["Express"] });
  const auth = teamCards({ projects: [a, b] }).find((c) => c.id === "auth");
  assert.equal(auth?.evidence, "JWT, Express and Zod in A");
});

test("open-to text", () => {
  assert.equal(openToText(profile), "internships, junior roles and freelance");
  assert.equal(openToText({}), null);
  assert.equal(openToText({ openTo: ["freelance"] }), "freelance");
});
