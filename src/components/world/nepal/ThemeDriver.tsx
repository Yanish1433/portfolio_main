"use client";

// Light rig + the single per-frame driver of day/night. The light COUNT never
// changes (1 directional, 1 hemisphere, 4 shadowless point lights): only
// colours, positions and intensities are animated, so no shader recompiles.
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { playerPos } from "../input";
import { useWorld } from "@/store/world";
import { getEnvironment, getMaterials, occlusion, timeUniform } from "./materials";
import { skyUniforms } from "./Sky";
import { themeState, themeTargets } from "./themeState";
import { charMaterials, charRim } from "../lookdev";

const POOL = 4;
const DUR = 2; // seconds for a full blend

const C = (c: string) => new THREE.Color(c);
const DAY = {
  sun: C("#ffc68a"),
  sunI: 3.0,
  sunOff: new THREE.Vector3(-20, 13, 15),
  hemiSky: C("#ffe1bd"),
  hemiGround: C("#8a5a3c"),
  hemiI: 1.0,
  fog: C("#f0cda4"),
  window: 0,
  gold: 0,
  env: 1.0,
  lamp: 0,
  bloom: 0.2,
  flame: C("#ffb347").multiplyScalar(0.9),
};
const NIGHT = {
  sun: C("#a8bcff"),
  sunI: 0.85,
  sunOff: new THREE.Vector3(14, 22, 12),
  hemiSky: C("#3b5597"),
  hemiGround: C("#2a1c22"),
  hemiI: 0.55,
  fog: C("#17244a"),
  window: 1,
  gold: 0.55,
  env: 0.35,
  lamp: 9,
  bloom: 1.0,
  flame: C("#ffb347").multiplyScalar(3.2),
};

// Character rim ("backlight"): warm gold by day, moon-blue with a faint lantern tint at night.
const RIM_DAY = C("#ffcf8a");
const RIM_NIGHT = C("#8fb4ff").lerp(C("#ffb070"), 0.15);
const RIM_DAY_I = 0.35;
const RIM_NIGHT_I = 0.3;

const _col = new THREE.Color();
const _v = new THREE.Vector3();
const _buf = new THREE.Vector2();

export default function ThemeDriver({
  shadows,
  reducedMotion,
  hiShadow = false,
}: {
  shadows: boolean;
  reducedMotion: boolean;
  /** Desktop: 2048 shadow map for a crisp character self-shadow. */
  hiShadow?: boolean;
}) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const target = useRef<THREE.Object3D>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const points = useRef<(THREE.PointLight | null)[]>([]);
  const lastPool = useRef(-1);
  const { gl, scene } = useThree();
  const m = getMaterials();

  useEffect(() => {
    if (sun.current && target.current) sun.current.target = target.current;
    const env = getEnvironment(gl);
    m.gold.envMap = env;
    m.water.envMap = env;
    m.gold.needsUpdate = true;
    m.water.needsUpdate = true;
    if (new URLSearchParams(window.location.search).has("debug")) (window as unknown as { __occl?: unknown }).__occl = occlusion.value;
    scene.fog = new THREE.Fog(DAY.fog.clone(), 38, 125);
    scene.background = DAY.fog.clone();
    return () => {
      scene.fog = null;
    };
  }, [gl, scene, m]);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const goal = useWorld.getState().theme === "night" ? 1 : 0;
    if (!themeState.initialised || reducedMotion) {
      themeState.p = goal;
      themeState.initialised = true;
    } else {
      const step = dt / DUR;
      themeState.p += THREE.MathUtils.clamp(goal - themeState.p, -step, step);
    }
    const p = themeState.p;
    const t = p * p * (3 - 2 * p);
    themeState.t = t;
    const L = (a: number, b: number) => a + (b - a) * t;
    timeUniform.value = reducedMotion ? 0 : state.clock.elapsedTime;

    // sun <-> moon
    if (sun.current && target.current) {
      target.current.position.set(playerPos.x, 0, playerPos.z);
      _v.lerpVectors(DAY.sunOff, NIGHT.sunOff, t);
      sun.current.position.set(playerPos.x + _v.x, _v.y, playerPos.z + _v.z);
      sun.current.color.lerpColors(DAY.sun, NIGHT.sun, t);
      sun.current.intensity = L(DAY.sunI, NIGHT.sunI);
    }
    if (hemi.current) {
      hemi.current.color.lerpColors(DAY.hemiSky, NIGHT.hemiSky, t);
      hemi.current.groundColor.lerpColors(DAY.hemiGround, NIGHT.hemiGround, t);
      hemi.current.intensity = L(DAY.hemiI, NIGHT.hemiI);
    }
    _col.lerpColors(DAY.fog, NIGHT.fog, t);
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(_col);
    if (scene.background instanceof THREE.Color) scene.background.copy(_col);
    skyUniforms.uT.value = t;
    skyUniforms.uFog.value.copy(_col);

    // emissive materials
    (m.window as THREE.ShaderMaterial).uniforms.uT.value = t;
    m.gold.emissiveIntensity = L(DAY.gold, NIGHT.gold);
    m.gold.envMapIntensity = L(DAY.env, NIGHT.env);
    m.flame.color.lerpColors(DAY.flame, NIGHT.flame, t);
    m.flame.visible = t > 0.02;
    for (const h of themeTargets.halos) {
      h.mat.opacity = L(h.day, h.night);
      h.mat.visible = h.mat.opacity > 0.01;
    }
    for (const o of themeTargets.nightOnly) o.visible = t > 0.5;
    for (const o of themeTargets.dayOnly) o.visible = t <= 0.5;
    if (themeTargets.bloom) themeTargets.bloom.intensity = L(DAY.bloom, NIGHT.bloom);
    for (const g of themeTargets.glows) {
      const k = L(g.day, g.night);
      if (g.mat instanceof THREE.MeshStandardMaterial) g.mat.emissiveIntensity = k;
      else g.mat.color.setScalar(k);
    }

    // character look-dev
    charRim.uRimColor.value.lerpColors(RIM_DAY, RIM_NIGHT, t);
    charRim.uRimInt.value = L(RIM_DAY_I, RIM_NIGHT_I);
    for (const c of charMaterials) c.mat.envMapIntensity = L(c.day, c.night);

    // pooled point lights at the lamps nearest the player (re-picked ~4x/s)
    const anchors = themeTargets.lampAnchors;
    const now = state.clock.elapsedTime;
    if (anchors.length && now - lastPool.current > 0.25) {
      lastPool.current = now;
      const sorted = anchors
        .map((a) => ({ a, d: (a.x - playerPos.x) ** 2 + (a.z - playerPos.z) ** 2 }))
        .sort((x, y) => x.d - y.d)
        .slice(0, POOL);
      sorted.forEach(({ a }, i) => points.current[i]?.position.set(a.x, a.y + 0.25, a.z));
    }
    const flicker = reducedMotion ? 1 : 1 + Math.sin(now * 11) * 0.05;
    for (const pl of points.current) if (pl) pl.intensity = L(DAY.lamp, NIGHT.lamp) * flicker;

    // see-through circle around the avatar for the occlusion dither
    gl.getDrawingBufferSize(_buf);
    const viewDepth = _v.set(playerPos.x, 0.95, playerPos.z).applyMatrix4(state.camera.matrixWorldInverse).z;
    _v.set(playerPos.x, 0.95, playerPos.z).project(state.camera);
    occlusion.value.set((_v.x * 0.5 + 0.5) * _buf.x, (_v.y * 0.5 + 0.5) * _buf.y, _buf.y * 0.13, -viewDepth);
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={[DAY.hemiSky, DAY.hemiGround, DAY.hemiI]} />
      <directionalLight
        ref={sun}
        color={DAY.sun}
        intensity={DAY.sunI}
        castShadow={shadows}
        shadow-mapSize={hiShadow ? [2048, 2048] : [1024, 1024]}
        shadow-camera-left={-17}
        shadow-camera-right={17}
        shadow-camera-top={17}
        shadow-camera-bottom={-17}
        shadow-camera-near={1}
        shadow-camera-far={70}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
        shadow-radius={3}
      />
      <object3D ref={target} />
      {Array.from({ length: POOL }, (_, i) => (
        <pointLight
          key={i}
          ref={(el) => {
            points.current[i] = el;
          }}
          color="#ffa94d"
          intensity={0}
          distance={9}
          decay={1.6}
          position={[0, -50, 0]}
        />
      ))}
    </>
  );
}
