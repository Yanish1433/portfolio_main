// The lathe profile of a clay pot (0.6 m wide, 0.58 m tall at scale 1), shared by the skill pots
// and the decorative stacks in nepal/Props.tsx.
import * as THREE from "three";
import { lathe } from "../nepal/geom";

/** Shared materials use vertexColors; give the geometry a white colour attribute so instance colours show as they are. */
export function whiteColours<G extends THREE.BufferGeometry>(g: G): G {
  const n = g.attributes.position.count;
  g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return g;
}

export const potGeo = whiteColours(
  lathe(
    [
      [0, 0],
      [0.18, 0],
      [0.27, 0.12],
      [0.3, 0.26],
      [0.22, 0.42],
      [0.13, 0.5],
      [0.15, 0.56],
      [0.13, 0.58],
    ],
    10,
  ),
);
