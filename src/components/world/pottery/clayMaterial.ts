// The clay's look: a normal lit standard material (so day/night lights and shadows just work) with a few lines of shader
// patched in: a wet sheen, streaks that turn with the wheel, a wobble while it spins, and the kiln heat (glow + shimmer).
// Every instance patches the SAME code, so they share one compiled program (and "lite" is a second, simpler one).
import * as THREE from "three";
import { BELLY_END, BELLY_END_TO, BELLY_FROM, BELLY_TO, RIM_FROM, RIM_TO, TERRA, toCss, type Glaze } from "./glaze";

export type ClayUniforms = {
  uTime: { value: number };
  /** Wheel angle (radians): the streaks follow it, the mesh itself never turns. */
  uSpin: { value: number };
  /** Wobble amount (fraction of the radius). */
  uWob: { value: number };
  /** Kiln heat 0..1 (orange glow + heat shimmer). */
  uHeat: { value: number };
  /** Wetness 0..1 (sheen). */
  uWet: { value: number };
  /** Glaze body / rim colours (linear, via THREE.Color), how much of the glaze shows (0 = plain clay, 1 = glazed), and the medallion's fade-in. */
  uGlaze: { value: THREE.Color };
  uGlazeRim: { value: THREE.Color };
  uGlazeAmt: { value: number };
  uDecal: { value: number };
  /** Subtle self-light of the medallion (0 = none), so it is not lost in shadow. */
  uDecalGlow: { value: number };
  /** 1 = glossy glaze even with uGlazeAmt 0 (the shelf pots carry their glaze in vertex colours). */
  uGloss: { value: number };
};

export type ClayMaterial = THREE.MeshStandardMaterial & { userData: { clay: ClayUniforms } };

const VERT_HEAD = /* glsl */ `
uniform float uTime; uniform float uSpin; uniform float uWob; uniform float uHeat;
varying vec3 vLoc;
`;
const VERT_BODY = /* glsl */ `
vLoc = position;
#ifndef CLAY_LITE
{
  float ang = atan(position.z, position.x);
  float wob = uWob * sin(ang * 3.0 + uSpin) * (0.25 + position.y) + uHeat * 0.012 * sin(position.y * 34.0 + uTime * 9.0 + ang * 2.0);
  transformed.xz *= 1.0 + wob;
  transformed.y += uHeat * 0.006 * sin(uTime * 7.0 + ang * 4.0);
}
#endif
`;
const FRAG_HEAD = /* glsl */ `
uniform float uTime; uniform float uSpin; uniform float uHeat; uniform float uWet;
uniform vec3 uGlaze; uniform vec3 uGlazeRim; uniform float uGlazeAmt; uniform float uDecal; uniform float uDecalGlow; uniform float uGloss;
float clayDecalA = 0.0;
varying vec3 vLoc;
`;
// Replaces map_fragment: the canvas holds only the round medallion (alpha = its mask). Glaze = body colour + full-colour rim lip and one
// belly band (band edges come from glaze.ts, same as the shelf's vertex colours); the medallion then covers it, fading in with uDecal.
const f1 = (n: number) => n.toFixed(3);
const FRAG_MAP = /* glsl */ `
{
  float gv = vMapUv.y;
  float gband = max(smoothstep(${f1(RIM_FROM)}, ${f1(RIM_TO)}, gv), smoothstep(${f1(BELLY_FROM)}, ${f1(BELLY_TO)}, gv) * (1.0 - smoothstep(${f1(BELLY_END)}, ${f1(BELLY_END_TO)}, gv)));
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(uGlaze, uGlazeRim, gband), uGlazeAmt);
  vec4 decalTex = texture2D(map, vMapUv);
  diffuseColor.rgb = mix(diffuseColor.rgb, decalTex.rgb, decalTex.a * uDecal);
  clayDecalA = decalTex.a * uDecal;
}
float clayStreak = 0.0;
#ifndef CLAY_LITE
{
  float a = atan(vLoc.z, vLoc.x) + uSpin;
  clayStreak = sin(a * 18.0 + vLoc.y * 5.0) * sin(a * 7.0 - vLoc.y * 3.0);
  diffuseColor.rgb *= 1.0 - 0.09 * uWet * clayStreak;
}
#else
diffuseColor.rgb *= 1.0 - 0.04 * uWet;
#endif
`;
const FRAG_ROUGH = /* glsl */ `
roughnessFactor = mix(roughnessFactor, 0.26 + 0.12 * clayStreak, uWet);
// glazed = glossy: the more glaze shows, the lower the roughness (the decal itself stays a bit calmer)
roughnessFactor = mix(roughnessFactor, mix(0.45, 0.55, clayDecalA), max(uGlazeAmt, uGloss));
`;
const FRAG_EMISSIVE = /* glsl */ `
totalEmissiveRadiance += diffuseColor.rgb * clayDecalA * uDecalGlow;
totalEmissiveRadiance += vec3(1.0, 0.34, 0.07) * uHeat * (1.25 + 0.25 * sin(vLoc.y * 22.0 + uTime * 6.0));
`;

/** Set the wheel pot's glaze colours (call once per fired pot; no allocation beyond the css strings). */
export function setGlaze(u: ClayUniforms, g: Glaze): void {
  u.uGlaze.value.set(toCss(g.body));
  u.uGlazeRim.value.set(toCss(g.rim));
}

export function createClayMaterial(opts: { lite: boolean; map: THREE.Texture; wet?: number; decal?: number }): ClayMaterial {
  const u: ClayUniforms = { uTime: { value: 0 }, uSpin: { value: 0 }, uWob: { value: 0 }, uHeat: { value: 0 }, uWet: { value: opts.wet ?? 0 },
    uGlaze: { value: new THREE.Color(TERRA) },
    uGlazeRim: { value: new THREE.Color(TERRA) },
    uGlazeAmt: { value: 0 },
    uDecal: { value: opts.decal ?? 0 },
    uDecalGlow: { value: 0 },
    uGloss: { value: 0 },
  };
  const m = new THREE.MeshStandardMaterial({ color: "#ffffff", map: opts.map, vertexColors: true, roughness: 0.82, metalness: 0 });
  if (opts.lite) m.defines = { CLAY_LITE: "" };
  m.userData.clay = u;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${VERT_HEAD}`).replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAG_HEAD}`)
      .replace("#include <map_fragment>", FRAG_MAP)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\n${FRAG_ROUGH}`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${FRAG_EMISSIVE}`);
  };
  m.customProgramCacheKey = () => (opts.lite ? "clay-lite" : "clay");
  return m as ClayMaterial;
}

// ---------------------------------------------------------------- particles (slip splashes, kiln sparks, confetti)

const POINT_VERT = /* glsl */ `
attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
uniform float uPx;
varying vec3 vC; varying float vA;
void main() {
  vC = aColor; vA = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPx / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const POINT_FRAG = /* glsl */ `
varying vec3 vC; varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.15, d) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vC, a);
}`;

export function createPointsMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uPx: { value: 600 } },
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });
}
