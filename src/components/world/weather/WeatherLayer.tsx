"use client";

// Gentle weather. WeatherDriver turns the pure schedule (weather.ts) into smoothed factors
// (weatherState.ts); ThemeDriver and Sky read them for fog / sky / light tint, materials.ts reads `wet`.
// Four meshes (4 draw calls): rain streaks (LineSegments), splash flicks (instanced), puddles (merged quads), mist cards (instanced).
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
const DROPS = 960;
/** Wind pushes the rain along +x / +z (m/s) so the streaks lean. */
const WIND = new THREE.Vector2(1.5, 0.5);

const rainVertex = /* glsl */ `
uniform vec3 uCenter;
uniform vec3 uBox;
uniform float uTime;
uniform float uRain;
uniform vec2 uWind;
attribute vec4 aSeed;
attribute float aEnd;
varying float vA;
void main() {
  float fall = 9.0 + aSeed.w * 3.0;
  vec3 vel = vec3(uWind.x, -fall, uWind.y);
  vec3 base = aSeed.xyz * uBox + vel * uTime;
  vec3 off = mod(base - uCenter + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 p = uCenter + off;
  // a short streak along the fall direction (about 0.35 m), head at the low end
  p -= vel * (0.04 * (0.7 + aSeed.w * 0.6)) * aEnd;
  float edge = 1.0 - smoothstep(0.65, 1.0, max(abs(off.x) / (uBox.x * 0.5), max(abs(off.y) / (uBox.y * 0.5), abs(off.z) / (uBox.z * 0.5))));
  // thin out with the rain factor, vanish above ~30 m (eagle view / fly-in) and under the ground
  float alive = step(aSeed.w, uRain);
  // motion blur feel: the streak tail fades out
  vA = edge * alive * smoothstep(34.0, 22.0, p.y) * smoothstep(-0.2, 0.6, p.y) * (1.0 - aEnd * 0.85) * (0.6 + 0.4 * fract(aSeed.x * 91.7));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const rainFragment = /* glsl */ `
uniform float uT;
varying float vA;
void main() {
  if (vA < 0.01) discard;
  vec3 c = mix(vec3(0.78, 0.85, 0.93), vec3(0.45, 0.56, 0.85), uT);
  gl_FragColor = vec4(c, vA * 0.38);
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
        uWind: { value: WIND },
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

// ------------------------------------------------------------------ splashes

const SPLASHES = 72;
const SPLASH_AREA = 16; // m, square around the camera

const splashVertex = /* glsl */ `
uniform vec3 uCenter;
uniform float uTime, uRain;
attribute vec4 aS; // x, z in 0..1, phase offset, rate
varying vec2 vUv;
varying float vA;
void main() {
  vUv = uv;
  float ph = fract(uTime * (0.9 + aS.w * 0.8) + aS.z);
  vec2 off = mod(aS.xy * ${SPLASH_AREA}.0 - uCenter.xz + ${SPLASH_AREA / 2}.0, ${SPLASH_AREA}.0) - ${SPLASH_AREA / 2}.0;
  vec2 xz = uCenter.xz + off;
  float edge = 1.0 - smoothstep(0.55, 1.0, length(off) / ${SPLASH_AREA / 2}.0);
  float size = 0.05 + ph * 0.2;
  vec3 p = vec3(xz.x + position.x * size, 0.035, xz.y - position.y * size);
  float alive = step(aS.w, uRain);
  vA = edge * alive * (1.0 - ph) * (1.0 - ph) * smoothstep(30.0, 18.0, uCenter.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const splashFragment = /* glsl */ `
uniform float uT;
varying vec2 vUv;
varying float vA;
void main() {
  if (vA < 0.01) discard;
  float r = length(vUv * 2.0 - 1.0);
  float ring = smoothstep(0.2, 0.0, abs(r - 0.7)) + smoothstep(0.25, 0.0, r) * 0.6;
  float a = ring * vA * 0.5;
  if (a < 0.01) discard;
  gl_FragColor = vec4(mix(vec3(0.85, 0.9, 0.97), vec3(0.55, 0.65, 0.9), uT), a);
}`;

function Splashes() {
  const mesh = useRef<THREE.Mesh>(null);
  const { geo, mat } = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute("position", base.attributes.position);
    g.setAttribute("uv", base.attributes.uv);
    g.instanceCount = SPLASHES;
    const a = new Float32Array(SPLASHES * 4);
    let s = 777;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < a.length; i++) a[i] = rnd();
    g.setAttribute("aS", new THREE.InstancedBufferAttribute(a, 4));
    const m = new THREE.ShaderMaterial({
      vertexShader: splashVertex,
      fragmentShader: splashFragment,
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      uniforms: { uCenter: { value: new THREE.Vector3() }, uTime: { value: 0 }, uRain: { value: 0 }, uT: skyUniforms.uT },
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
    m.visible = weather.rain > 0.01 && camera.position.y < 32;
    if (!m.visible) return;
    mat.uniforms.uCenter.value.copy(camera.position);
    mat.uniforms.uTime.value = clock.elapsedTime;
    mat.uniforms.uRain.value = weather.rain;
  });
  return <mesh ref={mesh} geometry={geo} material={mat} frustumCulled={false} renderOrder={3} visible={false} />;
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
float vn(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec2 l = (vWorld.xz - vP.xy) / vP.z;
  float ang = atan(l.y, l.x);
  float edge = 1.0 + 0.16 * sin(ang * 3.0 + vP.w * 9.0) + 0.1 * sin(ang * 5.0 + vP.w * 4.0);
  float d = length(l * vec2(1.0, 1.15)) / edge;
  // irregular, soft, noise-eaten edge
  float nz = vn(l * 3.2 + vP.w * 17.0) * 0.6 + vn(l * 7.5 + vP.w * 5.0) * 0.4;
  float mask = smoothstep(1.0, 0.45, d + (nz - 0.5) * 0.5);
  // ripple rings: thin, expanding, only while it rains
  float ring = 0.0;
  for (int k = 0; k < 3; k++) {
    float ph = fract(uTime * 0.55 + vP.w * 7.0 + float(k) * 0.34);
    float cyc = floor(uTime * 0.55 + vP.w * 7.0 + float(k) * 0.34);
    vec2 c = (vec2(h21(vec2(vP.w + cyc, float(k))), h21(vec2(float(k) + cyc, vP.w * 3.1))) - 0.5) * 1.2;
    float r = length(l - c);
    ring += smoothstep(0.05, 0.0, abs(r - ph * 0.45)) * (1.0 - ph) * (1.0 - ph);
  }
  ring *= uRain;
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 n = normalize(vec3(ring * 0.4 * sin(ang * 2.0), 1.0, ring * 0.4 * cos(ang * 2.0)));
  float nv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.04 + 0.96 * pow(1.0 - nv, 4.0);
  vec3 r = reflect(-v, n);
  vec3 hor = mix(uDayHorizon, uNightHorizon, uT);
  vec3 mid = mix(uDayMid, uNightMid, uT);
  vec3 top = mix(uDayTop, uNightTop, uT);
  float up = clamp(r.y, 0.0, 1.0);
  vec3 sky = mix(hor, mid, smoothstep(0.0, 0.35, up));
  sky = mix(sky, top, smoothstep(0.35, 0.9, up));
  // dark wet patch (neutral brown-grey, not blue) with a faint sky reflection and a warm lamp glint at night
  vec3 body = mix(vec3(0.055, 0.05, 0.045), vec3(0.012, 0.012, 0.016), uT);
  vec3 col = mix(body, sky * 0.55, fres * 0.7);
  col += vec3(1.0, 0.72, 0.4) * uT * fres * (0.04 + 0.1 * vn(l * 5.0 + uTime * 0.2));
  col += vec3(0.7, 0.75, 0.8) * ring * 0.18;
  float a = mask * smoothstep(0.0, 0.5, uWet) * mix(0.6, 0.85, fres);
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

/** x, z, width: a few big soft low cards over the plaza (<= 8). */
const MIST: [number, number, number][] = [
  [-6, 6, 20],
  [8, 2, 22],
  [-10, -8, 20],
  [6, -10, 18],
  [0, 16, 22],
  [-14, 14, 18],
  [14, -4, 20],
  [-2, -2, 18],
];
const MIST_Y = 1.2; // card centre height; the card is 2.4 m tall and thickest at the ground

const mistVertex = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vNear;
varying float vFar;
varying float vSeed;
void main() {
  vUv = uv;
  vec4 c = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vSeed = c.x * 0.37 + c.z * 0.21;
  c.x += sin(uTime * 0.05 + vSeed) * 2.5 + uTime * 0.12;
  c.z += cos(uTime * 0.04 + vSeed * 1.7) * 2.0;
  vec3 toCam = cameraPosition - c.xyz;
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), vec3(toCam.x, 0.0, toCam.z) + vec3(1e-4)));
  float w = length(instanceMatrix[0].xyz);
  vec3 p = c.xyz + right * position.x * w + vec3(0.0, position.y * 2.4, 0.0);
  float dist = length(toCam);
  vNear = smoothstep(4.0, 12.0, dist);
  vFar = 0.55 + 0.45 * smoothstep(8.0, 30.0, dist); // thicker with distance
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const mistFragment = /* glsl */ `
uniform float uMist, uTime, uT;
uniform vec3 uFog;
varying vec2 vUv;
varying float vNear;
varying float vFar;
varying float vSeed;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float side = smoothstep(1.0, 0.15, abs(q.x));
  // thickest at the ground, thinning upward; a soft top and bottom
  float low = pow(1.0 - vUv.y, 1.4) * smoothstep(0.0, 0.08, vUv.y);
  // two drifting noise layers make it uneven and patchy
  vec2 t = vec2(uTime * 0.035, uTime * 0.01);
  float f = n(vec2(vUv.x * 3.0, vUv.y * 1.6) * 1.0 + t + vSeed) * 0.6 + n(vec2(vUv.x * 7.0, vUv.y * 3.5) - t * 1.7 + vSeed * 2.0) * 0.4;
  float patch = smoothstep(0.25, 0.8, f);
  float a = side * low * patch * uMist * vNear * vFar * 0.75;
  if (a < 0.005) discard;
  vec3 c = uFog * mix(1.1, 1.45, uT);
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
      mtx.compose(new THREE.Vector3(x, MIST_Y, z), new THREE.Quaternion(), new THREE.Vector3(w, 1, 1));
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
          <Splashes />
          <Puddles />
          <Mist />
        </>
      )}
    </>
  );
}
