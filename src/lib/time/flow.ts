// The one flowing game clock for /, /town and /recruiter.
// It starts at resolveMinutes (clock.ts) and then runs at a constant speed: one 24 h day = CYCLE_MIN real minutes.
// The pure maths (flowMinutes, resolveStart, resolvePaused) is tested; the singleton below only holds an anchor
// {m, at}: "at epoch `at` the clock read m". The anchor lives in sessionStorage ("world-flow") so a reload or a route
// change continues the same cycle and the pre-paint TIME_SCRIPT can start from it (no flash).
// No React and no THREE here. Nothing is written to localStorage per tick.
import { parseTime, wrapMinutes } from "@/components/world/nepal/timeLook";
import { resolveMinutes } from "./clock";

export const CYCLE_MIN = 8; // real minutes for one full 24 h day
export const FLOW_KEY = "world-flow"; // sessionStorage: {m, at}
export const PAUSE_KEY = "world-flow-paused"; // localStorage: "1" paused, "0" running; absent = follow reduced motion
export const MIN_CYCLE = 0.25; // debug ?cycle= is clamped to this

export type Anchor = { m: number; at: number };

/** Game minutes per real millisecond. */
export const rateFor = (cycleMin: number = CYCLE_MIN) => 1440 / (cycleMin * 60000);

/** Pure: the clock at real time `now` (epoch ms), wrapped to [0, 1440). */
export function flowMinutes(a: Anchor, now: number, cycleMin: number = CYCLE_MIN): number {
  return wrapMinutes(a.m + (now - a.at) * rateFor(cycleMin));
}

/** Pure: saved pause choice wins; otherwise reduced motion = paused. */
export function resolvePaused(saved: string | null | undefined, reduced: boolean): boolean {
  if (saved === "1") return true;
  if (saved === "0") return false;
  return reduced;
}

export type StartInput = {
  time?: string | null;
  theme?: string | null;
  saved?: string | null;
  legacy?: string | null;
  nowMin: number; // local time of day, minutes
  anchor?: Anchor | null;
  nowMs: number;
  paused: boolean;
  cycleMin?: number;
};

/** Pure: ?time / ?theme win, then this session's anchor (continue the cycle), then the saved pick / local time (resolveMinutes). */
export function resolveStart(i: StartInput): number {
  const hasParam = parseTime(i.time) !== null || i.theme === "day" || i.theme === "night";
  const base = resolveMinutes({ time: i.time, theme: i.theme, saved: i.saved, legacy: i.legacy, now: i.nowMin });
  if (hasParam) return base;
  const a = i.anchor;
  if (a && Number.isFinite(a.m) && Number.isFinite(a.at)) return i.paused ? wrapMinutes(a.m) : flowMinutes(a, i.nowMs, i.cycleMin);
  return base;
}

/** Pure: parse the sessionStorage text. */
export function parseAnchor(s: string | null | undefined): Anchor | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s) as Partial<Anchor> | null;
    return v && Number.isFinite(v.m) && Number.isFinite(v.at) ? { m: v.m as number, at: v.at as number } : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- singleton

let anchor: Anchor | null = null;
let paused = false;
let cycle = CYCLE_MIN;
let timer: ReturnType<typeof setInterval> | null = null;
let lastRound = -1;
let ticking = false;
let version = 0;
const subs = new Set<() => void>();

const readLS = (k: string) => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const persistAnchor = () => {
  try {
    if (anchor) window.sessionStorage.setItem(FLOW_KEY, JSON.stringify(anchor));
  } catch {
    /* storage blocked */
  }
};
const emit = () => {
  version++;
  ticking = true;
  try {
    subs.forEach((f) => f());
  } finally {
    ticking = false;
  }
};

/** Exact (fractional) game minutes now. Cheap: safe to call every frame. */
export function currentMinutes(now: number = Date.now()): number {
  if (!anchor) return 720;
  return paused ? wrapMinutes(anchor.m) : flowMinutes(anchor, now, cycle);
}
export const isPaused = () => paused;
export const isStarted = () => anchor !== null;
/** Changes whenever the whole minute, the pause state or a pick changes (for useSyncExternalStore). */
export const flowVersion = () => version;

export function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => void subs.delete(fn);
}

function tick() {
  if (paused || !anchor) return;
  const r = Math.floor(currentMinutes());
  if (r === lastRound) return;
  lastRound = r;
  emit();
}

function startTimer() {
  if (timer === null && typeof window !== "undefined") timer = setInterval(tick, 250);
}

/** Start (once) and return the starting minute. Safe to call from any route; later calls just return the current minute. */
export function initFlow(): number {
  if (typeof window === "undefined") return 720;
  if (anchor) {
    startTimer();
    return currentMinutes();
  }
  const q = new URLSearchParams(window.location.search);
  const c = Number(q.get("cycle"));
  if (q.has("debug") && Number.isFinite(c) && c > 0) cycle = Math.max(MIN_CYCLE, c);
  paused = resolvePaused(readLS(PAUSE_KEY), window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  let stored: string | null = null;
  try {
    stored = window.sessionStorage.getItem(FLOW_KEY);
  } catch {
    /* storage blocked */
  }
  const d = new Date();
  const start = resolveStart({
    time: q.get("time"),
    theme: q.get("theme"),
    saved: readLS("world-time"),
    legacy: readLS("world-theme"),
    nowMin: d.getHours() * 60 + d.getMinutes(),
    anchor: parseAnchor(stored),
    nowMs: d.getTime(),
    paused,
    cycleMin: cycle,
  });
  anchor = { m: start, at: d.getTime() };
  lastRound = Math.floor(start);
  persistAnchor();
  startTimer();
  return start;
}

/** A manual pick (slider, chip, Now): the cycle carries on from here. `silent` = the caller already applied it (the store). */
export function pick(m: number, silent = false) {
  if (ticking || typeof window === "undefined") return; // the store echoing a tick back
  anchor = { m: wrapMinutes(m), at: Date.now() };
  lastRound = Math.floor(anchor.m);
  persistAnchor();
  if (!silent) emit();
}

export function setPaused(p: boolean) {
  if (!anchor || p === paused) return;
  anchor = { m: currentMinutes(), at: Date.now() };
  paused = p;
  lastRound = Math.floor(anchor.m);
  persistAnchor();
  try {
    window.localStorage.setItem(PAUSE_KEY, p ? "1" : "0");
  } catch {
    /* storage blocked */
  }
  emit();
}

/** Test helper: forget everything. */
export function _resetFlow() {
  anchor = null;
  paused = false;
  cycle = CYCLE_MIN;
  lastRound = -1;
  ticking = false;
  version = 0;
  subs.clear();
  if (timer !== null) clearInterval(timer);
  timer = null;
}
