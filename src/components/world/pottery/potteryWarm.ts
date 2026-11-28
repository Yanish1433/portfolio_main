// Pre-compile the pottery game's materials at load, so the first "Make a pot" does not hitch on a shader link.
// Same pattern as dance/danceWarm.ts: the (hidden) game meshes register a function that shows them, then Warmup calls this
// once after the avatar is in: it shows them, runs one `compile`, and hides them again.
import type * as THREE from "three";

type Warm = () => () => void;
const warmables = new Set<Warm>();

export function registerPotteryWarm(w: Warm): () => void {
  warmables.add(w);
  return () => void warmables.delete(w);
}

export function prewarmPottery(renderer: THREE.WebGLRenderer, scene: THREE.Object3D, camera: THREE.Camera): void {
  if (!warmables.size) return;
  const undo: (() => void)[] = [];
  for (const w of warmables) undo.push(w());
  try {
    renderer.compile(scene, camera);
  } finally {
    for (const u of undo.reverse()) u();
  }
}
