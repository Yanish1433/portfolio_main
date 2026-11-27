// Per-frame theme state, outside React. `t` is 0 (day) .. 1 (night), eased;
// ThemeDriver is the only writer. Other per-frame code reads it directly.
import type * as THREE from "three";

export const themeState = {
  /** Linear progress toward the target (0..1). */
  p: 0,
  /** Eased time-of-day: 0 = golden-hour day, 1 = night. */
  t: 0,
  initialised: false,
  /** Goal time of day in minutes (written by the store; ThemeDriver eases toward it). */
  minutes: 720,
  /** Time of day currently shown (eased), minutes. */
  shown: 720,
};

/** Objects whose look follows the theme, registered by the components that own them. */
export const themeTargets = {
  halos: [] as { mat: THREE.PointsMaterial; day: number; night: number }[],
  nightOnly: [] as THREE.Object3D[],
  dayOnly: [] as THREE.Object3D[],
  /** World positions of warm lamps; the 4 nearest to the player get a real point light. */
  lampAnchors: [] as THREE.Vector3[],
  bloom: null as { intensity: number } | null,
  /**
   * Screens and text surfaces that glow softly, brighter at night (no lights): an unlit
   * material gets its colour scaled, a lit one its emissiveIntensity.
   */
  glows: [] as { mat: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial; day: number; night: number }[],
};

export function register<T>(list: T[], item: T) {
  list.push(item);
  return () => {
    const i = list.indexOf(item);
    if (i >= 0) list.splice(i, 1);
  };
}
