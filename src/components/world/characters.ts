// Pickable characters. All share one Mixamo-style rig, are auto-scaled to
// 1.7 m and use the same clip names (Idle, Dance).
// Pure data: imported by the server page (existence check) and the client.

export type CharacterId = "clay" | "astro" | "lakhey";

export type Character = {
  id: CharacterId;
  /** Path under /public. */
  file: string;
  label: string;
  labelNe: string;
  /** Picker card title (English part). */
  title: string;
  /** One-line picker description. */
  blurb: string;
  /** Small static picker preview under /public. */
  preview: string;
  /** Procedural gait amplitude scales (skirts and suits swing less). */
  gait: { thigh: number; knee: number; arm: number };
  /** 0..1: how much of the procedural relaxed standing pose replaces the stiff Idle clip. */
  idleRelax: number;
  /** Degrees the upper arms hang down from the T-pose while relaxed (90 = flat against the body). */
  idleArmDown: number;
};

/** Picker order: Lakhey first. */
export const CHARACTERS: Character[] = [
  {
    id: "lakhey",
    file: "/models/lakhey.glb",
    label: "Lakhey",
    labelNe: "लाखे",
    title: "Lakhey, guardian dancer",
    blurb: "A masked Newar festival dancer who guards the town.",
    preview: "/characters/lakhey.webp",
    // The robe would push through itself at full stride.
    gait: { thigh: 0.7, knee: 0.8, arm: 1 },
    // Flared robe: keep the hands clear of it.
    idleRelax: 1,
    idleArmDown: 55,
  },
  {
    id: "clay",
    file: "/models/clay.glb",
    label: "Clay",
    labelNe: "माटो",
    title: "Clay",
    blurb: "A terracotta figure fresh off the Bhaktapur potter's wheel.",
    preview: "/characters/clay.webp",
    gait: { thigh: 1, knee: 1, arm: 1 },
    idleRelax: 1,
    idleArmDown: 62,
  },
  {
    id: "astro",
    file: "/models/astro.glb",
    label: "Astro",
    labelNe: "अन्तरिक्षयात्री",
    title: "Astro",
    blurb: "A space explorer who landed in the square to look around.",
    preview: "/characters/astro.webp",
    gait: { thigh: 0.9, knee: 0.9, arm: 0.9 },
    // Bulky suit: arms a little further out.
    idleRelax: 1,
    idleArmDown: 58,
  },
];

export const characterById = (id: string | null | undefined) => CHARACTERS.find((c) => c.id === id);
