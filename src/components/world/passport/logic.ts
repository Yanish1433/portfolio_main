// Passport rules (pure, no React): which places stamp, the dwell rule, and the saved-data format.
import type { ZoneId } from "../zones";

export const PLACE_IDS = ["project-hall", "education", "skills-lab", "timeline", "about", "mailbox", "kiosk", "pottery"] as const satisfies readonly ZoneId[];
export type PlaceId = (typeof PLACE_IDS)[number];
export const DWELL_MS = 1500;
export const DANCE_BLOCK_MS = 3000;
export const STORAGE_KEY = "passport:v1";

/** Icons match the guide / mini-map (kiosk has no guide section: the signboard). */
export const PLACE_ICON: Record<PlaceId, string> = {
  "project-hall": "🎬",
  education: "🎓",
  "skills-lab": "☸️",
  timeline: "🛤️",
  about: "🏠",
  mailbox: "✉️",
  kiosk: "🪧",
  pottery: "🏺",
};

/** One ink colour per place (the zone palette, darkened so it reads as stamp ink on cream paper). */
export const PLACE_INK: Record<PlaceId, string> = {
  "project-hall": "#b8741a",
  education: "#a88414",
  "skills-lab": "#b85a2a",
  timeline: "#a8641a",
  about: "#8f6f10",
  mailbox: "#c0392b",
  kiosk: "#2f9c78",
  pottery: "#b8502a",
};

export const isPlace = (id: string | null): id is PlaceId => !!id && (PLACE_IDS as readonly string[]).includes(id);

export type ModeState = { cinema: unknown; cameraMode: string };
/** Cinema, 360 / eagle view (cameraMode != follow) and a recent dance all block stamping. */
export const modeBlocked = (m: ModeState, now: number, danceUntil: number) => !!m.cinema || m.cameraMode !== "follow" || now < danceUntil;

/** True when staying `sinceMs` in `zone` earns a stamp. */
export function shouldStamp(zone: string | null, sinceMs: number, blocked: boolean, stamped: Readonly<Record<string, string>>): boolean {
  return isPlace(zone) && !blocked && sinceMs >= DWELL_MS && !stamped[zone];
}

export type Stamps = Record<string, string>;
export const serialize = (stamps: Stamps) => JSON.stringify({ v: 1, stamps });

/** Corrupt or wrong-version data gives an empty book; unknown places and bad dates are dropped. */
export function parseStamps(raw: string | null): Stamps {
  if (!raw) return {};
  try {
    const d = JSON.parse(raw) as { v?: unknown; stamps?: unknown };
    if (!d || d.v !== 1 || !d.stamps || typeof d.stamps !== "object" || Array.isArray(d.stamps)) return {};
    const out: Stamps = {};
    for (const [k, v] of Object.entries(d.stamps as Record<string, unknown>)) {
      if (isPlace(k) && typeof v === "string" && !Number.isNaN(Date.parse(v))) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export const countStamps = (s: Stamps) => PLACE_IDS.filter((id) => s[id]).length;
export const allCollected = (s: Stamps) => countStamps(s) === PLACE_IDS.length;
