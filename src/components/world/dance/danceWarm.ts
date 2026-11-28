// Shared dance clock + warm-up registry (no heavy imports, so both danceFx and danceAura can use it).
import type * as THREE from "three";

/** Read by the dance camera (21a). Updated every frame by the aura. `t` = seconds into the Dance clip. */
export const danceClock = { active: false, t: 0, weight: 0 };

type Warm = () => () => void;
const warmables = new Set<Warm>();
export function registerWarm(w: Warm): () => void {
  warmables.add(w);
  return () => void warmables.delete(w);
}

/**
 * Mount the dance flag, pole, aura and sparks for one `compile`, then remove them again, so the first dance does not
 * hitch on shader compilation. Call once after load (the avatar is in the scene).
 */
export function prewarmDance(renderer: THREE.WebGLRenderer, scene: THREE.Object3D, camera: THREE.Camera): void {
  const undo: (() => void)[] = [];
  for (const w of warmables) undo.push(w());
  try {
    renderer.compile(scene, camera);
  } finally {
    for (const u of undo.reverse()) u();
  }
}
