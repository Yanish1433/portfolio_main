"use client";

// Glowing threads from the chosen pot to every project stand that used its skill, plus a gentle pulse on
// those stands' screens. Two draw calls in total:
// - threads: ONE merged tube mesh for all arcs, with a dash shader that runs along each arc
//   (reduced motion: the dashes stand still)
// - pulse: ONE InstancedMesh of additive quads laid over the matching screens
// Both fade in, and out after 8 s (threads.ts), and restart when another pot is chosen.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useWorld } from "@/store/world";
import { STANDS } from "../halls/layout";
import { POTS, standsForPot } from "./potData";
import { CULL_R, skillsHidden, squareDist } from "./SkillPots";
import { threadAlpha, threadBuffers, type V3 } from "./threads";

const VERT = /* glsl */ `
attribute float aU;
varying float vU;
void main() {
  vU = aU;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uFade;
uniform vec3 uColor;
varying float vU;
void main() {
  // about 14 dashes per arc, running from the pot toward the stand
  float d = fract(vU * 14.0 - uTime * 0.7);
  float dash = smoothstep(0.0, 0.12, d) * (1.0 - smoothstep(0.52, 0.64, d));
  // the ends melt into the pot and the screen
  float ends = smoothstep(0.0, 0.05, vU) * (1.0 - smoothstep(0.95, 1.0, vU));
  float a = dash * ends * uFade;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * 1.8, a);
  #include <colorspace_fragment>
}`;

const pulseGeo = new THREE.PlaneGeometry(1, 1);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export default function Threads({ reducedMotion }: { reducedMotion: boolean }) {
  const selected = useWorld((s) => s.potSelected);
  const selectedAt = useWorld((s) => s.potSelectedAt);

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: { uTime: { value: 0 }, uFade: { value: 0 }, uColor: { value: new THREE.Color("#ffd870") } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const pulseMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd870").multiplyScalar(1.6), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), []);
  const mesh = useRef<THREE.Mesh>(null);
  const pulse = useRef<THREE.InstancedMesh>(null);
  const geo = useRef<THREE.BufferGeometry | null>(null);

  // Rebuild the arcs (and which screens pulse) whenever a pot is chosen.
  useEffect(() => {
    const m = mesh.current;
    const pm = pulse.current;
    if (!m || !pm) return;
    geo.current?.dispose();
    geo.current = null;
    const stands = selected === null ? [] : standsForPot(selected);
    const pot = selected === null ? null : POTS[selected];
    if (pot && stands.length) {
      const from: V3 = [pot.x, 0.02 + 0.62 * pot.height + 0.12, pot.z];
      // to the lower middle of each stand's screen
      const to: V3[] = stands.map((s) => [s.x, s.screen.y - s.screen.h * 0.3, s.z + 0.3]);
      const b = threadBuffers(from, to);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(b.positions, 3));
      g.setAttribute("aU", new THREE.BufferAttribute(b.u, 1));
      g.setIndex(new THREE.BufferAttribute(b.indices, 1));
      g.computeBoundingSphere();
      geo.current = g;
      m.geometry = g;
    }
    STANDS.forEach((s, i) => {
      const on = stands.includes(s);
      const sc = on ? 1 : 0;
      pm.setMatrixAt(i, _m.compose(_p.set(s.x, s.screen.y, s.z + 0.042), _q.identity(), _s.set(s.screen.w * sc, s.screen.h * sc, 1)));
    });
    pm.instanceMatrix.needsUpdate = true;
  }, [selected, selectedAt]);

  useEffect(
    () => () => {
      geo.current?.dispose();
      mat.dispose();
      pulseMat.dispose();
    },
    [mat, pulseMat],
  );

  useFrame((state) => {
    const m = mesh.current;
    const pm = pulse.current;
    if (!m || !pm) return;
    const w = useWorld.getState();
    const age = (performance.now() - w.potSelectedAt) / 1000;
    const a = w.potSelected === null || squareDist() > CULL_R ? 0 : threadAlpha(age);
    m.visible = a > 0 && !!geo.current && !skillsHidden.has("threads");
    pm.visible = a > 0 && !skillsHidden.has("pulse");
    if (m.visible) {
      mat.uniforms.uFade.value = a;
      mat.uniforms.uTime.value = reducedMotion ? 0 : state.clock.elapsedTime;
    }
    if (pm.visible) pulseMat.opacity = a * (reducedMotion ? 0.2 : 0.16 + 0.12 * Math.sin(state.clock.elapsedTime * 4.2));
  });

  if (!STANDS.length) return null;
  return (
    <group>
      <mesh ref={mesh} material={mat} frustumCulled={false} visible={false} renderOrder={5}>
        <bufferGeometry />
      </mesh>
      <instancedMesh ref={pulse} args={[pulseGeo, pulseMat, STANDS.length]} frustumCulled={false} visible={false} renderOrder={5} raycast={() => null} />
    </group>
  );
}
