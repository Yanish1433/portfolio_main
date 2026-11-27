"use client";

// Gentle weather. WeatherDriver turns the pure schedule (weather.ts) into smoothed factors
// (weatherState.ts); ThemeDriver and Sky read them for fog / sky / light tint, materials.ts reads `wet`.
// Three meshes (3 draw calls): rain streaks (LineSegments), puddles (merged quads), mist cards (instanced).
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useWorld } from "@/store/world";
import { wetUniform } from "../nepal/materials";
import { skyUniforms } from "../nepal/Sky";
import { themeState } from "../nepal/themeState";
import { approach, parseForce, targetWeather, type Kind } from "./weather";
import { weather } from "./weatherState";

const RATE = 0.25; // factor change per second when ramping (4 s full swing)

function WeatherDriver({ reducedMotion, lite }: { reducedMotion: boolean; lite: boolean }) {
  const cfg = useRef({ forced: null as Kind | null, debug: false, init: false });
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    cfg.current.forced = parseForce(q.get("weather"));
    cfg.current.debug = q.has("debug");
  }, []);
  // before ThemeDriver (priority 0) reads the factors; negative priorities don't take over rendering
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const c = cfg.current;
    const tg = targetWeather(Date.now() / 1000, {
      reducedMotion,
      lite,
      cinema: !!useWorld.getState().cinema,
      debug: c.debug,
      forced: c.forced,
    });
    if (!c.init || reducedMotion) {
      weather.rain = tg.rain;
      weather.mist = tg.mist;
      weather.wet = tg.wet;
      c.init = true;
    } else {
      weather.rain = approach(weather.rain, tg.rain, dt, RATE);
      weather.mist = approach(weather.mist, tg.mist, dt, RATE);
      weather.wet = approach(weather.wet, tg.wet, dt, RATE);
    }
    wetUniform.value = weather.wet;
    skyUniforms.uGrey.value = weather.rain;
    skyUniforms.uMist.value = weather.mist;
  }, -50);
  return null;
}

// ------------------------------------------------------------------ rain

const BOX = new THREE.Vector3(36, 24, 36);
const DROPS = 1600;

const rainVertex = /* glsl */ `
uniform vec3 uCenter;
uniform vec3 uBox;
uniform float uTime;
uniform float uRain;
attribute vec4 aSeed;
attribute float aEnd;
varying float vA;
void main() {
  vec3 base = aSeed.xyz * uBox;
  base.y -= uTime * (9.0 + aSeed.w * 3.0);
  vec3 off = mod(base - uCenter + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 p = uCenter + off;
  p.y += aEnd * 0.55;
  p.x += aEnd * 0.05;
  float edge = 1.0 - smoothstep(0.65, 1.0, max(abs(off.x) / (uBox.x * 0.5), max(abs(off.y) / (uBox.y * 0.5), abs(off.z) / (uBox.z * 0.5))));
  // thin out with the rain factor, vanish above ~30 m (eagle view / fly-in) and under the ground
  float alive = step(aSeed.w, uRain);
  vA = edge * alive * smoothstep(34.0, 22.0, p.y) * smoothstep(-0.2, 0.6, p.y) * (1.0 - aEnd * 0.6);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const rainFragment = /* glsl */ `
uniform float uT;
varying float vA;
void main() {
  if (vA < 0.01) discard;
  vec3 c = mix(vec3(0.78, 0.85, 0.93), vec3(0.45, 0.56, 0.85), uT);
  gl_FragColor = vec4(c, vA * 0.4);
}`;

const _fwd = new THREE.Vector3();

function Rain() {
  const mesh = useRef<THREE.LineSegments>(null);
  const { geo, mat } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(DROPS * 6);
    const seed = new Float32Array(DROPS * 8);
    const end = new Float32Array(DROPS * 2);
    let s = 12345;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < DROPS; i++) {
      const v = [rnd(), rnd(), rnd(), rnd()];
      for (let k = 0; k < 2; k++) {
        seed.set(v, i * 8 + k * 4);
        end[i * 2 + k] = k;
      }
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    g.setAttribute("aEnd", new THREE.BufferAttribute(end, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: rainVertex,
      fragmentShader: rainFragment,
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      uniforms: {
        uCenter: { value: new THREE.Vector3() },
        uBox: { value: BOX },
        uTime: { value: 0 },
        uRain: { value: 0 },
        uT: { value: 0 },
      },
    });
    return { geo: g, mat: m };
  }, []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useFrame(({ camera, clock }) => {
    const m = mesh.current;
    if (!m) return;
    m.visible = weather.rain > 0.01;
    if (!m.visible) return;
    camera.getWorldDirection(_fwd);
    mat.uniforms.uCenter.value.copy(camera.position).addScaledVector(_fwd, 11);
    mat.uniforms.uTime.value = clock.elapsedTime;
    mat.uniforms.uRain.value = weather.rain;
    mat.uniforms.uT.value = themeState.t;
  });
  return <lineSegments ref={mesh} geometry={geo} material={mat} frustumCulled={false} renderOrder={5} visible={false} />;
}

// ------------------------------------------------------------------ puddles

/** x, z, radius, y: low spots on bare ground of the plaza and around the paths. */
const PUDDLES: [number, number, number, number][] = [
  [3.6, 11.2, 1.1, 0.02],
  [-4.4, 9.2, 1.3, 0.02],
  [6.8, 5.6, 1.0, 0.02],
  [-8.2, 3.4, 1.2, 0.02],
  [4.4, -9.6, 1.3, 0.02],
  [-6.4, -9.2, 1.1, 0.02],
  [2.4, 15.2, 0.9, 0.02],
  [-3.2, 14.4, 1.0, 0.02],
  [1.9, 6.4, 0.8, 0.05],
  [-1.6, 13.0, 0.7, 0.05],
];

const puddleVertex = /* glsl */ `
#include <fog_pars_vertex>
attribute vec4 aP; // centre x, centre z, radius, seed
varying vec3 vWorld;
varying vec4 vP;
void main() {
  vWorld = position;
  vP = aP;
  vec4 mvPosition = viewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const puddleFragment = /* glsl */ `
uniform float uWet, uRain, uTime, uT;
uniform vec3 uDayTop, uDayMid, uDayHorizon, uNightTop, uNightMid, uNightHorizon;
varying vec3 vWorld;
varying vec4 vP;
#include <fog_pars_fragment>
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 l = (vWorld.xz - vP.xy) / vP.z;
  float ang = atan(l.y, l.x);
  float edge = 1.0 + 0.16 * sin(ang * 3.0 + vP.w * 9.0) + 0.1 * sin(ang * 5.0 + vP.w * 4.0);
  float d = length(l * vec2(1.0, 1.15)) / edge;
  float mask = smoothstep(1.0, 0.72, d);
  // ripple rings (only while it rains)
  float ring = 0.0;
  for (int k = 0; k < 3; k++) {
    float ph = fract(uTime * 0.7 + vP.w * 7.0 + float(k) * 0.34);
    vec2 c = (vec2(h21(vec2(vP.w, float(k))), h21(vec2(float(k), vP.w * 3.1))) - 0.5) * 1.1;
    float r = length(l - c);
    ring += smoothstep(0.07, 0.0, abs(r - ph * 0.55)) * (1.0 - ph);
  }
  ring *= uRain;
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 n = normalize(vec3(ring * 0.5 * sin(ang * 2.0), 1.0, ring * 0.5 * cos(ang * 2.0)));
  float nv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.25 + 0.75 * pow(1.0 - nv, 3.0);
  vec3 r = reflect(-v, n);
  vec3 hor = mix(uDayHorizon, uNightHorizon, uT);
  vec3 mid = mix(uDayMid, uNightMid, uT);
  vec3 top = mix(uDayTop, uNightTop, uT);
  float up = clamp(r.y, 0.0, 1.0);
  vec3 sky = mix(hor, mid, smoothstep(0.0, 0.35, up));
  sky = mix(sky, top, smoothstep(0.35, 0.9, up));
  vec3 body = mix(vec3(0.05, 0.06, 0.07), vec3(0.01, 0.015, 0.03), uT);
  vec3 col = mix(body, sky, fres) + vec3(0.7, 0.8, 1.0) * ring * 0.35;
  float a = mask * smoothstep(0.0, 0.5, uWet) * mix(0.55, 0.9, fres);
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function Puddles() {
  const mesh = useRef<THREE.Mesh>(null);
  const { geo, mat } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos: number[] = [];
    const ap: number[] = [];
    const idx: number[] = [];
    PUDDLES.forEach(([x, z, r, y], i) => {
      const e = r * 1.3;
      const seed = (i * 0.137) % 1;
      const base = i * 4;
      for (const [dx, dz] of [
        [-e, -e],
        [e, -e],
        [e, e],
        [-e, e],
      ]) {
        pos.push(x + dx, y, z + dz);
        ap.push(x, z, r, seed);
      }
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    });
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aP", new THREE.Float32BufferAttribute(ap, 4));
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      vertexShader: puddleVertex,
      fragmentShader: puddleFragment,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      fog: true,
      toneMapped: false,
      uniforms: {
        ...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
        uWet: { value: 0 },
        uRain: { value: 0 },
        uTime: { value: 0 },
        uT: skyUniforms.uT,
        uDayTop: skyUniforms.uDayTop,
        uDayMid: skyUniforms.uDayMid,
        uDayHorizon: skyUniforms.uDayHorizon,
        uNightTop: skyUniforms.uNightTop,
        uNightMid: skyUniforms.uNightMid,
        uNightHorizon: skyUniforms.uNightHorizon,
      },
    });
    return { geo: g, mat: m };
  }, []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    m.visible = weather.wet > 0.01;
    mat.uniforms.uWet.value = weather.wet;
    mat.uniforms.uRain.value = weather.rain;
    mat.uniforms.uTime.value = clock.elapsedTime;
  });
  return <mesh ref={mesh} geometry={geo} material={mat} renderOrder={2} frustumCulled={false} visible={false} />;
}

// ------------------------------------------------------------------ mist

/** x, z, width: a few big soft low cards over the plaza (<= 6). */
const MIST: [number, number, number][] = [
  [-6, 6, 20],
  [8, 2, 22],
  [-10, -8, 20],
  [6, -10, 18],
  [0, 16, 22],
  [-14, 14, 18],
];

const mistVertex = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vNear;
varying float vSeed;
void main() {
  vUv = uv;
  vec4 c = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vSeed = c.x * 0.37 + c.z * 0.21;
  c.x += sin(uTime * 0.05 + vSeed) * 2.5;
  c.z += cos(uTime * 0.04 + vSeed * 1.7) * 2.0;
  vec3 toCam = cameraPosition - c.xyz;
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), vec3(toCam.x, 0.0, toCam.z) + vec3(1e-4)));
  float w = length(instanceMatrix[0].xyz);
  vec3 p = c.xyz + right * position.x * w + vec3(0.0, position.y * 2.3, 0.0);
  vNear = smoothstep(4.0, 12.0, length(toCam));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const mistFragment = /* glsl */ `
uniform float uMist, uTime, uT;
uniform vec3 uFog;
varying vec2 vUv;
varying float vNear;
varying float vSeed;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float shape = smoothstep(1.0, 0.1, abs(q.x)) * smoothstep(1.0, 0.25, abs(q.y));
  float wisp = 0.55 + 0.9 * n(vec2(vUv.x * 4.0 + uTime * 0.03 + vSeed, vUv.y * 2.0 + vSeed));
  float a = shape * wisp * uMist * vNear * 0.7;
  if (a < 0.005) discard;
  vec3 c = uFog * mix(1.12, 1.5, uT);
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`;

function Mist() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { geo, mat } = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    const m = new THREE.ShaderMaterial({
      vertexShader: mistVertex,
      fragmentShader: mistFragment,
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      uniforms: { uMist: { value: 0 }, uTime: { value: 0 }, uT: skyUniforms.uT, uFog: skyUniforms.uFog },
    });
    return { geo: g, mat: m };
  }, []);
  useEffect(() => {
    const im = mesh.current;
    if (!im) return;
    const mtx = new THREE.Matrix4();
    MIST.forEach(([x, z, w], i) => {
      // scale.x carries the card width into the shader; y is the height of the card centre
      mtx.compose(new THREE.Vector3(x, 2.3, z), new THREE.Quaternion(), new THREE.Vector3(w, 1, 1));
      im.setMatrixAt(i, mtx);
    });
    im.instanceMatrix.needsUpdate = true;
  }, []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    m.visible = weather.mist > 0.01;
    mat.uniforms.uMist.value = weather.mist;
    mat.uniforms.uTime.value = clock.elapsedTime;
  });
  return <instancedMesh ref={mesh} args={[geo, mat, MIST.length]} frustumCulled={false} renderOrder={4} visible={false} />;
}

export default function Weather({ reducedMotion, lite }: { reducedMotion: boolean; lite: boolean }) {
  return (
    <>
      <WeatherDriver reducedMotion={reducedMotion} lite={lite} />
      {!lite && !reducedMotion && (
        <>
          <Rain />
          <Puddles />
          <Mist />
        </>
      )}
    </>
  );
}
