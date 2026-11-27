// Pure gate for the warm-up: when may the loading screen drop (and the fly-in start)?
// Shaders must be compiled (or the cap reached), then a few stable frames drawn.

export const WARMUP_CAP_MS = 1000;
export const WARMUP_FRAMES = 3;

export function warmupReady(s: { compiled: boolean; elapsedMs: number; frames: number }): boolean {
  const compiledOrCapped = s.compiled || s.elapsedMs >= WARMUP_CAP_MS;
  return compiledOrCapped && s.frames >= WARMUP_FRAMES;
}
