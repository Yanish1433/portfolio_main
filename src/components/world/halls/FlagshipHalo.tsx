"use client";

// The flagship stand's "soft spotlight": no light source, just one additive mesh (1 draw call)
// with a warm rim glow around its screen and a pool of light on the floor in front of it.
// Brighter at night; it breathes gently unless reduced motion is on.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { themeState } from "../nepal/themeState";
import { STANDS } from "./layout";
import { merge, quad, at } from "./three";
import { debugHidden } from "./spots";

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function FlagshipHalo({ reducedMotion }: { reducedMotion: boolean }) {
  const stand = STANDS.find((s) => s.flagship);
  const built = useMemo(() => {
    if (!stand) return null;
    const sc = stand.screen;
    const full: [number, number, number, number] = [0, 0, 1, 1];
    const rim = quad(sc.w + 0.55, sc.h + 0.55, at(stand.x, sc.y, stand.z + 0.02), full);
    const pool = quad(stand.w + 1.0, 1.5, new THREE.Matrix4().makeRotationX(-Math.PI / 2).premultiply(at(stand.x, 0.035, stand.spot.ring[1])), full);
    const geo = merge([rim, pool]);
    const mat = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: new THREE.Color("#ffc46b"),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    return { geo, mat };
  }, [stand]);
  const mesh = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!built) return;
    const t = themeState.t;
    const breathe = reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 1.3) * 0.06;
    built.mat.opacity = 0.42 + 0.33 * t + breathe;
    if (mesh.current) mesh.current.visible = !debugHidden.has("halo");
  });
  useEffect(
    () => () => {
      built?.geo.dispose();
      built?.mat.map?.dispose();
      built?.mat.dispose();
    },
    [built],
  );
  if (!built) return null;
  return <mesh ref={mesh} geometry={built.geo} material={built.mat} renderOrder={3} />;
}
