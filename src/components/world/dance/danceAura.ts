// The dance backdrop: a big glowing Nepal flag of light behind Lakhey (ONE cloth quad + ONE instanced-style sparks
// Points = 2 draw calls while dancing, 0 when idle). The flag mask comes from `flagDesign()` (see flagAura.ts); the
// sun is procedural in the shader so its 12 rays can turn and pulse with the beat.
import * as THREE from "three";
import { flagDesign } from "./nepalFlag";
import { IMPACT_TIMES } from "./impactTimes";
import { auraTimeline, beatPulse, buildFlagMask, type FlagMask } from "./flagAura";
import { danceClock, registerWarm } from "./danceWarm";

const FLAG_H = 5.8; // m, ~2.8x Lakhey
const DIST = 2.6; // m behind him along the camera -> avatar ray
const SPARKS = 64;
const FEET_BELOW_CENTRE = 1.1; // Avatar passes chest height (feet + 1.1)

const VERT = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uFlash;
uniform float uSince;
uniform vec2 uHole;
varying vec2 vUv;
varying vec2 vLocal;
varying float vShade;
void main() {
  vUv = uv;
  vLocal = position.xy;
  vec3 p = position;
  float w = uv.x * uv.x; // the hoist edge stays put, the fly moves most
  float ph = p.x * 1.1 - uTime * 2.1;
  p.y += uAmp * 0.28 * sin(ph + p.y * 0.45) * w;
  p.x += uAmp * 0.14 * sin(p.y * 1.05 - uTime * 1.5) * w;
  // Strike ripple: a ring of displacement travelling outward from the avatar.
  vec2 d = position.xy - uHole;
  float r = length(d);
  float ring = exp(-pow((r - max(uSince, 0.0) * 6.5) * 0.9, 2.0)) * uFlash * step(0.0, uSince);
  p.xy += (d / max(r, 0.001)) * ring * 0.22;
  vShade = 1.0 + uAmp * 0.9 * cos(ph + p.y * 0.45) * w;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMask;
uniform float uTime, uDraw, uFill, uIgnite, uFlash, uSince, uDissolve, uStrength, uMax, uBeat, uSpin;
uniform float uHeight; // flag height for width 1
uniform vec4 uSun;     // cx, cy, rIn, r  (flag units)
uniform vec2 uHole, uHoleR;
varying vec2 vUv;
varying vec2 vLocal;
varying float vShade;
const vec3 CRIMSON = vec3(0.8627, 0.0784, 0.2353);
const vec3 BLUE = vec3(0.0, 0.2196, 0.5765);
const float PI = 3.14159265;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec4 m = texture2D(uMask, vUv);
  float border = m.r, field = m.g, moon = m.b, trace = m.a;
  vec2 fp = vec2(vUv.x, vUv.y * uHeight);

  // Procedural sun: disc + 12 rays that turn and pulse.
  vec2 sd = fp - uSun.xy;
  float sr = length(sd);
  float sa = atan(sd.y, sd.x) - uSpin;
  float sec = PI / 6.0;
  float phi = mod(sa - PI * 0.5 + sec * 0.5, sec) - sec * 0.5;
  float pulse = 1.0 + 0.16 * uBeat;
  float rayR = uSun.z + (uSun.w * pulse - uSun.z) * (1.0 - abs(phi) / (sec * 0.5));
  float sunM = clamp((max(uSun.z, rayR) - sr) / 0.004 + 0.5, 0.0, 1.0);
  // Only inside the cloth (the sun lies well inside the field).
  sunM *= step(0.5, field);
  float halo = exp(-max(sr - uSun.z, 0.0) * 14.0) * 0.18 * step(0.5, field);

  float flick = 0.9 + 0.1 * sin(uTime * 23.0 + vUv.x * 9.0);
  float emblem = max(moon, sunM) * uIgnite * flick;

  // Border draws on from the hoist; a bright head leads it.
  float edgeD = uDraw * 1.02 - trace;
  float drawn = smoothstep(0.0, 0.015, edgeD) * step(0.002, border);
  float head = exp(-abs(edgeD) * 55.0) * step(uDraw, 0.999) * step(0.002, border);
  // The field fills in behind it, sweeping from the hoist.
  float fillM = smoothstep(0.0, 0.3, uFill * 1.3 - vUv.x * 0.9);

  float dist = length(vLocal - uHole);
  float ring = exp(-pow((dist - max(uSince, 0.0) * 6.5) * 0.9, 2.0)) * uFlash * step(0.0, uSince);
  float boost = 1.0 + uFlash * 0.85 + ring * 0.9;

  vec3 col = BLUE * 2.1 * border * drawn * boost;
  col += vec3(uMax) * 0.7 * head;
  col += CRIMSON * 0.68 * field * fillM * (1.0 - clamp(max(moon, sunM) * uIgnite, 0.0, 1.0)) * boost;
  col += vec3(uMax) * 0.9 * emblem * (1.0 + 0.35 * uFlash);
  col += vec3(uMax) * halo * uIgnite;
  col *= vShade;

  // Dissolve: erodes from the bottom, noisy; a thin hot edge.
  float n = vnoise(vLocal * 1.7 + vec2(0.0, -uTime * 0.25)) * 0.7 + vUv.y * 0.3;
  float thr = uDissolve * 1.06;
  float keep = smoothstep(thr - 0.06, thr, n);
  float edge = keep * (1.0 - smoothstep(thr, thr + 0.09, n)) * step(0.001, uDissolve);
  col = col * keep + vec3(uMax) * 0.5 * edge * step(0.5, max(field, border));

  // Keep the cloth behind the avatar dimmer where it would crowd the face.
  float e = length((vLocal - uHole) / uHoleR);
  col *= mix(0.45, 1.0, smoothstep(0.5, 1.2, e));

  gl_FragColor = vec4(min(col * uStrength, vec3(uMax)), 1.0);
}
`;

const SPARK_VERT = /* glsl */ `
attribute vec4 aSeed; // x,y: start on the flag (0..1), z: speed, w: phase
attribute vec2 aRand; // x: colour kind, y: wake threshold
uniform float uTime, uEmit, uDissolve, uW, uH, uSizePx;
varying float vA;
varying float vKind;
void main() {
  float life = fract(aSeed.w + uTime * aSeed.z * 0.22);
  float up = life * (2.2 + uDissolve * 3.2);
  vec3 p = vec3((aSeed.x - 0.5) * uW + sin(uTime * 1.2 + aSeed.w * 40.0) * 0.18, (aSeed.y - 0.5) * uH + up, 0.05);
  float alive = step(aRand.y, uEmit);
  vA = sin(3.14159 * life) * alive;
  vKind = aRand.x;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSizePx * (0.55 + 0.9 * aSeed.z) * (0.4 + 0.6 * vA) / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const SPARK_FRAG = /* glsl */ `
uniform float uStrength, uMax;
varying float vA;
varying float vKind;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.15, d) * vA * uStrength;
  if (a < 0.01) discard;
  vec3 c = vKind < 0.34 ? vec3(0.8627, 0.0784, 0.2353) * 1.2 : (vKind < 0.67 ? vec3(0.0, 0.2196, 0.5765) * 2.2 : vec3(uMax));
  gl_FragColor = vec4(min(c, vec3(uMax)) * a, 1.0);
}
`;

let maskCache: FlagMask | null = null;
function flagMask(): FlagMask {
  return (maskCache ??= buildFlagMask(512));
}

function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export type DanceAura = ReturnType<typeof createDanceAura>;

export interface AuraOpts {
  /** No sparks (lite devices). */
  sparks?: boolean;
}

export interface AuraUpdate {
  reduced: boolean;
  night: number;
  /** Seconds into the Dance clip (drives the timeline); falls back to time since the aura mounted. */
  danceT?: number;
  /** Dance clip length in seconds. */
  duration?: number;
}

const _dir = new THREE.Vector3();
const _dirH = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _hit = new THREE.Vector3();

export function createDanceAura(scene: THREE.Object3D, opts: AuraOpts = {}) {
  const withSparks = opts.sparks !== false;
  const d = flagDesign();
  const mask = flagMask();
  const tex = new THREE.DataTexture(mask.data, mask.width, mask.height, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;

  const W = FLAG_H / d.height;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMask: { value: tex },
      uTime: { value: 0 },
      uAmp: { value: 1 },
      uDraw: { value: 0 },
      uFill: { value: 0 },
      uIgnite: { value: 0 },
      uFlash: { value: 0 },
      uSince: { value: -1 },
      uDissolve: { value: 0 },
      uStrength: { value: 0 },
      uMax: { value: 0.95 },
      uBeat: { value: 0 },
      uSpin: { value: 0 },
      uHeight: { value: d.height },
      uSun: { value: new THREE.Vector4(d.sun.cx, d.sun.cy, d.sun.rIn, d.sun.r) },
      uHole: { value: new THREE.Vector2() },
      uHoleR: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const geo = new THREE.PlaneGeometry(W, FLAG_H, 16, 20);
  const cloth = new THREE.Mesh(geo, mat);
  cloth.frustumCulled = false;
  cloth.renderOrder = -1;

  // Sparks: ONE Points mesh, motion computed in its vertex shader.
  let sparkGeo: THREE.BufferGeometry | null = null;
  let sparkMat: THREE.ShaderMaterial | null = null;
  let sparks: THREE.Points | null = null;
  if (withSparks) {
    const rnd = seededRand(2081);
    const seed = new Float32Array(SPARKS * 4);
    const rand = new Float32Array(SPARKS * 2);
    const pos = new Float32Array(SPARKS * 3);
    for (let i = 0; i < SPARKS; i++) {
      let x = 0.5, y = 0.5;
      for (let k = 0; k < 20; k++) {
        x = rnd();
        y = rnd() * d.height;
        const col = Math.min(mask.width - 1, Math.floor(x * mask.width));
        const row = Math.min(mask.height - 1, Math.floor((y / d.height) * mask.height));
        const idx = (row * mask.width + col) * 4;
        if (mask.data[idx] > 60 || mask.data[idx + 1] > 60) break;
      }
      seed.set([x, y / d.height, 0.5 + rnd(), rnd()], i * 4);
      rand.set([rnd(), i / SPARKS], i * 2);
    }
    sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    sparkGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    sparkGeo.setAttribute("aRand", new THREE.BufferAttribute(rand, 2));
    sparkMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uEmit: { value: 0 },
        uDissolve: { value: 0 },
        uW: { value: W },
        uH: { value: FLAG_H },
        uSizePx: { value: 40 },
        uStrength: { value: 0 },
        uMax: { value: 0.95 },
      },
      vertexShader: SPARK_VERT,
      fragmentShader: SPARK_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
    sparks = new THREE.Points(sparkGeo, sparkMat);
    sparks.frustumCulled = false;
    sparks.renderOrder = -1;
  }

  const group = new THREE.Group();
  group.add(cloth);
  if (sparks) group.add(sparks);

  let mounted = false;
  let time = 0;
  const unregister = registerWarm(() => {
    const was = mounted;
    if (!was) scene.add(group);
    const sv = sparks?.visible ?? false;
    if (sparks) sparks.visible = true;
    return () => {
      if (sparks) sparks.visible = sv;
      if (!was) scene.remove(group);
    };
  });

  return {
    /** `center`: the avatar's world position (chest height). */
    update(dt: number, weight: number, camera: THREE.Camera, center: THREE.Vector3, o: AuraUpdate) {
      danceClock.weight = weight;
      if (weight <= 0.003) {
        danceClock.active = false;
        danceClock.t = 0;
        time = 0;
        if (mounted) {
          scene.remove(group);
          mounted = false;
        }
        return;
      }
      if (!mounted) {
        scene.add(group);
        mounted = true;
      }
      time += dt;
      const t = o.danceT ?? time;
      const duration = o.duration ?? 15;
      danceClock.active = true;
      danceClock.t = t;

      // Placement: behind him along the camera -> avatar ray, upright, facing the camera.
      _dir.copy(center).sub(camera.position);
      const dist = _dir.length() || 1;
      _dir.divideScalar(dist);
      _dirH.set(_dir.x, 0, _dir.z);
      if (_dirH.lengthSq() < 1e-6) _dirH.set(0, 0, -1);
      _dirH.normalize();
      _pos.set(center.x + _dirH.x * DIST, center.y - FEET_BELOW_CENTRE + FLAG_H / 2 - 0.45, center.z + _dirH.z * DIST);
      const yaw = Math.atan2(-_dirH.x, -_dirH.z);
      group.position.copy(_pos);
      group.rotation.set(0, yaw, 0);

      // Where the avatar sits on the flag plane (local metres), for the face dim and the ripple origin.
      const nx = -_dirH.x;
      const nz = -_dirH.z;
      const denom = _dir.x * nx + _dir.z * nz;
      const s = denom > 1e-4 ? ((_pos.x - camera.position.x) * nx + (_pos.z - camera.position.z) * nz) / denom : dist + DIST;
      _hit.copy(camera.position).addScaledVector(_dir, s).sub(_pos);
      const hx = _hit.x * Math.cos(yaw) - _hit.z * Math.sin(yaw);
      const mag = s / dist;
      const u = mat.uniforms;
      u.uHole.value.set(hx, _hit.y);
      u.uHoleR.value.set(0.85 * mag, 1.4 * mag);

      const ph = o.reduced
        ? { draw: 1, fill: 1, ignite: 1, flash: 0, sinceImpact: -1, dissolve: 0 }
        : auraTimeline(t, duration, IMPACT_TIMES);
      u.uDraw.value = ph.draw;
      u.uFill.value = ph.fill;
      u.uIgnite.value = ph.ignite;
      u.uFlash.value = ph.flash;
      u.uSince.value = ph.sinceImpact;
      u.uDissolve.value = ph.dissolve;
      u.uTime.value = o.reduced ? 3.1 : t;
      u.uAmp.value = o.reduced ? 0 : 1;
      u.uBeat.value = o.reduced ? 0 : beatPulse(t);
      u.uSpin.value = o.reduced ? 0 : t * 0.45;
      u.uMax.value = 0.95 - 0.25 * o.night;
      u.uStrength.value = weight * (0.8 + 0.4 * o.night) * (o.reduced ? 0.7 : 1);

      if (sparkMat) {
        const su = sparkMat.uniforms;
        const emit = o.reduced ? 0 : Math.min(1, 0.3 * ph.ignite + 0.5 * ph.flash + ph.dissolve);
        su.uTime.value = t;
        su.uEmit.value = emit;
        su.uDissolve.value = ph.dissolve;
        su.uStrength.value = weight;
        su.uMax.value = u.uMax.value;
        const fov = (camera as THREE.PerspectiveCamera).fov ?? 50;
        const px = typeof window !== "undefined" ? window.innerHeight * (window.devicePixelRatio || 1) : 1000;
        su.uSizePx.value = (0.09 * px) / (2 * Math.tan((fov * Math.PI) / 360));
        if (sparks) sparks.visible = emit > 0.001;
      }
    },
    dispose() {
      unregister();
      scene.remove(group);
      geo.dispose();
      mat.dispose();
      tex.dispose();
      sparkGeo?.dispose();
      sparkMat?.dispose();
    },
  };
}
