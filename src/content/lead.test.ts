import { test } from "node:test";
import assert from "node:assert/strict";
import type { Project } from "./profile";
import { LEAD_KEY, resolveLeadId } from "./lead";

const proj = (id: string, extra: Partial<Project> = {}): Project => ({
  id, name: id, tagline: "", description: "", problem: "", stack: [], highlights: [],
  liveUrl: null, repoUrl: null, caseStudyUrl: null, demoVideo: null, year: 2026, ...extra,
});
const data = { projects: [proj("barber-on-demand", { featured: true }), proj("goldstar-3d", { featured: true }), proj("other")] };

function memory(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

test("resolveLeadId: picks once, saves it, and is stable for the rest of the session", () => {
  const storage = memory();
  const first = resolveLeadId(data, { storage, search: "", random: () => 0.9 });
  assert.equal(first, "goldstar-3d");
  assert.equal(storage.m.get(LEAD_KEY), "goldstar-3d");
  // later calls ignore the random source: the saved lead wins
  for (const r of [0, 0.2, 0.99]) assert.equal(resolveLeadId(data, { storage, search: "", random: () => r }), "goldstar-3d");
});

test("resolveLeadId: two sessions with different random values lead differently", () => {
  assert.equal(resolveLeadId(data, { storage: memory(), search: "", random: () => 0.1 }), "barber-on-demand");
  assert.equal(resolveLeadId(data, { storage: memory(), search: "", random: () => 0.6 }), "goldstar-3d");
});

test("resolveLeadId: a saved id that is no longer a flagship is replaced", () => {
  const storage = memory({ [LEAD_KEY]: "bookeasy" });
  assert.equal(resolveLeadId(data, { storage, search: "", random: () => 0.1 }), "barber-on-demand");
  assert.equal(storage.m.get(LEAD_KEY), "barber-on-demand");
});

test("resolveLeadId: storage that throws (blocked, private mode) falls back to the default", () => {
  const broken = {
    getItem: (): string | null => {
      throw new Error("blocked");
    },
    setItem: (): void => {
      throw new Error("blocked");
    },
  };
  assert.equal(resolveLeadId(data, { storage: broken, search: "", random: () => 0.9 }), "barber-on-demand");
  assert.equal(resolveLeadId(data, { storage: null, search: "", random: () => 0.9 }), "barber-on-demand");
});

test("resolveLeadId: no browser (server) gives the default; one flagship is always the lead", () => {
  assert.equal(resolveLeadId(data), "barber-on-demand");
  assert.equal(resolveLeadId({ projects: [proj("a"), proj("b")] }, { storage: memory(), search: "", random: () => 0.9 }), "a");
  assert.equal(resolveLeadId({ projects: [] }), undefined);
});

test("resolveLeadId: ?lead= overrides (outside production, or with ?debug), by part of the id", () => {
  const storage = memory({ [LEAD_KEY]: "barber-on-demand" });
  assert.equal(resolveLeadId(data, { storage, search: "?debug&lead=goldstar" }), "goldstar-3d");
  assert.equal(resolveLeadId(data, { storage, search: "?lead=barber" }), "barber-on-demand");
  assert.equal(resolveLeadId(data, { storage, search: "?debug&lead=nope" }), "barber-on-demand", "unknown value is ignored");
  assert.equal(storage.m.get(LEAD_KEY), "barber-on-demand", "an override never overwrites the saved lead");
});
