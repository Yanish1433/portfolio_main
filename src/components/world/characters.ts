// The playable character: Lakhey, the masked Newar festival dancer. One Mixamo-style rig, auto-scaled to
// AVATAR_HEIGHT (1.7 m x AVATAR_SCALE), clips Idle / Walk / Run / Dance (built in Blender: blender/scripts/clips.py).
// Pure data and helpers: imported by the server page (existence check), the client and the tests.

export type CharacterId = "lakhey";

export type Character = {
  id: CharacterId;
  /** Path under /public. */
  file: string;
  label: string;
  labelNe: string;
  /** Procedural gait amplitude scales: only used if the Walk / Run clips are missing from the model. */
  gait: { thigh: number; knee: number; arm: number };
  /** 0..1: how much of the procedural relaxed standing pose replaces the stiff Idle clip. */
  idleRelax: number;
  /** Degrees the upper arms hang down from the T-pose while relaxed (90 = flat against the body). */
  idleArmDown: number;
};

export const CHARACTERS: Character[] = [
  {
    id: "lakhey",
    file: "/models/lakhey.glb",
    label: "Lakhey",
    labelNe: "लाखे",
    // The robe would push through itself at full stride.
    gait: { thigh: 0.7, knee: 0.8, arm: 1 },
    // Flared robe: keep the hands clear of it.
    idleRelax: 1,
    idleArmDown: 55,
  },
];

/**
 * ONE number for how big Lakhey is on screen (step13b: +22 % so the avatar reads next to the bigger
 * halls). The model is auto-scaled to AVATAR_HEIGHT; everything that depends on the avatar's size reads
 * it from here: Avatar.tsx (the scale), Player.tsx (camera target height), cameraRig.shoulderPose
 * (head height) and the occlusion dither radius in nepal/ThemeDriver.tsx. Collision (nav.ts
 * AVATAR_RADIUS 0.45) stays: it was already wider than the body, and the doors / gates have room.
 */
export const AVATAR_SCALE = 1.22;
export const AVATAR_BASE_HEIGHT = 1.7;
export const AVATAR_HEIGHT = AVATAR_BASE_HEIGHT * AVATAR_SCALE;

export const characterById = (id: string | null | undefined) => CHARACTERS.find((c) => c.id === id);

/**
 * Walk / Run loops as authored in Blender (in place). `speed` is the ground speed the legs cover at
 * playback rate 1, measured from the planted foot, in the MODEL's own metres per second (the avatar is
 * scaled to 1.7 m afterwards, so multiply by that scale to get world speed). Re-measure with
 * `blender --python blender/scripts/make_lakhey.py -- --stage clips` (it logs `ground_speed`) after
 * changing the clips.
 */
export const GAIT_CLIPS = {
  walk: { name: "Walk", duration: 32 / 30, speed: 1.2438 },
  run: { name: "Run", duration: 21 / 30, speed: 4.2811 },
} as const;

/** Playback rate that makes a clip's feet travel at `speed` world m/s (no sliding). */
export function clipTimeScale(speed: number, clipSpeed: number, scale: number): number {
  const v = clipSpeed * scale;
  return v > 1e-6 ? Math.max(0, speed) / v : 0;
}

/**
 * Gait cycles per second for a Walk <-> Run blend (`run` 0..1). Walk and Run are phase-locked, so both
 * clips share one phase; the stride (model metres per cycle) is blended with the weights.
 */
export function gaitCycleRate(speed: number, scale: number, run: number): number {
  const r = Math.min(1, Math.max(0, run));
  const walk = GAIT_CLIPS.walk.speed * GAIT_CLIPS.walk.duration;
  const runStride = GAIT_CLIPS.run.speed * GAIT_CLIPS.run.duration;
  const stride = walk + (runStride - walk) * r;
  return stride * scale > 1e-6 ? Math.max(0, speed) / (stride * scale) : 0;
}
