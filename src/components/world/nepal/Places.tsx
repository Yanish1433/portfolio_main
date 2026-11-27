"use client";

// The step8c places' own meshes (everything else of them is merged into the town's buckets, nepal/placesGeo.ts):
//  - the pond's water surface: ONE shader plane (sky-colour fresnel, ripples, drips from the spout; no render target)
//  - the chautari's swaying leaf cards: one mesh on the shared leaf material (the town trees' cards are one more mesh, Town.tsx)
//  - the four place name tags: ONE atlas mesh (billboard quads in a vertex shader)
import { use, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PAGODA, CHAUTARI, MARKET, POND } from "../zones";
import { LABELS } from "./labels";
import { drawBilingual, loadLabelFonts } from "./LabelSprites";
import { createLeafDepthMaterial, getMaterials } from "./materials";
import { chautariLeaves, POND_SPOUT, POND_WATER, POND_WATER_Y } from "./placesGeo";
import { skyUniforms } from "./Sky";

// ------------------------------------------------------------------ pond water

const waterVertex = /* glsl */ `
#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const waterFragment = /* glsl */ `
uniform float uTime;
uniform float uT;
uniform vec3 uDayTop, uDayMid, uDayHorizon, uNightTop, uNightMid, uNightHorizon;
uniform vec2 uSpout;
uniform vec2 uZ; // centre z, half depth of the water
varying vec3 vWorld;
#include <fog_pars_fragment>

// height field: crossing swells, two slow drifts and rings from the spout's drip
float hf(vec2 p) {
  float t = uTime;
  float h = sin(dot(p, vec2(2.3, 1.1)) + t * 0.9) * 0.5 + sin(dot(p, vec2(-1.7, 2.9)) - t * 1.2) * 0.4 + sin(dot(p, vec2(5.1, -3.3)) + t * 1.9) * 0.2;
  float r = length(p - uSpout);
  h += sin(r * 13.0 - t * 3.0) * exp(-r * 0.7) * 0.8;
  return h * 0.012;
}
void main() {
  vec2 p = vWorld.xz;
  float e = 0.04;
  float h0 = hf(p);
  vec3 n = normalize(vec3(-(hf(p + vec2(e, 0.0)) - h0) / e, 1.0, -(hf(p + vec2(0.0, e)) - h0) / e));
  vec3 v = normalize(cameraPosition - vWorld);
  float nv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.12 + 0.88 * pow(1.0 - nv, 3.0);
  vec3 r = reflect(-v, n);
  // the sky we would see in the water: horizon haze -> mid -> top, day or night
  vec3 hor = mix(uDayHorizon, uNightHorizon, uT);
  vec3 mid = mix(uDayMid, uNightMid, uT);
  vec3 top = mix(uDayTop, uNightTop, uT);
  float up = clamp(r.y, 0.0, 1.0);
  vec3 sky = mix(hor, mid, smoothstep(0.0, 0.35, up));
  sky = mix(sky, top, smoothstep(0.35, 0.9, up));
  // the water itself: murky green-teal, clearer (lighter) over the steps on the south side
  vec3 deep = mix(vec3(0.05, 0.2, 0.2), vec3(0.01, 0.05, 0.09), uT);
  vec3 clear = mix(vec3(0.16, 0.38, 0.32), vec3(0.03, 0.09, 0.13), uT);
  float south = smoothstep(uZ.x + uZ.y * 0.05, uZ.x + uZ.y, vWorld.z);
  vec3 body = mix(deep, clear, south);
  vec3 col = mix(body, sky, fres);
  // a soft sun glint (warm in the day, a cold moon streak at night)
  vec3 L = normalize(vec3(-0.35, 0.65, -0.55));
  float spec = pow(clamp(dot(r, L), 0.0, 1.0), 90.0);
  col += mix(vec3(1.0, 0.82, 0.55), vec3(0.6, 0.7, 1.0), uT) * spec * mix(0.9, 0.5, uT);
  gl_FragColor = vec4(col, mix(0.9, 0.97, fres));
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function Water() {
  const mat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      vertexShader: waterVertex,
      fragmentShader: waterFragment,
      transparent: true,
      depthWrite: false,
      fog: true,
      toneMapped: false,
      uniforms: {
        ...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
        uTime: { value: 0 },
        uT: skyUniforms.uT,
        uDayTop: skyUniforms.uDayTop,
        uDayMid: skyUniforms.uDayMid,
        uDayHorizon: skyUniforms.uDayHorizon,
        uNightTop: skyUniforms.uNightTop,
        uNightMid: skyUniforms.uNightMid,
        uNightHorizon: skyUniforms.uNightHorizon,
        uSpout: { value: new THREE.Vector2(POND_SPOUT.x, POND_SPOUT.z + 0.6) },
        uZ: { value: new THREE.Vector2(POND_WATER.z, POND_WATER.d / 2) },
      },
    });
    return m;
  }, []);
  const geo = useMemo(() => new THREE.PlaneGeometry(POND_WATER.w, POND_WATER.d).rotateX(-Math.PI / 2), []);
  useEffect(
    () => () => {
      mat.dispose();
      geo.dispose();
    },
    [mat, geo],
  );
  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.elapsedTime;
  });
  return <mesh geometry={geo} material={mat} position={[POND_WATER.x, POND_WATER_Y, POND_WATER.z]} renderOrder={2} />;
}

// ------------------------------------------------------------------ peepal leaves

/** Phones / lite devices draw only the first part of the card list (cards are in random order, so it thins evenly). */
export const liteLeaves = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

function Leaves() {
  const geo = useMemo(() => {
    const g = chautariLeaves();
    if (liteLeaves()) g.setDrawRange(0, Math.floor((g.index!.count / 6) * 0.55) * 6);
    return g;
  }, []);
  const depth = useMemo(createLeafDepthMaterial, []);
  useEffect(
    () => () => {
      geo.dispose();
      depth.dispose();
    },
    [geo, depth],
  );
  // the only tree that casts shadows: the depth pass uses the same alpha cut, so the shadow is leaf-shaped
  return <mesh geometry={geo} material={getMaterials().leaf} customDepthMaterial={depth} castShadow />;
}

// ------------------------------------------------------------------ name tags (one atlas mesh)

const TAGS: { key: keyof typeof LABELS.places; at: [number, number, number]; height: number }[] = [
  { key: "temple", at: [PAGODA.x + 3.4, 7.6, PAGODA.z + 5.4], height: 1.15 },
  { key: "pond", at: [POND.x, 2.2, POND.z + 2.6], height: 0.95 },
  { key: "market", at: [0.5, 3.5, MARKET.stallZ + 0.4], height: 0.95 },
  { key: "chautari", at: [CHAUTARI.x, 3.4, CHAUTARI.z + 3.0], height: 0.95 },
];

const tagVertex = /* glsl */ `
attribute vec3 aCentre;
attribute vec2 aCorner;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mv = viewMatrix * vec4(aCentre, 1.0);
  mv.xy += aCorner;
  gl_Position = projectionMatrix * mv;
}`;
const tagFragment = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uMap, vUv);
  if (c.a < 0.02) discard;
  gl_FragColor = c;
  #include <colorspace_fragment>
}`;

function PlaceTags() {
  use(loadLabelFonts());
  const { geo, mat } = useMemo(() => {
    const draws = TAGS.map((t) => drawBilingual(LABELS.places[t.key].en, LABELS.places[t.key].ne, { bg: "rgba(58,36,24,0.78)", fg: "#fff6e4" }));
    const srcH = draws.map((d) => (d.tex.image as HTMLCanvasElement).height);
    const srcW = draws.map((d) => (d.tex.image as HTMLCanvasElement).width);
    const W = Math.max(...srcW);
    const H = srcH.reduce((a, b) => a + b, 0);
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    const pos: number[] = [];
    const centre: number[] = [];
    const corner: number[] = [];
    const uv: number[] = [];
    let y = 0;
    draws.forEach((d, i) => {
      g.drawImage(d.tex.image as HTMLCanvasElement, 0, y);
      const u1 = srcW[i] / W;
      const v0 = 1 - (y + srcH[i]) / H;
      const v1 = 1 - y / H;
      const hh = TAGS[i].height;
      const ww = hh * d.aspect;
      for (const [cx, cy, uu, vv] of [[-1, -1, 0, v0], [1, -1, u1, v0], [1, 1, u1, v1], [-1, -1, 0, v0], [1, 1, u1, v1], [-1, 1, 0, v1]] as const) {
        pos.push(0, 0, 0);
        centre.push(...TAGS[i].at);
        corner.push((cx * ww) / 2, (cy * hh) / 2);
        uv.push(uu, vv);
      }
      y += srcH[i];
      d.tex.dispose();
    });
    const geo2 = new THREE.BufferGeometry();
    geo2.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo2.setAttribute("aCentre", new THREE.Float32BufferAttribute(centre, 3));
    geo2.setAttribute("aCorner", new THREE.Float32BufferAttribute(corner, 2));
    geo2.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const m = new THREE.ShaderMaterial({
      vertexShader: tagVertex,
      fragmentShader: tagFragment,
      uniforms: { uMap: { value: tex } },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    return { geo: geo2, mat: m };
  }, []);
  useEffect(
    () => () => {
      geo.dispose();
      (mat.uniforms.uMap.value as THREE.Texture).dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  return <mesh geometry={geo} material={mat} renderOrder={5} frustumCulled={false} />;
}

export default function Places() {
  return (
    <group>
      <Water />
      <Leaves />
      <PlaceTags />
    </group>
  );
}
