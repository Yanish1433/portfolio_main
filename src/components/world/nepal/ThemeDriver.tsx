"use client";

// Light rig + the single per-frame driver of day/night. The light COUNT never
// changes (1 directional, 1 hemisphere, 4 shadowless point lights): only
// colours, positions and intensities are animated, so no shader recompiles.
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { playerPos } from "../input";
import { getEnvironment, getMaterials, occlusion, timeUniform } from "./materials";
import { skyUniforms } from "./Sky";
import { themeState, themeTargets } from "./themeState";
import { charMaterials, charRim } from "../lookdev";
import { timeToLook, DAY_MINUTES } from "./timeLook";
import { weather } from "../weather/weatherState";
import { AVATAR_SCALE } from "../characters";
import { currentMinutes, initFlow, isPaused, subscribe } from "@/lib/time/flow";
import { useWorld } from "@/store/world";

const POOL = 4;

const C = (c: string) => new THREE.Color(c);
const DAY = {
  sun: C("#ffc68a"),
  sunI: 3.0,
  sunOff: new THREE.Vector3(-20, 13, 15),
  hemiSky: C("#ffe1bd"),
  hemiGround: C("#8a5a3c"),
  hemiI: 1.0,
  fog: C("#ecd3b6"),
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

// Weather tints (factors come from weather/WeatherDriver): fog colour + range, light dimming.
const MIST_DAY = C("#cfdbe2");
const MIST_NIGHT = C("#2c3d68");
const RAIN_DAY = C("#9aa4ad");
const RAIN_NIGHT = C("#161e36");
const _wc = new THREE.Color();

const _col = new THREE.Color();
const FLAME_DIM = C("#3a2412"); // an unlit wick: the flame fades up from this so it never pops in
const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return k * k * (3 - 2 * k);
};
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
    scene.fog = new THREE.Fog(DAY.fog.clone(), 100, 250);
    scene.background = DAY.fog.clone();
    // the flowing clock: the shared module advances the minutes (per frame below); the store and the HUD follow once per game-minute
    initFlow();
    const off = subscribe(() => {
      if (!isPaused()) useWorld.getState().setMinutes(Math.floor(currentMinutes()), false);
    });
    return () => {
      off();
      scene.fog = null;
    };
  }, [gl, scene, m]);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    // time of day: ease the shown minutes toward the goal along the shortest way round the clock
    if (!isPaused()) themeState.minutes = currentMinutes();
    const goal = themeState.minutes;
    if (!themeState.initialised || reducedMotion) {
      themeState.shown = goal;
      themeState.initialised = true;
    } else {
      const diff = ((goal - themeState.shown + DAY_MINUTES * 1.5) % DAY_MINUTES) - DAY_MINUTES / 2;
      themeState.shown = Math.abs(diff) < 2 ? goal : (themeState.shown + diff * (1 - Math.exp(-dt * 7)) + DAY_MINUTES) % DAY_MINUTES;
    }
    const look = timeToLook(themeState.shown);
    const t = look.t;
    themeState.p = t;
    themeState.t = t;
    const L = (a: number, b: number) => a + (b - a) * t;
    timeUniform.value = reducedMotion ? 0 : state.clock.elapsedTime;

    // sun <-> moon
    if (sun.current && target.current) {
      target.current.position.set(playerPos.x, 0, playerPos.z);
      sun.current.position.set(playerPos.x + look.lightOff[0], look.lightOff[1], playerPos.z + look.lightOff[2]);
      sun.current.color.setRGB(look.sun[0], look.sun[1], look.sun[2]);
      sun.current.intensity = look.sunI * (1 - 0.45 * weather.rain - 0.15 * weather.mist);
    }
    if (hemi.current) {
      hemi.current.color.setRGB(look.hemiSky[0], look.hemiSky[1], look.hemiSky[2]);
      hemi.current.groundColor.setRGB(look.hemiGround[0], look.hemiGround[1], look.hemiGround[2]);
      hemi.current.intensity = look.hemiI * (1 - 0.12 * weather.rain);
    }
    _col.setRGB(look.fog[0], look.fog[1], look.fog[2]);
    if (weather.mist > 0.001) _col.lerp(_wc.lerpColors(MIST_DAY, MIST_NIGHT, t), weather.mist * 0.85);
    if (weather.rain > 0.001) _col.lerp(_wc.lerpColors(RAIN_DAY, RAIN_NIGHT, t), weather.rain * 0.7);
    if (scene.fog) {
      const f = scene.fog as THREE.Fog;
      f.color.copy(_col);
      f.near = 100 - 90 * weather.mist - 40 * weather.rain;
      f.far = 250 - 155 * weather.mist - 70 * weather.rain;
    }
    if (scene.background instanceof THREE.Color) scene.background.copy(_col);
    skyUniforms.uT.value = t;
    skyUniforms.uDayTop.value.setRGB(look.skyTop[0], look.skyTop[1], look.skyTop[2]);
    skyUniforms.uDayMid.value.setRGB(look.skyMid[0], look.skyMid[1], look.skyMid[2]);
    skyUniforms.uDayHorizon.value.setRGB(look.skyHorizon[0], look.skyHorizon[1], look.skyHorizon[2]);
    skyUniforms.uCloudDay.value.setRGB(look.cloud[0], look.cloud[1], look.cloud[2]);
    skyUniforms.uSunDir.value.set(look.sunDir[0], look.sunDir[1], look.sunDir[2]);
    skyUniforms.uFog.value.copy(_col);

    // emissive materials
    (m.window as THREE.ShaderMaterial).uniforms.uT.value = t;
    m.gold.emissiveIntensity = L(DAY.gold, NIGHT.gold);
    m.gold.envMapIntensity = L(DAY.env, NIGHT.env);
    m.flame.color.lerpColors(DAY.flame, NIGHT.flame, t).lerp(FLAME_DIM, 1 - smooth(0.02, 0.15, t));
    m.flame.visible = t > 0.02;
    for (const h of themeTargets.halos) {
      h.mat.opacity = L(h.day, h.night);
      h.mat.visible = h.mat.opacity > 0.01;
    }
    // night-only / day-only groups shrink away around t = 0.5 instead of popping
    const nightK = smooth(0.35, 0.5, t);
    const dayK = 1 - smooth(0.35, 0.5, t);
    for (const o of themeTargets.nightOnly) {
      o.visible = nightK > 0.01;
      o.scale.setScalar(Math.max(nightK, 0.001));
    }
    for (const o of themeTargets.dayOnly) {
      o.visible = dayK > 0.01 && t <= 0.5;
      o.scale.setScalar(Math.max(dayK, 0.001));
    }
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
    occlusion.value.set((_v.x * 0.5 + 0.5) * _buf.x, (_v.y * 0.5 + 0.5) * _buf.y, _buf.y * 0.13 * AVATAR_SCALE, -viewDepth);
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
