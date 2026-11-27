// Pure time-of-day look: minutes since midnight -> every colour/intensity ThemeDriver sets,
// plus the sun direction. No THREE here (colours are linear-sRGB triples) so it is unit-testable.

export type RGB = [number, number, number];

export type Look = {
  /** Night amount 0 (day) .. 1 (night): drives windows, lamps, stars, halos (the old eased `t`). */
  t: number;
  sun: RGB;
  sunI: number;
  hemiSky: RGB;
  hemiGround: RGB;
  hemiI: number;
  fog: RGB;
  skyTop: RGB;
  skyMid: RGB;
  skyHorizon: RGB;
  cloud: RGB;
  /** Unit vector toward the sun (x east+, y up, z). Used by the sky disc; y < 0 = below horizon. */
  sunDir: RGB;
  /** Directional-light offset from the player (lerp toward moonlight is already applied). */
  lightOff: RGB;
};

export const DAY_MINUTES = 24 * 60;

function lin(hex: string): RGB {
  const f = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [f(1), f(3), f(5)];
}

type Key = {
  at: number; // minutes
  t: number;
  sun: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  fog: string;
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  cloud: string;
};

const h = (hh: number, mm = 0) => hh * 60 + mm;

const NIGHT: Omit<Key, "at"> = {
  t: 1,
  sun: "#a8bcff",
  sunI: 0.85,
  hemiSky: "#3b5597",
  hemiGround: "#2a1c22",
  hemiI: 0.55,
  fog: "#17244a",
  skyTop: "#14204a",
  skyMid: "#3a3a70",
  skyHorizon: "#8a5a78",
  cloud: "#5a6aa0",
};

/** Ordered keyframes, first at 00:00 and last at 24:00 (= the first, so the day wraps without a seam). */
export const KEYS: Key[] = [
  { at: h(0), ...NIGHT },
  { at: h(4, 30), ...NIGHT },
  // dawn, warm pink
  { at: h(5, 30), t: 0.8, sun: "#ff9a88", sunI: 1.0, hemiSky: "#8a7aa8", hemiGround: "#3a2a38", hemiI: 0.6, fog: "#8a6c88", skyTop: "#1c2850", skyMid: "#5a4a7a", skyHorizon: "#d88a8a", cloud: "#b08aa0" },
  { at: h(6, 15), t: 0.3, sun: "#ffa890", sunI: 2.0, hemiSky: "#ffc4b8", hemiGround: "#6a4a52", hemiI: 0.8, fog: "#e8b8a8", skyTop: "#6c7fb8", skyMid: "#d6a9b8", skyHorizon: "#ffb596", cloud: "#ffd0c0" },
  // morning
  { at: h(7, 30), t: 0, sun: "#ffe2b8", sunI: 3.0, hemiSky: "#fff0d8", hemiGround: "#8a6648", hemiI: 1.0, fog: "#e8dcc8", skyTop: "#4a82c4", skyMid: "#9cc4e6", skyHorizon: "#f3e2cc", cloud: "#fff8ee" },
  // midday
  { at: h(12), t: 0, sun: "#fff3e0", sunI: 3.2, hemiSky: "#e6f0ff", hemiGround: "#7a6a55", hemiI: 1.05, fog: "#dce8ef", skyTop: "#2f6bc0", skyMid: "#7fb4e8", skyHorizon: "#dbe9f3", cloud: "#ffffff" },
  { at: h(15, 30), t: 0, sun: "#ffe0b0", sunI: 3.1, hemiSky: "#fff0d4", hemiGround: "#82603f", hemiI: 1.0, fog: "#e6d8c2", skyTop: "#3a74c0", skyMid: "#8ab8e2", skyHorizon: "#f2dcc0", cloud: "#fff6ea" },
  // golden hour (the original day look)
  { at: h(17, 30), t: 0, sun: "#ffc68a", sunI: 3.0, hemiSky: "#ffe1bd", hemiGround: "#8a5a3c", hemiI: 1.0, fog: "#ecd3b6", skyTop: "#3f78c0", skyMid: "#8fbbe3", skyHorizon: "#f6dcc0", cloud: "#fff4e6" },
  // dusk
  { at: h(18, 30), t: 0.4, sun: "#ff8a5a", sunI: 1.6, hemiSky: "#f0a890", hemiGround: "#5a3a40", hemiI: 0.85, fog: "#c89488", skyTop: "#3a4a8a", skyMid: "#b57aa0", skyHorizon: "#ff8f5a", cloud: "#ffb090" },
  { at: h(19, 15), t: 0.85, sun: "#b89cff", sunI: 0.95, hemiSky: "#5a5a98", hemiGround: "#2e2030", hemiI: 0.6, fog: "#3a3560", skyTop: "#14204a", skyMid: "#3a3a70", skyHorizon: "#8a5a78", cloud: "#8a6a9a" },
  { at: h(20, 15), ...NIGHT },
  { at: h(24), ...NIGHT },
];

const PARSED = KEYS.map((k) => ({
  at: k.at,
  t: k.t,
  sunI: k.sunI,
  hemiI: k.hemiI,
  sun: lin(k.sun),
  hemiSky: lin(k.hemiSky),
  hemiGround: lin(k.hemiGround),
  fog: lin(k.fog),
  skyTop: lin(k.skyTop),
  skyMid: lin(k.skyMid),
  skyHorizon: lin(k.skyHorizon),
  cloud: lin(k.cloud),
}));

const MOON_OFF: RGB = [14, 22, 12];

const mixN = (a: number, b: number, k: number) => a + (b - a) * k;
const mixC = (a: RGB, b: RGB, k: number): RGB => [mixN(a[0], b[0], k), mixN(a[1], b[1], k), mixN(a[2], b[2], k)];

/** Wrap any number of minutes into [0, 1440). */
export function wrapMinutes(m: number): number {
  return ((m % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
}

/** Sun direction: rises east ~06:00, sets west ~18:30; below the horizon at night. */
export function sunDirection(minutes: number): RGB {
  const m = wrapMinutes(minutes);
  const u = (m - h(6)) / (h(18, 30) - h(6)); // 0..1 across the day arc
  const a = Math.PI * Math.min(Math.max(u, -0.25), 1.25);
  const x = Math.cos(a) * 0.8;
  const y = Math.sin(a);
  const z = -0.55;
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

export function timeToLook(minutes: number): Look {
  const m = wrapMinutes(minutes);
  let i = 0;
  while (i < PARSED.length - 2 && m >= PARSED[i + 1].at) i++;
  const a = PARSED[i];
  const b = PARSED[i + 1];
  const raw = (m - a.at) / (b.at - a.at);
  const k = raw * raw * (3 - 2 * raw);
  const t = mixN(a.t, b.t, k);
  const sd = sunDirection(m);
  const day: RGB = [sd[0] * 24, 7 + 19 * Math.max(sd[1], 0.15), 14];
  return {
    t,
    sun: mixC(a.sun, b.sun, k),
    sunI: mixN(a.sunI, b.sunI, k),
    hemiSky: mixC(a.hemiSky, b.hemiSky, k),
    hemiGround: mixC(a.hemiGround, b.hemiGround, k),
    hemiI: mixN(a.hemiI, b.hemiI, k),
    fog: mixC(a.fog, b.fog, k),
    skyTop: mixC(a.skyTop, b.skyTop, k),
    skyMid: mixC(a.skyMid, b.skyMid, k),
    skyHorizon: mixC(a.skyHorizon, b.skyHorizon, k),
    cloud: mixC(a.cloud, b.cloud, k),
    sunDir: sd,
    lightOff: mixC(day, MOON_OFF, t),
  };
}

// ---- theme derivation (HTML data-theme) ----
export const NIGHT_FROM = h(18, 45);
export const DAY_FROM = h(6, 15);
const DEAD = 10;

export type Theme = "day" | "night";

/** Plain threshold (first paint, no history): night from 18:45 until 06:15. */
export function themeAt(minutes: number): Theme {
  const m = wrapMinutes(minutes);
  return m >= NIGHT_FROM || m < DAY_FROM ? "night" : "day";
}

/** Same, with a ±10 min dead band so dragging across dusk/dawn does not flicker the UI. */
export function deriveTheme(minutes: number, prev: Theme): Theme {
  const m = wrapMinutes(minutes);
  if (prev === "day") return m >= NIGHT_FROM + DEAD || m < DAY_FROM - DEAD ? "night" : "day";
  return m >= DAY_FROM + DEAD && m < NIGHT_FROM - DEAD ? "day" : "night";
}

// ---- helpers for the control / URL ----
/** "HH:MM" (also "H:MM") -> minutes, or null. */
export function parseTime(s: string | null | undefined): number | null {
  const mt = /^(\d{1,2}):(\d{2})$/.exec((s ?? "").trim());
  if (!mt) return null;
  const hh = Number(mt[1]);
  const mm = Number(mt[2]);
  return hh < 24 && mm < 60 ? hh * 60 + mm : null;
}

/** 402 -> "6:42 am". */
export function formatTime(minutes: number): string {
  const m = Math.round(wrapMinutes(minutes)) % DAY_MINUTES;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "am" : "pm"}`;
}

/** Small emoji for the pill. */
export function timeIcon(minutes: number): string {
  const m = wrapMinutes(minutes);
  if (m >= h(5) && m < h(7, 30)) return "🌅";
  if (m >= h(7, 30) && m < h(16, 30)) return "☀️";
  if (m >= h(16, 30) && m < h(19, 30)) return "🌇";
  return "🌙";
}

export const QUICK_TIMES = [
  { id: "morning", label: "Morning", minutes: h(8) },
  { id: "day", label: "Day", minutes: h(12) },
  { id: "evening", label: "Evening", minutes: h(18) },
  { id: "night", label: "Night", minutes: h(22) },
] as const;
