// Small geometry helpers shared by the dalan and the pathshala parts.
import * as THREE from "three";
import { Parts, box } from "../nepal/geom";

/** A sloping slab (box tilted about x) from (z0, y0) at the back to (z1, y1) at the front. */
export function slope(P: Parts, key: "roof" | "wood", x: number, w: number, z0: number, y0: number, z1: number, y1: number, thick: number, color: string) {
  const len = Math.hypot(z1 - z0, y1 - y0);
  const g = box(w, thick, len);
  const m = new THREE.Matrix4().makeRotationX(Math.atan2(y0 - y1, z1 - z0));
  m.setPosition(x, (y0 + y1) / 2, (z0 + z1) / 2);
  P.add(key, g, color, m);
}
