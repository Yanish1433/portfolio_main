// The game's 3D objects, created once at load (hidden): the clay on the wheel and the particle sprites. They exist eagerly so
// their materials are compiled during loading (potteryWarm.ts); the game code itself (PotteryGame.tsx) is lazy and only drives them.
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { SEG, SEG_LITE, ClayGeometry } from "./clayGeometry";
import { createClayMaterial, createPointsMaterial, type ClayMaterial } from "./clayMaterial";
import { Particles } from "./particles";
import { WHEEL } from "./layout";

export type Rig = {
  lite: boolean;
  clay: THREE.Mesh;
  geo: ClayGeometry;
  mat: ClayMaterial;
  decalCanvas: HTMLCanvasElement | null;
  decal: THREE.CanvasTexture | null;
  points: THREE.Points;
  particles: Particles;
  pointsMat: THREE.ShaderMaterial;
  /** Set by the running game: a press on the clay. */
  onDown: ((e: ThreeEvent<PointerEvent>) => void) | null;
  dispose: () => void;
};

export const canvasTexture = (w: number, h: number): { canvas: HTMLCanvasElement | null; tex: THREE.CanvasTexture | null } => {
  if (typeof document === "undefined") return { canvas: null, tex: null };
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  // transparent: the canvas holds only the round medallion (its alpha is the decal mask)
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return { canvas, tex };
};

export function createRig(lite: boolean): Rig {
  const geo = new ClayGeometry(lite ? SEG_LITE : SEG, 1);
  const { canvas, tex } = canvasTexture(256, 256);
  const mat = createClayMaterial({ lite, map: tex ?? new THREE.Texture(), wet: 0.9 });
  mat.color.set("#9b765f");
  const clay = new THREE.Mesh(geo.geometry, mat);
  clay.name = "pottery-clay";
  clay.position.set(WHEEL.x, WHEEL.headY, WHEEL.z);
  clay.frustumCulled = false;
  clay.castShadow = false;
  clay.receiveShadow = true;
  clay.visible = false;
  // never catch a ray while hidden
  clay.raycast = function (rc, hits) {
    if (this.visible) THREE.Mesh.prototype.raycast.call(this, rc, hits);
  };
  const particles = new Particles();
  const pointsMat = createPointsMaterial();
  const points = new THREE.Points(particles.geometry, pointsMat);
  points.name = "pottery-fx";
  points.frustumCulled = false;
  points.renderOrder = 6;
  points.visible = false;
  points.raycast = () => {};
  const rig: Rig = {
    lite,
    clay,
    geo,
    mat,
    decalCanvas: canvas,
    decal: tex,
    points,
    particles,
    pointsMat,
    onDown: null,
    dispose: () => {
      geo.geometry.dispose();
      mat.dispose();
      tex?.dispose();
      particles.geometry.dispose();
      pointsMat.dispose();
    },
  };
  return rig;
}

/** The live rig (set by Pottery.tsx) for the lazily loaded game. */
export const rigRef: { current: Rig | null } = { current: null };
