"use client";

// The Work Journey path: each stone of the lane (zones.ts MILESTONES, one per stop of the
// captain's real journey, see ../journey.ts) lights up when the avatar runs past it, and stays lit.
// Two draw calls in all: the glowing parts of every stone on ONE InstancedMesh (per-instance
// colour), and ONE atlas mesh with every stone's caption (per-vertex brightness). The stone
// bodies themselves stay in the town's merged meshes. Reduced motion: everything is lit from the
// start and nothing fades.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MILESTONES } from "../zones";
import { JOURNEY } from "../journey";
import { playerPos } from "../input";
import { FONT_FAMILY } from "./LabelSprites";
import { at, makeAtlas, merge, quad, useFontsSettled } from "../halls/three";
import { uvRect } from "../halls/atlas";
import { NEXT_MILESTONE_TEXT, type Milestone } from "@/lib/robot/journey";

const LIT_R = 2.1;
const FADE_S = 0.6;
const CAPTION_W = 1.95;
const CAPTION_H = 0.98;
const CAPTION_PX: [number, number] = [780, Math.round((780 * CAPTION_H) / CAPTION_W)];
const YAW = Math.PI * 0.25;
const UNLIT = new THREE.Color("#5c5249");
const LIT = new THREE.Color("#ffcf5a");
const DIM = 0.5;

const font = (w: number, px: number) => `${w} ${px}px "${FONT_FAMILY}", system-ui, sans-serif`;

function fit(g: CanvasRenderingContext2D, text: string, weight: number, px: number, max: number) {
  let s = px;
  g.font = font(weight, s);
  while (s > 20 && g.measureText(text).width > max) {
    s -= 2;
    g.font = font(weight, s);
  }
}

function drawCaption(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, m: Milestone) {
  const next = m.kind === "next";
  g.save();
  g.fillStyle = next ? "#8f2f1d" : "#f7ecd0";
  g.beginPath();
  g.roundRect(x + 4, y + 4, w - 8, h - 8, 18);
  g.fill();
  g.strokeStyle = "#c9a227";
  g.lineWidth = 5;
  g.stroke();
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  const cx = x + w / 2;
  const max = w - 48;
  if (next) {
    // "Next milestone: your company?" on two lines (the text is NEXT_MILESTONE_TEXT)
    const [first, second] = NEXT_MILESTONE_TEXT.split(": ");
    g.fillStyle = "#ffe9b0";
    fit(g, `${first}:`, 700, 78, max);
    g.fillText(`${first}:`, cx, y + h * 0.42);
    g.fillStyle = "#fff4d2";
    fit(g, second, 700, 92, max);
    g.fillText(second, cx, y + h * 0.82);
  } else {
    // a big year / headline and at most two short lines
    const rows = m.short.slice(0, 2);
    g.fillStyle = m.kind === "now" ? "#a8322a" : "#8a5a1e";
    fit(g, m.head, 700, 128, max);
    g.fillText(m.head, cx, y + h * (rows.length > 1 ? 0.37 : 0.46));
    g.fillStyle = "#3a2419";
    rows.forEach((l, i) => {
      fit(g, l, 700, 70, max);
      g.fillText(l, cx, y + h * (rows.length > 1 ? 0.62 + i * 0.2 : 0.8));
    });
  }
  g.restore();
}

function useCaptionAtlas() {
  return useMemo(() => {
    const atlas = makeAtlas(JOURNEY.map(() => CAPTION_PX));
    const redraw = () => {
      JOURNEY.forEach((m, i) => {
        const r = atlas.rects[i];
        drawCaption(atlas.g, r.x, r.y, r.w, r.h, m);
      });
      atlas.tex.needsUpdate = true;
    };
    redraw();
    return { atlas, redraw };
  }, []);
}

export default function Milestones({ reducedMotion }: { reducedMotion: boolean }) {
  const { atlas, redraw } = useCaptionAtlas();
  useFontsSettled(redraw);
  useEffect(() => () => atlas.tex.dispose(), [atlas]);
  const n = Math.min(MILESTONES.length, JOURNEY.length);
  // 0 = dark, 1 = lit, per stone; a stone lights once the avatar has been within LIT_R and stays lit
  const lit = useRef<Float32Array>(new Float32Array(n).fill(reducedMotion ? 1 : 0));
  const glow = useRef<THREE.InstancedMesh>(null);
  const caps = useRef<THREE.Mesh>(null);

  const built = useMemo(() => {
    // the glowing parts, in a stone's local frame (face = +z): an inscription plate and a flame bead on top
    const plate = new THREE.PlaneGeometry(0.26, 0.5).translate(0, 0.55, 0.082);
    const bead = new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.3, 0);
    const geo = merge([plate, bead]);
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    // captions: quads standing over each stone, facing the same way
    const geos = Array.from({ length: n }, (_, i) => {
      const [x, z] = MILESTONES[i];
      return quad(CAPTION_W, CAPTION_H, at(x, 2.05, z, 0).multiply(at(0, 0, 0.1)), uvRect(atlas.rects[i], atlas.canvas.width, atlas.canvas.height));
    });
    const cgeo = geos.length ? merge(geos) : new THREE.BufferGeometry();
    const colours = new Float32Array(cgeo.attributes.position ? cgeo.attributes.position.count * 3 : 0);
    cgeo.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    const cmat = new THREE.MeshBasicMaterial({ map: atlas.tex, vertexColors: true, toneMapped: false, side: THREE.DoubleSide, transparent: true, depthWrite: false });
    return { geo, mat, cgeo, cmat, colours };
  }, [atlas, n]);
  useEffect(
    () => () => {
      built.geo.dispose();
      built.mat.dispose();
      built.cgeo.dispose();
      built.cmat.dispose();
    },
    [built],
  );

  const tmp = useMemo(() => new THREE.Color(), []);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const paint = () => {
    const im = glow.current;
    if (!im) return;
    for (let i = 0; i < n; i++) {
      const k = lit.current[i];
      im.setColorAt(i, tmp.copy(UNLIT).lerp(LIT, k));
      const v = DIM + (1 - DIM) * k;
      const quadStart = i * 6; // 2 triangles per caption quad, 3 vertices each (non-indexed)
      for (let j = 0; j < 6; j++) {
        const o = (quadStart + j) * 3;
        built.colours[o] = built.colours[o + 1] = built.colours[o + 2] = v;
      }
    }
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    (built.cgeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  };
  useEffect(() => {
    const im = glow.current;
    if (!im) return;
    for (let i = 0; i < n; i++) {
      const [x, z] = MILESTONES[i];
      im.setMatrixAt(i, m4.copy(at(x, 0, z, YAW)));
    }
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    paint();
  });

  useFrame((_, dt) => {
    if (reducedMotion) return;
    let changed = false;
    for (let i = 0; i < n; i++) {
      const [x, z] = MILESTONES[i];
      const near = Math.hypot(playerPos.x - x, playerPos.z - z) < LIT_R;
      if ((near || lit.current[i] > 0) && lit.current[i] < 1) {
        lit.current[i] = Math.min(1, lit.current[i] + Math.min(dt, 0.1) / FADE_S);
        changed = true;
      }
    }
    if (changed) paint();
  });

  if (!n) return null;
  return (
    <>
      <instancedMesh ref={glow} args={[built.geo, built.mat, n]} frustumCulled={false} />
      <mesh ref={caps} geometry={built.cgeo} material={built.cmat} renderOrder={3} />
    </>
  );
}
