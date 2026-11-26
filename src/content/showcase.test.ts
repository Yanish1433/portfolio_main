import { test } from "node:test";
import assert from "node:assert/strict";
import { profile, type Profile, type Project } from "./profile";
import { featuredProject, featuredProjects, leadFirst, leadProject, normaliseTech, plainArchitecture, projectsForSkill, taglineOf } from "./showcase";

const proj = (id: string, stack: string[], extra: Partial<Project> = {}): Project => ({
  id,
  name: id,
  tagline: "",
  description: "",
  problem: "",
  stack,
  highlights: [],
  liveUrl: null,
  repoUrl: null,
  caseStudyUrl: null,
  demoVideo: null,
  year: 2025,
  ...extra,
});

const skills = (...rows: [string, string[]?][]): Profile["skills"] => [
  { category: "frontend", label: "F", skills: rows.map(([name, usedIn]) => ({ name, level: 50, ...(usedIn ? { usedIn } : {}) })) },
];

const ids = (list: Project[]) => list.map((p) => p.id);

test("normaliseTech: case, spaces, .js and aliases", () => {
  assert.equal(normaliseTech("Next"), normaliseTech("Next.js"));
  assert.equal(normaliseTech("NEXT.JS"), normaliseTech("nextjs"));
  assert.equal(normaliseTech("Node"), normaliseTech("Node.js"));
  assert.equal(normaliseTech("Postgres"), normaliseTech("PostgreSQL"));
  assert.equal(normaliseTech("TS"), normaliseTech("TypeScript"));
  assert.equal(normaliseTech("Tailwind"), normaliseTech("Tailwind CSS"));
  assert.equal(normaliseTech("LLM API"), normaliseTech("LLM APIs"));
});

test("projectsForSkill: derives from stack, case-insensitive, with aliases", () => {
  const data = {
    skills: skills(["Next.js"], ["Node.js"], ["PostgreSQL"], ["TypeScript"]),
    projects: [proj("a", ["Next", "TS", "Postgres"]), proj("b", ["node", "redis"]), proj("c", ["Vue"])],
  };
  assert.deepEqual(ids(projectsForSkill("next.js", data)), ["a"]);
  assert.deepEqual(ids(projectsForSkill("NODE", data)), ["b"]);
  assert.deepEqual(ids(projectsForSkill("PostgreSQL", data)), ["a"]);
  assert.deepEqual(ids(projectsForSkill("typescript", data)), ["a"]);
  assert.deepEqual(projectsForSkill("Rust", data), []);
});

test("projectsForSkill: React must not match React Native or React Three Fiber", () => {
  const data = {
    skills: skills(["React"]),
    projects: [proj("native", ["React Native"]), proj("r3f", ["React Three Fiber"]), proj("web", ["React", "Node"]), proj("hooks", ["Preact"])],
  };
  assert.deepEqual(ids(projectsForSkill("React", data)), ["web"]);
  assert.deepEqual(ids(projectsForSkill("react native", data)), ["native"]);
  assert.deepEqual(ids(projectsForSkill("Java", { skills: [], projects: [proj("js", ["JavaScript"])] })), []);
});

test("projectsForSkill: an explicit usedIn wins over the stack, unknown ids are ignored", () => {
  const data = {
    skills: skills(["Authentication", ["b", "missing"]]),
    projects: [proj("a", ["Authentication"]), proj("b", ["Go"])],
  };
  assert.deepEqual(ids(projectsForSkill("Authentication", data)), ["b"]);
});

test("projectsForSkill: whole pipeline on a local fixture (not the live profile)", () => {
  const data = {
    skills: skills(["Next.js"], ["React"], ["Authentication", ["a"]], ["Postgres"]),
    projects: [proj("a", ["Next.js", "PostgreSQL"]), proj("b", ["React"]), proj("c", ["Next", "Postgres"])],
  };
  assert.deepEqual(ids(projectsForSkill("Next.js", data)), ["a", "c"]);
  assert.deepEqual(ids(projectsForSkill("React", data)), ["b"]);
  assert.deepEqual(ids(projectsForSkill("Authentication", data)), ["a"]);
  assert.deepEqual(ids(projectsForSkill("Postgres", data)), ["a", "c"]);
});

test("real content: React, Node.js, MongoDB, Three.js and Authentication link to both real projects", () => {
  const both = ["barber-on-demand", "goldstar-3d"];
  for (const s of ["React", "Node.js", "MongoDB", "Three.js", "Authentication"]) assert.deepEqual(ids(projectsForSkill(s)), both, s);
});

test("real content: two projects, both flagships, Goldstar carries its disclaimer, no invented metrics", () => {
  assert.deepEqual(profile.projects.map((p) => p.id), ["barber-on-demand", "goldstar-3d"]);
  assert.equal(featuredProjects().length, 2);
  assert.equal(profile.projects.find((p) => p.id === "goldstar-3d")?.disclaimer, "Concept project, not affiliated with Goldstar.");
  assert.equal(profile.projects.find((p) => p.id === "barber-on-demand")?.disclaimer, undefined);
  for (const p of profile.projects) assert.equal(p.metrics, undefined, p.id);
});

test("featuredProject / featuredProjects: the flagged ones, else the first, else nothing", () => {
  const two = { projects: [proj("a", []), proj("b", [], { featured: true }), proj("c", [], { featured: true })] };
  assert.deepEqual(ids(featuredProjects(two)), ["b", "c"]);
  assert.equal(featuredProject(two)?.id, "b");
  assert.deepEqual(ids(featuredProjects({ projects: [proj("a", []), proj("b", [])] })), ["a"]);
  assert.equal(featuredProject({ projects: [proj("a", []), proj("b", [])] })?.id, "a");
  assert.deepEqual(featuredProjects({ projects: [] }), []);
  assert.equal(featuredProject({ projects: [] }), undefined);
});

test("leadProject: no seed gives the first flagship; a seed picks one, the same one every time", () => {
  const two = { projects: [proj("a", []), proj("b", [], { featured: true }), proj("c", [], { featured: true })] };
  assert.equal(leadProject(undefined, two)?.id, "b");
  for (const seed of [0, 1, 7, "x", "session-42", 123456789]) {
    const first = leadProject(seed, two)?.id;
    assert.ok(first === "b" || first === "c");
    for (let i = 0; i < 5; i++) assert.equal(leadProject(seed, two)?.id, first);
  }
  const seen = new Set(Array.from({ length: 40 }, (_, i) => leadProject(i, two)?.id));
  assert.deepEqual([...seen].sort(), ["b", "c"], "different seeds reach both flagships");
  assert.equal(leadProject(5, { projects: [proj("a", []), proj("b", [])] })?.id, "a", "one flagship: always that one");
  assert.equal(leadProject(5, { projects: [] }), undefined);
});

test("leadFirst: lead first, the rest keep their order, unknown id changes nothing", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(leadFirst(list, "c").map((p) => p.id), ["c", "a", "b"]);
  assert.deepEqual(leadFirst(list, "a"), list);
  assert.deepEqual(leadFirst(list, "zzz"), list);
  assert.deepEqual(leadFirst(list, undefined), list);
});

test("taglineOf: drops a trailing concept note only when a disclaimer says it", () => {
  const t = "Scroll-driven 3D shoe shop (concept, not affiliated with Goldstar)";
  assert.equal(taglineOf({ tagline: t, disclaimer: "Concept project, not affiliated with Goldstar." }), "Scroll-driven 3D shoe shop");
  assert.equal(taglineOf({ tagline: t }), t);
  assert.equal(taglineOf({ tagline: "At-home barber booking", disclaimer: "x" }), "At-home barber booking");
});

test("plainArchitecture: uses architecture when present", () => {
  const arch = [
    { label: "Website", tech: "Next.js" },
    { label: "Server", tech: "Node API" },
  ];
  assert.deepEqual(plainArchitecture(proj("a", ["Vue"], { architecture: arch })), arch);
});

test("plainArchitecture: guesses website, server, database from the stack", () => {
  assert.deepEqual(plainArchitecture(proj("a", ["PostgreSQL", "Node.js", "React", "Stripe"])), [
    { label: "Website", tech: "React" },
    { label: "Server", tech: "Node.js" },
    { label: "Database", tech: "PostgreSQL" },
    { label: "Payments", tech: "Stripe" },
  ]);
  // languages are not layers; unknown tools go last; an empty stack gives an empty list
  assert.deepEqual(plainArchitecture(proj("b", ["TypeScript", "Next.js", "Mystery"])), [
    { label: "Website", tech: "Next.js" },
    { label: "Other", tech: "Mystery" },
  ]);
  assert.deepEqual(plainArchitecture(proj("c", ["TypeScript"])), [{ label: "Code", tech: "TypeScript" }]);
  assert.deepEqual(plainArchitecture(proj("d", [])), []);
  assert.deepEqual(plainArchitecture(proj("e", ["Next"], { architecture: [] })), [{ label: "Website", tech: "Next" }]);
});

test("real profile: every project has a plain architecture and ids are unique", () => {
  for (const p of profile.projects) assert.ok(plainArchitecture(p).length > 0, p.id);
  assert.equal(new Set(profile.projects.map((p) => p.id)).size, profile.projects.length);
});
