"use client";
// Passport state + the dwell watcher: one zustand subscription and one timeout (no per-frame work).
import { create } from "zustand";
import { useWorld } from "@/store/world";
import { useRobot } from "../robot/robotStore";
import { DANCE_BLOCK_MS, DWELL_MS, PLACE_IDS, STORAGE_KEY, countStamps, isPlace, modeBlocked, parseStamps, serialize, shouldStamp, type Stamps } from "./logic";

type PassportState = {
  stamps: Stamps;
  open: boolean;
  /** Latest stamp (for the toast): `n` changes on every stamp so the animation replays. */
  last: { id: string; n: number } | null;
  setOpen: (open: boolean) => void;
  stamp: (id: string, now?: Date) => boolean;
  load: () => void;
};

const save = (stamps: Stamps) => {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(stamps));
  } catch {
    /* private mode: the stamps still count this visit */
  }
};

let tipped = false; // one robot tip per session
const tipSeen = () => {
  if (tipped) return true;
  try {
    return sessionStorage.getItem("passport-tip") === "1";
  } catch {
    return false;
  }
};

export const usePassport = create<PassportState>((set, get) => ({
  stamps: {},
  open: false,
  last: null,
  setOpen: (open) => set({ open }),
  stamp: (id, now = new Date()) => {
    const { stamps, last } = get();
    if (!isPlace(id) || stamps[id]) return false;
    const next = { ...stamps, [id]: now.toISOString() };
    save(next);
    set({ stamps: next, last: { id, n: (last?.n ?? 0) + 1 } });
    const left = PLACE_IDS.length - countStamps(next);
    if (left > 0 && !tipSeen()) {
      tipped = true;
      try {
        sessionStorage.setItem("passport-tip", "1");
      } catch {
        /* the module flag still holds */
      }
      useRobot.getState().say(`${left} ${left === 1 ? "place" : "places"} left to stamp in your passport.`);
    }
    return true;
  },
  load: () => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* blocked storage */
    }
    set({ stamps: parseStamps(raw) });
  },
}));

/** Start watching the world; returns the stop function. Call once, client-side. */
export function startDwellWatcher(): () => void {
  let timer: number | undefined;
  let since = 0;
  let danceUntil = 0;
  const clear = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
  };
  const arm = () => {
    clear();
    const w = useWorld.getState();
    const zone = w.activeZone;
    if (!isPlace(zone) || usePassport.getState().stamps[zone]) return;
    if (!since) since = performance.now();
    const wait = Math.max(DWELL_MS - (performance.now() - since), 0);
    timer = window.setTimeout(() => {
      const s = useWorld.getState();
      const now = performance.now();
      if (s.activeZone !== zone) return;
      if (shouldStamp(zone, now - since, modeBlocked(s, now, danceUntil), usePassport.getState().stamps)) usePassport.getState().stamp(zone);
      else if (!usePassport.getState().stamps[zone]) timer = window.setTimeout(arm, 400); // blocked (cinema / 360 / dance): try again while the visitor is still here
    }, wait + 20);
  };
  let prevZone = useWorld.getState().activeZone;
  let prevDance = useWorld.getState().danceSeq;
  const unsub = useWorld.subscribe((s) => {
    if (s.danceSeq !== prevDance) {
      prevDance = s.danceSeq;
      danceUntil = performance.now() + DANCE_BLOCK_MS;
    }
    if (s.activeZone !== prevZone) {
      prevZone = s.activeZone;
      since = 0;
      arm();
    }
  });
  arm();
  return () => {
    unsub();
    clear();
  };
}
