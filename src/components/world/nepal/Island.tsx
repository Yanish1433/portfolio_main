"use client";

// The floating island under the town. 3 draw calls in total, none of them cast or receive shadows
// (the shadow camera only covers the town): the rock mass (standard material + a solid-noise detail
// patch, so it is lit by the time-of-day sun and fog), the floating rocks (one instanced mesh, bobbing
// and orbiting in the vertex shader) and the waterfalls + spray + mist (one mesh, one shader).
// Everything mounts at load (no lazy shader), so the warm-up behind the loading screen compiles it.
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getMaterials, timeUniform } from "./materials";
import { skyUniforms } from "./Sky";
import { FALL, FLOAT_ROCKS, buildFallGeometry, buildFloatRockGeometry, floatLeafGeometry, buildIslandGeometry } from "./islandGeo";

/** Falling-water clock: runs at a quarter speed under reduced motion, so the water still reads as water. */
const flowUniform = { value: 0 };

const fallVertex = /* glsl */ `
attribute vec2 aUv;
attribute float aKind;
attribute float aSize;
attribute float aSeed;
uniform float uTime;
varying vec2 vUv;
varying float vKind;
varying float vSeed;
varying vec3 vWPos;
varying vec3 vN;
#include <fog_pars_vertex>
void main() {
  vUv = aUv;
  vKind = aKind;
  vSeed = aSeed;
  vec3 p = position;
  vN = normalize(vec3(p.x, 0.0, p.z) + 1e-4);
  if (aKind > 0.5) p += vec3(sin(uTime * 0.21 + aSeed * 5.0), cos(uTime * 0.17 + aSeed * 3.0) * 0.5, cos(uTime * 0.19 + aSeed * 7.0)) * 0.9;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vWPos = p;
  if (aKind > 0.5) {
    float sz = aSize * (1.0 + 0.07 * sin(uTime * 0.4 + aSeed * 6.0)); // mist and spray cards face the camera
    mvPosition.xy += aUv * sz;
    vWPos += (vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]) * aUv.x + vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]) * aUv.y) * sz;
  }
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const fallFragment = /* glsl */ `
uniform float uFlow;
uniform float uTime;
uniform float uT;
uniform float uLite;
uniform vec3 uSunDir;
varying vec2 vUv;
varying float vKind;
varying float vSeed;
varying vec3 vWPos;
varying vec3 vN;
#include <fog_pars_fragment>
#define POOL ${FALL.pool.toFixed(3)}
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 hsv(float h, float s, float v) {
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}
void main() {
  float a;
  vec3 c;
  vec3 night = vec3(0.45, 0.58, 0.88);
  if (vKind > 0.5) {
    // mist / spray: a soft drifting puff, with a faint rainbow in the daytime sun
    float d = length(vUv);
    float wob = n2(vUv * 2.4 + vec2(uTime * 0.05 + vSeed, uTime * 0.03));
    float spray = vKind > 1.5 ? 1.0 : 0.0;
    a = pow(smoothstep(1.0, 0.0, d), mix(1.5, 1.1, spray)) * (0.5 + 0.6 * wob) * mix(1.0, 0.8, spray);
    c = mix(vec3(0.95, 0.98, 1.0), night, uT) * mix(0.97, 0.8, uT);
    vec3 ray = normalize(vWPos - cameraPosition);
    float ang = degrees(acos(clamp(dot(ray, -normalize(uSunDir)), -1.0, 1.0)));
    float x = (ang - 39.5) / 3.5;
    float band = smoothstep(0.0, 0.15, x) * smoothstep(1.0, 0.85, x);
    float sunUp = smoothstep(0.05, 0.4, uSunDir.y) * (1.0 - uT);
    c += hsv(0.75 * (1.0 - clamp(x, 0.0, 1.0)), 0.85, 1.0) * band * sunUp * a * 0.55;
  } else {
    float x = vUv.x;
    float edge = min(x, 1.0 - x) * 2.0;
    float inPool = 1.0 - smoothstep(POOL - 0.012, POOL + 0.02, vUv.y);
    float t = max(vUv.y - POOL, 0.0) / (1.0 - POOL);
    float flow = uFlow;
    // the fall speeds up as it drops: stretch the streaks with depth
    float sy = t * 46.0 - flow * 7.0;
    float warp = (n2(vec2(x * 5.0 + vSeed, sy * 0.1)) - 0.5) * 0.35 * (1.0 - uLite);
    float s1 = n2(vec2((x + warp) * 15.0 + vSeed * 9.0, sy * 0.28));
    float s2 = mix(0.5, n2(vec2(x * 33.0, sy * 0.55 + 7.0)), 1.0 - uLite);
    float streak = s1 * 0.6 + s2 * 0.4;
    // rapids on the lip: slower, choppy, white-capped
    float chop = n2(vec2(x * 11.0 + vSeed, vUv.y * 120.0 - flow * 1.6));
    float chop2 = mix(0.5, n2(vec2(x * 23.0, vUv.y * 260.0 + flow * 2.2)), 1.0 - uLite);
    float rap = chop * 0.6 + chop2 * 0.4;
    float foamPool = smoothstep(0.55, 0.82, rap) * inPool;
    // foam band where the water leaves the lip, plus wisps that grow toward the bottom
    float lipFoam = (1.0 - inPool) * exp(-t * 26.0) * (0.75 + 0.5 * s1) + inPool * smoothstep(POOL * 0.75, POOL, vUv.y) * 0.6;
    float wisp = smoothstep(0.62, 0.92, n2(vec2(x * 9.0 + 4.0, sy * 0.2))) * (0.25 + 0.6 * t) * (1.0 - inPool);
    float foam = clamp(foamPool + lipFoam + wisp, 0.0, 1.0);
    vec3 deep = mix(vec3(0.15, 0.46, 0.6), vec3(0.04, 0.11, 0.28), uT);
    vec3 light = mix(vec3(0.88, 0.96, 1.0), night, uT);
    float body = mix(streak, rap, inPool);
    c = mix(deep, light, clamp(body * 1.15 - 0.22 + foam, 0.0, 1.0));
    // a lighter edge, fresnel tint, sun glitter on the rapids
    vec3 V = normalize(cameraPosition - vWPos);
    float fres = pow(1.0 - abs(dot(vN, V)), 2.5);
    c = mix(c, light, (1.0 - smoothstep(0.0, 0.3, edge)) * 0.55);
    c += light * fres * 0.3;
    float glitter = pow(n2(vec2(x * 45.0, vUv.y * 300.0 + flow * 3.0)), 14.0) * 1.6 * inPool * (1.0 - uT) * (1.0 - uLite);
    c += vec3(1.0, 0.96, 0.85) * glitter;
    // translucent: thinner in the middle of the fall, opaque at the foam, ragged at the edges
    float rag = n2(vec2(vUv.y * 40.0 - flow * 2.0, vSeed * 3.0)) * 0.12;
    a = 0.42 + 0.38 * streak + 0.2 * fres + 0.5 * foam;
    a *= smoothstep(0.0, 0.1 + rag, edge);
    a *= 1.0 - smoothstep(0.55, 1.0, t);
    a *= mix(1.0, smoothstep(0.0, POOL * 0.9, vUv.y), inPool);
    a = clamp(a, 0.0, 0.96);
    c *= mix(1.0, 0.85, uT);
  }
  gl_FragColor = vec4(c, a);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

// Rock detail: solid 3D noise in world space (no UV seams, no texture to download), applied as a colour
// grain + strata streaks and as a small normal perturbation, on top of the baked vertex colour / AO.
function patchRock(m: THREE.MeshStandardMaterial, lite: boolean) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vRP;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vRP;
        float rh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float rn(vec3 p) {
          vec3 i = floor(p); vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(rh(i), rh(i + vec3(1,0,0)), f.x), mix(rh(i + vec3(0,1,0)), rh(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(rh(i + vec3(0,0,1)), rh(i + vec3(1,0,1)), f.x), mix(rh(i + vec3(0,1,1)), rh(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        // squashed in y: horizontal, layered grain
        float rockH(vec3 p) {
          vec3 q = p * vec3(1.0, 2.2, 1.0);
          float h = rn(q * 0.9) * 0.55 + rn(q * 2.7) * 0.3${lite ? "" : " + rn(q * 7.3) * 0.15"};
          return h;
        }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float rg = rockH(vRP);
        diffuseColor.rgb *= 0.72 + 0.55 * rg + 0.08 * sin(vRP.y * 2.4 + rg * 5.0);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          const float e = 0.07;
          vec3 g = vec3(rockH(vRP + vec3(e, 0.0, 0.0)) - rg, rockH(vRP + vec3(0.0, e, 0.0)) - rg, rockH(vRP + vec3(0.0, 0.0, e)) - rg) / e;
          vec3 wn = normalize(normal * mat3(viewMatrix));
          wn = normalize(wn - 0.32 * (g - dot(g, wn) * wn));
          normal = normalize(mat3(viewMatrix) * wn);
        }`,
      );
  };
  m.customProgramCacheKey = () => (lite ? "island-rock-lite" : "island-rock");
}

/** Bob + orbit of a floating rock, injected into any instanced material (rock and leaves share it, so they cannot drift apart). */
function applyFloatMotion(sh: { uniforms: Record<string, unknown>; vertexShader: string }) {
  sh.uniforms.uTime = timeUniform;
  sh.vertexShader = sh.vertexShader
    .replace("#include <common>", "#include <common>\nuniform float uTime;")
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
      vec3 ip = instanceMatrix[3].xyz;
      float ph = ip.x * 0.37 + ip.z * 0.61;
      transformed.y += sin(uTime * 0.5 + ph) * 0.1 + sin(uTime * 0.23 + ph * 1.7) * 0.06;
      transformed.x += sin(uTime * 0.31 + ph * 2.3) * 0.04;
      #endif`,
    )
    .replace(
      "#include <project_vertex>",
      `vec4 mvPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
      mvPosition = instanceMatrix * mvPosition;
      float oa = uTime * (0.012 + 0.012 * fract(ph * 3.1)) * (fract(ph * 7.7) > 0.5 ? 1.0 : -1.0);
      mvPosition.xz += vec2(ip.x * (cos(oa) - 1.0) - ip.z * sin(oa), ip.x * sin(oa) + ip.z * (cos(oa) - 1.0));
      #endif
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`,
    );
}

export default function Island({ lite, reducedMotion = false }: { lite: boolean; reducedMotion?: boolean }) {
  const rockRef = useRef<THREE.InstancedMesh>(null);
  const leafRef = useRef<THREE.InstancedMesh>(null);
  const rockGeo = useMemo(buildIslandGeometry, []);
  const floatGeo = useMemo(buildFloatRockGeometry, []);
  const fallGeo = useMemo(() => buildFallGeometry(lite), [lite]);
  const rockMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, emissive: "#2a1e16" });
    patchRock(m, lite);
    return m;
  }, [lite]);
  const floatMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true, side: THREE.DoubleSide, emissive: "#2a1e16" });
    // gentle bobbing: a sum of two slow sines, phase from the instance position (no per-frame matrix uploads);
    // and a slow orbit around the island's axis, each rock at its own speed and direction
    m.onBeforeCompile = applyFloatMotion;
    m.customProgramCacheKey = () => "float-rock-bob-orbit";
    return m;
  }, []);
  const leafGeo = useMemo(() => floatLeafGeometry(lite), [lite]);
  const leafMat = useMemo(() => {
    // the town's leaf material (atlas, sway, translucency) + the same bob/orbit as the rocks
    const base = getMaterials().leaf as THREE.MeshStandardMaterial;
    const m = base.clone();
    m.onBeforeCompile = (sh, r) => {
      base.onBeforeCompile(sh, r);
      applyFloatMotion(sh);
    };
    m.customProgramCacheKey = () => "float-rock-leaves";
    return m;
  }, []);
  const fallMat = useMemo(() => {
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uT: { value: 0 }, uFlow: { value: 0 }, uLite: { value: lite ? 1 : 0 }, uSunDir: { value: new THREE.Vector3() } }]);
    uniforms.uTime = timeUniform;
    uniforms.uT = skyUniforms.uT;
    uniforms.uFlow = flowUniform;
    uniforms.uSunDir = skyUniforms.uSunDir;
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: fallVertex,
      fragmentShader: fallFragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
      toneMapped: false,
    });
  }, [lite]);

  useFrame((_, dt) => {
    flowUniform.value += Math.min(dt, 0.1) * (reducedMotion ? 0.25 : 1);
  });

  const rocks = useMemo(() => (lite ? FLOAT_ROCKS.slice(0, 5) : FLOAT_ROCKS), [lite]);
  useLayoutEffect(() => {
    const m = rockRef.current;
    if (!m) return;
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const mat = new THREE.Matrix4();
    const col = new THREE.Color();
    const tints = ["#ffffff", "#f0e6d8", "#e8ecf0", "#f6ecd6"];
    rocks.forEach(([x, y, z, s, yaw], i) => {
      q.setFromEuler(e.set(0.05 * Math.sin(i * 2.1), yaw, 0.06 * Math.cos(i * 1.3)));
      m.setMatrixAt(i, mat.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s)));
      m.setColorAt(i, col.set(tints[i % tints.length]));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    const l = leafRef.current;
    if (l) {
      l.instanceMatrix.copyArray(m.instanceMatrix.array);
      l.instanceMatrix.needsUpdate = true;
    }
  }, [rocks]);

  return (
    <group>
      <mesh geometry={rockGeo} material={rockMat} frustumCulled={false} />
      <instancedMesh ref={rockRef} args={[floatGeo, floatMat, rocks.length]} frustumCulled={false} />
      <instancedMesh ref={leafRef} args={[leafGeo, leafMat, rocks.length]} frustumCulled={false} />
      <mesh geometry={fallGeo} material={fallMat} frustumCulled={false} renderOrder={2} />
    </group>
  );
}
