// The saved shelf: the last 8 pots (shape + skill) and every skill collected so far. Versioned; corrupt data resets.
import { BANDS, clampClay, type Clay } from "./clayProfile";

export const SAVE_KEY = "pottery-v1";
export const SHELF_MAX = 8;

export type SavedPot = { r: number[]; h: number; skill: string };
export type PotterySave = { v: 1; pots: SavedPot[]; collected: string[] };

export const emptySave = (): PotterySave => ({ v: 1, pots: [], collected: [] });

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function cleanPot(p: unknown): SavedPot | null {
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  if (!Array.isArray(o.r) || o.r.length !== BANDS || typeof o.skill !== "string" || !o.skill.trim() || o.skill.length > 60) return null;
  if (!o.r.every((n) => typeof n === "number" && Number.isFinite(n)) || typeof o.h !== "number" || !Number.isFinite(o.h)) return null;
  const c = clampClay({ r: [...(o.r as number[])], h: o.h });
  return { r: c.r.map(round3), h: round3(c.h), skill: o.skill.trim() };
}

/** Parse stored text; anything wrong (not JSON, wrong version) gives an empty save, bad pots are dropped. */
export function parseSave(raw: string | null | undefined): PotterySave {
  if (!raw) return emptySave();
  try {
    const d = JSON.parse(raw) as Record<string, unknown> | null;
    if (!d || typeof d !== "object" || d.v !== 1 || !Array.isArray(d.pots) || !Array.isArray(d.collected)) return emptySave();
    const pots = d.pots.map(cleanPot).filter((p): p is SavedPot => !!p).slice(-SHELF_MAX);
    const collected = [...new Set(d.collected.filter((s): s is string => typeof s === "string" && !!s.trim() && s.length <= 60).map((s) => s.trim()))];
    for (const p of pots) if (!collected.includes(p.skill)) collected.push(p.skill);
    return { v: 1, pots, collected };
  } catch {
    return emptySave();
  }
}

/** A new save with `clay` + `skill` added (the shelf keeps the newest 8; the collection keeps everything). */
export function addPot(s: PotterySave, clay: Clay, skill: string): PotterySave {
  const pot: SavedPot = { r: clay.r.map(round3), h: round3(clay.h), skill };
  return { v: 1, pots: [...s.pots, pot].slice(-SHELF_MAX), collected: s.collected.includes(skill) ? s.collected : [...s.collected, skill] };
}

type Store = Pick<Storage, "getItem" | "setItem">;

export function loadSave(storage?: Store): PotterySave {
  try {
    const st = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    return st ? parseSave(st.getItem(SAVE_KEY)) : emptySave();
  } catch {
    return emptySave();
  }
}

export function storeSave(s: PotterySave, storage?: Store): boolean {
  try {
    const st = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    if (!st) return false;
    st.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
