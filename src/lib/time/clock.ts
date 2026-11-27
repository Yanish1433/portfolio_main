// The one shared clock rule for pages without a 3D store: same order as store/world initialMinutes().
//   ?time=HH:MM -> ?theme=day|night (12:00 / 22:00) -> saved "world-time" (minutes or "now"; legacy "world-theme") -> local time.
// The pre-paint script (timeScript.ts) is the same rule written as plain JS. A test keeps them equal.
import { parseTime, themeAt, timeToLook, wrapMinutes } from "@/components/world/nepal/timeLook";
import type { Theme } from "@/components/world/nepal/timeLook";

export const TIME_KEY = "world-time";
export const DAY_AT = 12 * 60;
export const NIGHT_AT = 22 * 60;

export type ClockInput = { time?: string | null; theme?: string | null; saved?: string | null; legacy?: string | null; now: number };

export function resolveMinutes(i: ClockInput): number {
  const qt = parseTime(i.time);
  if (qt !== null) return qt;
  if (i.theme === "day") return DAY_AT;
  if (i.theme === "night") return NIGHT_AT;
  const s = i.saved;
  if (s && s !== "now") {
    const n = Number(s);
    if (Number.isFinite(n)) return wrapMinutes(Math.round(n));
  } else if (!s) {
    if (i.legacy === "day") return DAY_AT;
    if (i.legacy === "night") return NIGHT_AT;
  }
  return i.now;
}

/** Browser: read the clock the same way the town does. */
export function readMinutes(): number {
  const d = new Date();
  const now = d.getHours() * 60 + d.getMinutes();
  const q = new URLSearchParams(window.location.search);
  let saved: string | null = null;
  let legacy: string | null = null;
  try {
    saved = window.localStorage.getItem(TIME_KEY);
    legacy = window.localStorage.getItem("world-theme");
  } catch {
    /* storage blocked */
  }
  return resolveMinutes({ time: q.get("time"), theme: q.get("theme"), saved, legacy, now });
}

export function saveMinutes(m: number | null) {
  try {
    window.localStorage.setItem(TIME_KEY, m === null ? "now" : String(Math.round(m)));
  } catch {
    /* ignore */
  }
}

/** What a page needs from a time: day/night word and glow strength. */
export function lookOf(minutes: number): { theme: Theme; glow: number } {
  return { theme: themeAt(minutes), glow: timeToLook(minutes).t };
}

export type Tod = "morning" | "day" | "evening" | "night";

/** Four looks for pictures: morning 05:30-10:00, day 10:00-16:30, evening 16:30-19:15, night otherwise. timeScript.ts repeats it inline. */
export function todAt(minutes: number): Tod {
  const m = wrapMinutes(Math.round(minutes));
  if (m >= 330 && m < 600) return "morning";
  if (m >= 600 && m < 990) return "day";
  if (m >= 990 && m < 1155) return "evening";
  return "night";
}

/** Put a time on a wrapper element (data-theme, data-tod, --glow) and tell listeners. */
export function applyClock(el: HTMLElement | null, minutes: number) {
  const { theme, glow } = lookOf(minutes);
  if (el) {
    el.dataset.theme = theme;
    el.dataset.tod = todAt(minutes);
    el.style.setProperty("--glow", glow.toFixed(3));
  }
  document.documentElement.dataset.theme = theme === "night" ? "dark" : "light";
  window.dispatchEvent(new CustomEvent("world-time", { detail: minutes }));
}
