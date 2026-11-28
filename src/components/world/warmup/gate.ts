// Pure gate for the warm-up: when may the loading screen drop (and the fly-in start)?
// Shaders must be compiled (or the cap reached), a few frames drawn, and (step21a) the number of GPU programs must
// have stopped growing: late-mounting meshes (the avatar's skinned materials, depth passes, weather) link their
// programs on their first draw, which used to land as 100 ms+ frames inside the fly-in.

export const WARMUP_CAP_MS = 1000;
export const WARMUP_FRAMES = 3;
/** Frames in a row with an unchanged program count before the scene counts as settled. */
export const WARMUP_STABLE_FRAMES = 8;
/** Never wait longer than this for the programs to settle (a slow machine still gets in). */
export const WARMUP_HARD_CAP_MS = 3500;
/** ...and for the character's model (GLB fetch + decode on a slow machine). */
export const WARMUP_AVATAR_CAP_MS = 9000;

export function warmupReady(s: { compiled: boolean; elapsedMs: number; frames: number; stableFrames?: number; avatarReady?: boolean }): boolean {
  const compiledOrCapped = s.compiled || s.elapsedMs >= WARMUP_CAP_MS;
  if (!(compiledOrCapped && s.frames >= WARMUP_FRAMES)) return false;
  if (s.avatarReady === false && s.elapsedMs < WARMUP_AVATAR_CAP_MS) return false; // the character's skinned materials are in the scene
  return s.stableFrames === undefined || s.stableFrames >= WARMUP_STABLE_FRAMES || s.elapsedMs >= WARMUP_HARD_CAP_MS;
}
