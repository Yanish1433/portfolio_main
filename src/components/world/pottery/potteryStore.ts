// Small UI state of the pottery game (the HUD reads it; the 3D side writes it only on phase changes, never per frame).
import { create } from "zustand";
import { emptySave, type PotterySave } from "./save";

export type PotPhase = "off" | "shape" | "firing" | "result" | "placing";

export type PotResult = {
  skill: string;
  /** A project that used this skill (profile.ts), or null: then the card shows no link. */
  project: { id: string; name: string } | null;
  total: number;
  collected: number;
  master: boolean;
};

type PotteryUi = {
  phase: PotPhase;
  /** The shelf + collection (also drives the shelf mesh). */
  save: PotterySave;
  loaded: boolean;
  /** Selected height band while the keyboard is in use (null = pointer mode). */
  band: number | null;
  result: PotResult | null;
  set: (p: Partial<Omit<PotteryUi, "set">>) => void;
};

export const usePottery = create<PotteryUi>((set) => ({
  phase: "off",
  save: emptySave(),
  loaded: false,
  band: null,
  result: null,
  set: (p) => set(p),
}));

/** Controls the HUD buttons call (set by the running game). */
export const potteryCtl = {
  fire: null as null | (() => void),
  place: null as null | (() => void),
  exit: null as null | (() => void),
  openProject: null as null | ((id: string) => void),
};
