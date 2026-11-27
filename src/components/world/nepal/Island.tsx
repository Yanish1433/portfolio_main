"use client";

// The floating island under the town. 3 draw calls in total, none of them cast or receive shadows
// (the shadow camera only covers the town): the rock mass, the floating rocks (one instanced mesh,
// bobbing in the vertex shader) and the waterfalls + mist (one strip mesh, one shader).
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { timeUniform } from "./materials";
import { skyUniforms } from "./Sky";
import { FLOAT_ROCKS, buildFallGeometry, buildFloatRockGeometry, buildIslandGeometry } from "./islandGeo";

const fallVertex = /* glsl */ `
attribute vec2 aUv;
attribute float aKind;
attribute float aSize;
varying vec2 vUv;
varying float vKind;
#include <fog_pars_vertex>
void main() {
  vUv = aUv;
  vKind = aKind;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  if (aKind > 0.5) mvPosition.xy += aUv * aSize; // mist quads face the camera
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const fallFragment = /* glsl */ `
uniform float uTime;
uniform float uT;
varying vec2 vUv;
varying float vKind;
#include <fog_pars_fragment>
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float a;
  vec3 c;
  vec3 day = vec3(0.92, 0.97, 1.0);
  vec3 night = vec3(0.42, 0.55, 0.85);
  if (vKind > 0.5) {
    float d = length(vUv);
    float wob = n2(vUv * 2.2 + vec2(uTime * 0.05, 0.0));
    a = pow(smoothstep(1.0, 0.0, d), 1.6) * (0.55 + 0.6 * wob) * 1.0;
    c = mix(day, night, uT) * mix(0.97, 0.8, uT);
  } else {
    float side = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
    float streak = n2(vec2(vUv.x * 7.0, vUv.y * 22.0 - uTime * 2.2));
    float streak2 = n2(vec2(vUv.x * 13.0 + 3.0, vUv.y * 12.0 - uTime * 1.5));
    a = side * (0.3 + 0.7 * streak * streak2 * 1.6) * (1.0 - smoothstep(0.55, 1.0, vUv.y)) * smoothstep(0.0, 0.03, vUv.y);
    a = clamp(a * 1.3, 0.0, 0.95);
    c = mix(day, night, uT) * (0.85 + 0.3 * streak);
  }
  gl_FragColor = vec4(c, a);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

export default function Island({ lite }: { lite: boolean }) {
  const rockRef = useRef<THREE.InstancedMesh>(null);
  const rockGeo = useMemo(buildIslandGeometry, []);
  const floatGeo = useMemo(buildFloatRockGeometry, []);
  const fallGeo = useMemo(buildFallGeometry, []);
  const rockMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true, side: THREE.DoubleSide, emissive: "#2a1e16" }), []);
  const floatMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true, side: THREE.DoubleSide, emissive: "#2a1e16" });
    // gentle bobbing: a sum of two slow sines, phase from the instance position (no per-frame matrix uploads)
    m.onBeforeCompile = (sh) => {
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
        );
    };
    m.customProgramCacheKey = () => "float-rock-bob";
    return m;
  }, []);
  const fallMat = useMemo(() => {
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uT: { value: 0 } }]);
    uniforms.uTime = timeUniform;
    uniforms.uT = skyUniforms.uT;
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
  }, []);

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
  }, [rocks]);

  return (
    <group>
      <mesh geometry={rockGeo} material={rockMat} frustumCulled={false} />
      <instancedMesh ref={rockRef} args={[floatGeo, floatMat, rocks.length]} frustumCulled={false} />
      <mesh geometry={fallGeo} material={fallMat} frustumCulled={false} renderOrder={2} />
    </group>
  );
}
