// three.js helpers for the hall atlases (one CanvasTexture per zone, quads with baked UVs).
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { pack, type Rect } from "./atlas";

export const ATLAS_W = 2048;

export type Atlas = { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; rects: Rect[]; tex: THREE.CanvasTexture };

export function makeAtlas(sizes: [number, number][]): Atlas {
  const { rects, height } = pack(sizes, ATLAS_W);
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_W;
  canvas.height = height;
  const g = canvas.getContext("2d")!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { canvas, g, rects, tex };
}

/** A quad (facing +z before `m`) with its UVs baked to one atlas cell. */
export function quad(w: number, h: number, m: THREE.Matrix4, uv: [number, number, number, number]) {
  const g = new THREE.PlaneGeometry(w, h);
  const a = g.attributes.uv;
  for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * uv[2], uv[1] + a.getY(i) * uv[3]);
  g.applyMatrix4(m);
  return g;
}

export function merge(list: THREE.BufferGeometry[]) {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  for (const g of list) {
    const ng = g.index ? g.toNonIndexed() : g;
    pos.push(...(ng.attributes.position.array as Float32Array));
    nrm.push(...(ng.attributes.normal.array as Float32Array));
    uv.push(...(ng.attributes.uv.array as Float32Array));
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

export const at = (x: number, y: number, z: number, yaw = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));

export function useAnisotropy(tex: THREE.Texture) {
  const { gl } = useThree();
  useEffect(() => {
    tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    tex.needsUpdate = true;
  }, [gl, tex]);
}

/** Redraw once more after every font face has settled (cheap; usually a no-op visually). */
export function useFontsSettled(redraw: () => void) {
  useEffect(() => {
    let live = true;
    document.fonts?.ready.then(() => live && redraw()).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [redraw]);
}

export const cursor = (v: string) => () => {
  document.body.style.cursor = v;
};

