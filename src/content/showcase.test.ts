import { test } from "node:test";
import assert from "node:assert/strict";
import { profile, type Profile, type Project } from "./profile";
import { featuredProject, normaliseTech, plainArchitecture, projectsForSkill } from "./showcase";

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

test("projectsForSkill: works on the real placeholder profile", () => {
  assert.deepEqual(ids(projectsForSkill("Next.js")), ["bookeasy", "repoguide"]);
  assert.deepEqual(ids(projectsForSkill("React")), ["syncboard"]);
  assert.deepEqual(ids(projectsForSkill("Authentication")), ["bookeasy"]);
  assert.deepEqual(ids(projectsForSkill("Postgres")), ["bookeasy", "repoguide"]);
});

test("featuredProject: the flagged one, else the first, else undefined", () => {
  assert.equal(featuredProject()?.id, "bookeasy");
  assert.equal(profile.projects.filter((p) => p.featured).length, 1);
  assert.equal(featuredProject({ projects: [proj("a", []), proj("b", [], { featured: true })] })?.id, "b");
  assert.equal(featuredProject({ projects: [proj("a", []), proj("b", [])] })?.id, "a");
  assert.equal(featuredProject({ projects: [] }), undefined);
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

test("placeholder profile: every project has a plain architecture and ids are unique", () => {
  for (const p of profile.projects) assert.ok(plainArchitecture(p).length > 0, p.id);
  assert.equal(new Set(profile.projects.map((p) => p.id)).size, profile.projects.length);
});
