"use client";

// Golden footprints that light the path to a section. ONE instanced mesh (one draw call, hidden when idle);
// the sequential pulse, the pop-in, the fade as Lakhey passes and the final fade all run in the shader
// from a per-instance index plus a few uniforms, so nothing is re-uploaded per frame.
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useWorld } from "@/store/world";
import { playerPos } from "../input";
import { findPath } from "../nav";
import { arrivedAt, footprintsAlong, GUIDE_TTL_MS, MAX_FOOTPRINTS, passedIndex, type Footprint } from "./footprints";

const FOOT_Y = 0.09;
const VERT = /* glsl */ `
  attribute float aIdx;
  attribute float aSide;
  varying vec2 vUv;
  varying float vIdx;
  varying float vSide;
  void main() {
    vUv = uv;
    vIdx = aIdx;
    vSide = aSide;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uStart;
  uniform float uPassed;
  uniform float uAlpha;
  uniform float uMotion;
  varying vec2 vUv;
  varying float vIdx;
  varying float vSide;
  float ell(vec2 p, vec2 c, vec2 r) { return length((p - c) / r); }
  void main() {
    vec2 p = (vUv - 0.5) * vec2(0.26, 0.44);
    // a sole and a toe pad, the toe leaning a little toward the inside of each foot
    float e = min(ell(p, vec2(0.0, -0.05), vec2(0.07, 0.13)), ell(p, vec2(0.012 * vSide, 0.135), vec2(0.056, 0.056)));
    float body = 1.0 - smoothstep(0.82, 1.0, e);
    float halo = (1.0 - smoothstep(1.0, 1.9, e)) * 0.35;
    float reveal = mix(1.0, smoothstep(0.0, 1.0, (uTime - uStart) * 30.0 - vIdx), uMotion);
    float passed = clamp(vIdx - uPassed + 1.0, 0.0, 1.0);
    float pulse = mix(0.8, 0.55 + 0.45 * sin(uTime * 4.0 - vIdx * 0.7), uMotion);
    float a = (body + halo) * reveal * passed * uAlpha * (0.55 + 0.45 * pulse);
    if (a < 0.01) discard;
    vec3 gold = mix(vec3(1.0, 0.72, 0.2), vec3(1.0, 0.9, 0.5), pulse * body);
    gl_FragColor = vec4(gold * (1.0 + 0.5 * pulse), a);
  }
`;

export default function GuideFootprints() {
  const guide = useWorld((s) => s.guide);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const run = useRef({ fps: [] as Footprint[], start: 0, passedInt: 0, passed: 0, endAt: -1, seq: -1 });

  const { geometry, material, idx, side } = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.26, 0.44);
    g.rotateX(Math.PI / 2); // lie flat, +v toward +z
    const idx = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FOOTPRINTS), 1);
    const side = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FOOTPRINTS), 1);
    g.setAttribute("aIdx", idx);
    g.setAttribute("aSide", side);
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      uniforms: { uTime: { value: 0 }, uStart: { value: 0 }, uPassed: { value: 0 }, uAlpha: { value: 1 }, uMotion: { value: 1 } },
    });
    return { geometry: g, material: m, idx, side };
  }, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  // A new target (or a re-pick): find the path from where Lakhey stands and lay the footprints.
  useEffect(() => {
    const m = mesh.current;
    const r = run.current;
    if (!m || !guide) return;
    const path = findPath([playerPos.x, playerPos.z], guide.to);
    const fps = path ? footprintsAlong(path) : [];
    if (!fps.length) {
      useWorld.getState().setGuide(null);
      return;
    }
    const d = new THREE.Object3D();
    fps.forEach((f, i) => {
      d.position.set(f.x, FOOT_Y, f.z);
      d.rotation.set(0, f.heading, 0);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      idx.setX(i, i);
      side.setX(i, f.left ? 1 : -1);
    });
    m.count = fps.length;
    m.instanceMatrix.needsUpdate = true;
    idx.needsUpdate = true;
    side.needsUpdate = true;
    material.uniforms.uMotion.value = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 1;
    Object.assign(r, { fps, start: -1, passedInt: 0, passed: 0, endAt: -1, seq: guide.seq });
  }, [guide, idx, side, material]);

  useFrame((state, dt) => {
    const m = mesh.current;
    const g = useWorld.getState().guide;
    const r = run.current;
    if (!m) return;
    if (!g || r.seq !== g.seq) {
      m.visible = false;
      return;
    }
    const now = state.clock.elapsedTime;
    if (r.start < 0) r.start = now;
    m.visible = true;
    const u = material.uniforms;
    r.passedInt = passedIndex(r.fps, playerPos.x, playerPos.z, r.passedInt);
    r.passed += (r.passedInt - r.passed) * Math.min(1, dt * 8);
    if (r.endAt < 0 && arrivedAt(playerPos.x, playerPos.z, g.to, g.radius)) r.endAt = now;
    const age = now - r.start;
    const ttlFade = Math.min(1, (GUIDE_TTL_MS / 1000 - age) / 1.5);
    const arriveFade = r.endAt < 0 ? 1 : 1 - (now - r.endAt) / 0.7;
    const alpha = Math.max(0, Math.min(ttlFade, arriveFade));
    u.uTime.value = now;
    u.uStart.value = r.start;
    u.uPassed.value = r.passed;
    u.uAlpha.value = alpha;
    if (alpha <= 0) useWorld.getState().setGuide(null);
  });

  return <instancedMesh ref={mesh} args={[geometry, material, MAX_FOOTPRINTS]} frustumCulled={false} visible={false} renderOrder={3} />;
}
