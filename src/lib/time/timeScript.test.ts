import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { TIME_SCRIPT } from "./timeScript";
import { resolveMinutes, lookOf } from "./clock";
import { paperLook } from "./paperLook";

type Case = { search: string; saved?: string | null; legacy?: string | null; now: number; session?: string | null; hash?: string };

function runScript(c: Case) {
  const style: Record<string, string> = {};
  const el = { dataset: {} as Record<string, string>, style: { setProperty: (k: string, v: string) => (style[k] = v) } };
  const store = (m: Record<string, string | null | undefined>) => ({ getItem: (k: string) => m[k] ?? null });
  const DateFake = class {
    getHours() {
      return Math.floor(c.now / 60);
    }
    getMinutes() {
      return c.now % 60;
    }
  };
  const ctx = {
    document: { currentScript: { parentElement: el } },
    location: { search: c.search, hash: c.hash ?? "" },
    URLSearchParams,
    localStorage: store({ "world-time": c.saved, "world-theme": c.legacy }),
    sessionStorage: store({ "book-cover": c.session }),
    Date: DateFake,
    Math,
    isFinite,
  };
  vm.runInNewContext(TIME_SCRIPT, ctx);
  return { theme: el.dataset.theme, cover: el.dataset.cover, glow: Number(style["--glow"]) };
}

const cases: Case[] = [
  { search: "?time=22:00", now: 600 },
  { search: "?time=7:05", saved: "1300", now: 600 },
  { search: "?time=25:00", saved: "300", now: 700 },
  { search: "?theme=night", saved: "720", now: 600 },
  { search: "?theme=day", now: 1400 },
  { search: "?theme=bogus", saved: "1180", now: 600 },
  { search: "", saved: "400", now: 900 },
  { search: "", saved: "1500", now: 900 },
  { search: "", saved: "now", now: 1130 },
  { search: "", saved: "junk", now: 100 },
  { search: "", legacy: "night", now: 600 },
  { search: "", legacy: "day", now: 1400 },
  { search: "", now: 1125 },
  { search: "", now: 374 },
  { search: "", now: 375 },
];

test("inline script and resolveMinutes agree on theme and glow", () => {
  for (const c of cases) {
    const q = new URLSearchParams(c.search);
    const m = resolveMinutes({ time: q.get("time"), theme: q.get("theme"), saved: c.saved, legacy: c.legacy, now: c.now });
    const want = lookOf(m);
    const got = runScript(c);
    assert.equal(got.theme, want.theme, JSON.stringify(c));
    assert.ok(Math.abs(got.glow - want.glow) < 0.001, `${JSON.stringify(c)} glow ${got.glow} vs ${want.glow}`);
  }
});

test("data-cover follows sessionStorage and a deep link", () => {
  assert.equal(runScript({ search: "", now: 600, hash: "#projects" }).cover, "seen");
  assert.equal(runScript({ search: "", now: 600, hash: "#" }).cover, "new");
  assert.equal(runScript({ search: "", now: 600, session: "1" }).cover, "seen");
  assert.equal(runScript({ search: "", now: 600 }).cover, "new");
});

test("paperLook: 0 at day, 1 deep night, blended at dusk and dawn", () => {
  assert.equal(paperLook(12 * 60).glow, 0);
  assert.equal(paperLook(23 * 60).glow, 1);
  assert.equal(paperLook(3 * 60).glow, 1);
  const dusk = paperLook(19 * 60).glow;
  assert.ok(dusk > 0.3 && dusk < 1);
  const dawn = paperLook(6 * 60).glow;
  assert.ok(dawn > 0 && dawn < 1);
  assert.equal(paperLook(12 * 60).paper, "#f6ead0");
  assert.equal(paperLook(23 * 60).paper, "#e6d6b2");
  for (let m = 0; m < 1440; m++) assert.ok(paperLook(m).glow >= 0 && paperLook(m).glow <= 1);
});
