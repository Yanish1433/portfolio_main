"use client";

// The moving parts of the architecture dioramas (the plinths and buildings are merged into the
// town in hallParts.ts, the glowing roads are in the poster atlas):
// - packets: ONE InstancedMesh for the whole hall (1 draw call); small glowing beads travel the
//   road from the website end through each building to the last one. Reduced motion: they sit still.
// - labels: ONE mesh + canvas texture (1 draw call), built for the nearest diorama only and shown
//   only while the avatar is within LABEL_R m of it: the plain word large, the tech name small.
// Both hide when the avatar is more than CULL_R m from the dalan.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { playerPos } from "../input";
import { FONT_FAMILY } from "../nepal/LabelSprites";
import { DIORAMAS, STAND_Z, type Diorama } from "./layout";
import { at, merge, quad } from "./three";
import { debugHidden, dioramaStats } from "./spots";

/** Road: width, height above the plinth top, and its line (along the buildings' centres). */
export const ROAD_W = 0.035;
export const ROAD_Y = 0.012;
export const roadZ = (d: Diorama) => d.z - d.d * 0.12;

const LABEL_R = 5;
const CULL_R = 35;
const PACKET_SPEED = 0.22; // m/s
const MAX_LABELS = 5;
const CELL: [number, number] = [320, 136];
const LABEL_SIZE: [number, number] = [0.46, 0.46 * (CELL[1] / CELL[0])];

const roadEnds = (d: Diorama): [number, number] => [d.x + d.blocks[0].x, d.x + d.blocks[d.blocks.length - 1].x];
const packetsFor = (d: Diorama) => Math.max(2, d.blocks.length);

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);

function Packets({ reducedMotion }: { reducedMotion: boolean }) {
  const count = useMemo(() => DIORAMAS.reduce((a, { d }) => a + packetsFor(d), 0), []);
  const built = useMemo(() => {
    const geo = new THREE.OctahedronGeometry(0.017, 0);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff0c0").multiplyScalar(2.2), toneMapped: false });
    return { geo, mat };
  }, []);
  const mesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    mesh.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }, []);
  useEffect(
    () => () => {
      built.geo.dispose();
      built.mat.dispose();
    },
    [built],
  );
  const placed = useRef(false);
  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    m.visible = Math.hypot(playerPos.x, playerPos.z - STAND_Z) < CULL_R && !debugHidden.has("packets");
    if (!m.visible || (reducedMotion && placed.current)) return;
    const t = state.clock.elapsedTime;
    let i = 0;
    for (const { d } of DIORAMAS) {
      const [x0, x1] = roadEnds(d);
      const len = Math.max(0.1, x1 - x0);
      const n = packetsFor(d);
      for (let k = 0; k < n; k++) {
        const u = reducedMotion ? (k + 0.5) / n : (((t * PACKET_SPEED) / len + k / n) % 1 + 1) % 1;
        // fade in at the start / out at the end by shrinking
        const sc = reducedMotion ? 1 : Math.min(1, u * 8, (1 - u) * 8);
        _p.set(x0 + u * len, d.top + ROAD_Y + 0.02, roadZ(d) + 0.0);
        _s.setScalar(Math.max(0.001, sc));
        m.setMatrixAt(i++, _m.compose(_p, _q, _s));
      }
    }
    m.instanceMatrix.needsUpdate = true;
    placed.current = true;
  });
  if (!count) return null;
  return <instancedMesh ref={mesh} args={[built.geo, built.mat, count]} frustumCulled={false} />;
}

function drawLabel(g: CanvasRenderingContext2D, x: number, label: string, tech: string) {
  const [w, h] = CELL;
  const pad = 8;
  const bh = h - 22;
  g.clearRect(x, 0, w, h);
  g.beginPath();
  g.roundRect(x + pad, pad / 2, w - pad * 2, bh, 18);
  g.fillStyle = "rgba(255,248,236,0.96)";
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = "#c9a227";
  g.stroke();
  // pointer down to the building
  g.beginPath();
  g.moveTo(x + w / 2 - 12, pad / 2 + bh - 1);
  g.lineTo(x + w / 2, h - 2);
  g.lineTo(x + w / 2 + 12, pad / 2 + bh - 1);
  g.closePath();
  g.fillStyle = "#c9a227";
  g.fill();
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillStyle = "#3a2419";
  let size = 50;
  g.font = `600 ${size}px "${FONT_FAMILY}", system-ui, sans-serif`;
  while (size > 26 && g.measureText(label).width > w - pad * 4) g.font = `600 ${(size -= 2)}px "${FONT_FAMILY}", system-ui, sans-serif`;
  g.fillText(label, x + w / 2, pad / 2 + 56);
  size = 27;
  g.font = `400 ${size}px "${FONT_FAMILY}", system-ui, sans-serif`;
  let t = tech;
  while (t.length > 3 && g.measureText(t).width > w - pad * 4) t = `${t.slice(0, -2)}…`;
  g.fillStyle = "#6b4a36";
  g.fillText(t, x + w / 2, pad / 2 + 96);
  g.textAlign = "start";
}

function Labels() {
  const built = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = CELL[0] * MAX_LABELS;
    canvas.height = CELL[1];
    const g = canvas.getContext("2d")!;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
    return { canvas, g, tex, mat };
  }, []);
  const mesh = useRef<THREE.Mesh>(null);
  const shown = useRef<number>(-1);
  const last = useRef(-1);

  const build = (k: number) => {
    const m = mesh.current;
    if (!m) return;
    const { d } = DIORAMAS[k];
    const blocks = d.blocks.slice(0, MAX_LABELS);
    blocks.forEach((b, i) => drawLabel(built.g, i * CELL[0], b.label, b.tech));
    built.tex.needsUpdate = true;
    const W = built.canvas.width;
    const geos = blocks.map((b, i) => {
      // alternate heights so neighbouring labels never overlap; tilted back toward the 45° camera
      const y = d.top + 0.3 + LABEL_SIZE[1] / 2 + (i % 2) * (LABEL_SIZE[1] + 0.03);
      const tilt = new THREE.Matrix4().makeRotationX(-0.5);
      const m4 = tilt.premultiply(at(d.x + b.x, y, roadZ(d) + 0.04));
      return quad(LABEL_SIZE[0], LABEL_SIZE[1], m4, [(i * CELL[0]) / W, 0, CELL[0] / W, 1]);
    });
    m.geometry.dispose();
    m.geometry = merge(geos);
  };

  useEffect(
    () => () => {
      mesh.current?.geometry.dispose();
      built.mat.dispose();
      built.tex.dispose();
    },
    [built],
  );

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const now = state.clock.elapsedTime;
    if (now - last.current < 0.15) return;
    last.current = now;
    let best = -1;
    let bestD = LABEL_R;
    DIORAMAS.forEach(({ d }, i) => {
      const dist = Math.hypot(playerPos.x - d.x, playerPos.z - d.z);
      if (dist < bestD) {
        best = i;
        bestD = dist;
      }
    });
    if (Math.hypot(playerPos.x, playerPos.z - STAND_Z) > CULL_R) best = -1;
    if (best !== shown.current && best >= 0) build(best);
    shown.current = best;
    m.visible = best >= 0 && !debugHidden.has("labels");
  });

  return <mesh ref={mesh} material={built.mat} visible={false} renderOrder={4} />;
}

/** ?debug: which diorama shows labels (automated checks). */
export const dioramaDebug = () => ({ count: DIORAMAS.length, mergedTris: dioramaStats.tris, list: DIORAMAS.map(({ stand, d }) => ({ key: stand.spot.key, x: d.x, z: d.z, top: d.top, blocks: d.blocks.map((b) => b.label) })) });

export default function Dioramas({ reducedMotion }: { reducedMotion: boolean }) {
  if (!DIORAMAS.length) return null;
  return (
    <group>
      <Packets reducedMotion={reducedMotion} />
      <Labels />
    </group>
  );
}
