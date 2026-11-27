"use client";

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { zones } from "../zones";
import { useWorld } from "@/store/world";

/**
 * Glowing marigold rings at every zone entrance, merged into ONE mesh (2 rings per zone, vertex
 * colour + alpha). Each ring brightens while the avatar stands in it and pulses gently; the
 * per-frame work is a position/alpha rewrite of ~1.7k vertices on the CPU.
 */
function buildRings() {
  const pos: number[] = [];
  const idx: number[] = [];
  const base: { zone: number; kind: 0 | 1; start: number; count: number }[] = [];
  const rel: number[] = []; // vertex offsets from the zone centre (x, z)
  const cols: number[] = [];
  zones.forEach((zone, zi) => {
    const c = new THREE.Color(zone.color).multiplyScalar(1.4);
    ([[zone.ringRadius - 0.14, zone.ringRadius, 0], [zone.ringRadius - 0.42, zone.ringRadius - 0.34, 1]] as const).forEach(([ri, ro, kind]) => {
      const g = new THREE.RingGeometry(ri, ro, 48);
      g.rotateX(-Math.PI / 2);
      const start = pos.length / 3;
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        rel.push(p.getX(i), p.getZ(i));
        pos.push(zone.ring[0] + p.getX(i), 0.05 + kind * 0.004, zone.ring[1] + p.getZ(i));
        cols.push(c.r, c.g, c.b, 0.6);
      }
      for (const j of g.index!.array) idx.push(start + j);
      base.push({ zone: zi, kind, start, count: p.count });
    });
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 4));
  geo.setIndex(idx);
  return { geo, base, rel };
}

function RingsMesh({ reducedMotion }: { reducedMotion: boolean }) {
  const { geo, base, rel } = useMemo(buildRings, []);
  useFrame((state) => {
    const p = geo.attributes.position as THREE.BufferAttribute;
    const c = geo.attributes.color as THREE.BufferAttribute;
    const active = useWorld.getState().activeZone;
    for (const b of base) {
      const zone = zones[b.zone];
      const on = active === zone.id;
      const pulse = reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 2.2 + zone.ring[0]) * 0.5 + 0.5;
      const alpha = b.kind === 0 ? (on ? 1 : 0.6 + pulse * 0.25) : on ? 0.4 : 0.1 + pulse * 0.08;
      const s = on ? 1.06 : 1 + pulse * 0.03;
      for (let i = b.start; i < b.start + b.count; i++) {
        p.setX(i, zone.ring[0] + rel[i * 2] * s);
        p.setZ(i, zone.ring[1] + rel[i * 2 + 1] * s);
        c.setW(i, alpha);
      }
    }
    p.needsUpdate = true;
    c.needsUpdate = true;
  });
  return (
    <mesh geometry={geo} frustumCulled={false}>
      <meshBasicMaterial vertexColors transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

export default function Rings({ reducedMotion }: { reducedMotion: boolean }) {
  return <RingsMesh reducedMotion={reducedMotion} />;
}
