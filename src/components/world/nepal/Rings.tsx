"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { zones, type Zone } from "../zones";
import { useWorld } from "@/store/world";

/** Glowing marigold ring at a zone entrance; brightens while the avatar stands in it. */
function EntranceRing({ zone, reducedMotion }: { zone: Zone; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const discMat = useRef<THREE.MeshBasicMaterial>(null);
  const glow = new THREE.Color(zone.color).multiplyScalar(1.4);

  useFrame((state) => {
    const active = useWorld.getState().activeZone === zone.id;
    const pulse = reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 2.2 + zone.ring[0]) * 0.5 + 0.5;
    if (ringMat.current) ringMat.current.opacity = active ? 1 : 0.6 + pulse * 0.25;
    if (discMat.current) discMat.current.opacity = active ? 0.4 : 0.1 + pulse * 0.08;
    if (group.current) {
      const s = active ? 1.06 : 1 + pulse * 0.03;
      group.current.scale.set(s, 1, s);
    }
  });

  return (
    <group ref={group} position={[zone.ring[0], 0.05, zone.ring[1]]}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[zone.ringRadius - 0.14, zone.ringRadius, 48]} />
        <meshBasicMaterial ref={ringMat} color={glow} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.004}>
        <ringGeometry args={[zone.ringRadius - 0.42, zone.ringRadius - 0.34, 48]} />
        <meshBasicMaterial ref={discMat} color={glow} transparent toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

export default function Rings({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <group>
      {zones.map((z) => (
        <EntranceRing key={z.id} zone={z} reducedMotion={reducedMotion} />
      ))}
    </group>
  );
}
