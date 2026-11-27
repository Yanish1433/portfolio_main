import assert from "node:assert/strict";
import { test } from "node:test";
import { profile } from "@/content/profile";
import { quickTourDurationMs, quickTourLines, QUICK_TOUR_PAUSE_MS, QUICK_TOUR_STOPS, QUICK_TOUR_TARGET_MS, runTourStops, type TourDeps } from "./quickTour";
import { FIXTURE_EDUCATION, FIXTURE_EXPERIENCE, FIXTURE_PROJECTS } from "./test-fixtures";
import type { ZoneId } from "./types";

const PRONOUN = /\b(he|she|him|her|his|hers|they|them|their|himself|herself)\b/i;

test("quick tour: Ghar, Projects, Skills, Education, Journey, Contact", () => {
  assert.deepEqual([...QUICK_TOUR_STOPS], ["about", "project-hall", "skills-lab", "education", "timeline", "mailbox"]);
});

test("quick tour lines: one short real line per stop, no pronoun for the owner", () => {
  for (const p of [profile, { ...profile, projects: FIXTURE_PROJECTS, education: FIXTURE_EDUCATION, experience: FIXTURE_EXPERIENCE }]) {
    const lines = quickTourLines(p);
    for (const z of QUICK_TOUR_STOPS) {
      const l = lines[z];
      assert.ok(l && l.length > 10 && l.length <= 200, `${z}: ${l}`);
      assert.ok(!PRONOUN.test(l), `${z}: ${l}`);
      assert.ok(!/undefined|null|NaN|\s{2}|\.\./.test(l), `${z}: ${l}`);
    }
  }
});

test("quick tour lines come from profile data", () => {
  const l = quickTourLines(profile);
  const first = profile.name.split(" ")[0];
  assert.ok(l.about.startsWith(`${first}'s Ghar`));
  assert.ok(l["project-hall"].includes(String(profile.projects.length)));
  for (const g of profile.skills) assert.ok(l["skills-lab"].includes(g.label));
  assert.ok(l.mailbox.includes(first));
});

test("quick tour duration: ~5 s pauses plus walking lands near a minute", () => {
  assert.equal(QUICK_TOUR_PAUSE_MS, 5000);
  assert.equal(quickTourDurationMs([10, 10], 5, 5000), 2 * 2000 + 2 * 5000);
  assert.ok(QUICK_TOUR_PAUSE_MS * QUICK_TOUR_STOPS.length < QUICK_TOUR_TARGET_MS);
});

function fakeWorld(legMs: number) {
  const log: string[] = [];
  let clock = 0;
  let at: ZoneId | null = null;
  const deps: TourDeps = {
    inZone: (z) => at === z,
    leadTo: async (z, s) => {
      if (s.aborted) throw new DOMException("aborted", "AbortError");
      clock += legMs;
      at = z;
      log.push(`walk:${z}`);
    },
    arrive: (z) => log.push(`say:${z}`),
    sleep: async (ms, s) => {
      if (s.aborted) throw new DOMException("aborted", "AbortError");
      clock += ms;
    },
  };
  return { log, deps, now: () => clock };
}

test("runTourStops visits every stop in order, pausing at each", async () => {
  const w = fakeWorld(5000);
  await runTourStops(QUICK_TOUR_STOPS, QUICK_TOUR_PAUSE_MS, w.deps, new AbortController().signal);
  assert.deepEqual(w.log.filter((x) => x.startsWith("say:")), QUICK_TOUR_STOPS.map((z) => `say:${z}`));
  assert.equal(w.now(), 6 * (5000 + QUICK_TOUR_PAUSE_MS));
});

test("an interrupt (abort) mid-tour stops the walk: no later stop runs", async () => {
  const ctl = new AbortController();
  const w = fakeWorld(1000);
  const sleepOrig = w.deps.sleep;
  let sleeps = 0;
  w.deps.sleep = (ms, s) => {
    if (++sleeps === 2) ctl.abort(); // visitor presses a key during the second pause
    return sleepOrig(ms, s);
  };
  await assert.rejects(runTourStops(QUICK_TOUR_STOPS, QUICK_TOUR_PAUSE_MS, w.deps, ctl.signal), { name: "AbortError" });
  assert.deepEqual(w.log, ["walk:about", "say:about", "walk:project-hall", "say:project-hall"]);
});
