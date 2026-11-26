"use client";

// The Workshop: a wall of hanging paper scrolls, one per GitHub-only project.
// Budget: 2 draw calls. All scroll faces (plus the banner) are quads of ONE atlas mesh; the beam and
// rods are one merged mesh. Hidden beyond WORKSHOP_FAR m. Walking up / tapping opens the Workshop panel.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { WorkshopProject } from "@/content/profile";
import { playerPos } from "../input";
import { FONT_FAMILY } from "../nepal/LabelSprites";
import { register, themeTargets } from "../nepal/themeState";
import { uvRect, type Rect } from "./atlas";
import { at, makeAtlas, merge, quad, useAnisotropy, useFontsSettled } from "./three";
import { debugHidden } from "./spots";
import { BOARD_HALF, ROD_Y, SCROLL_H, SCROLL_W, SCROLL_XS, WALL_Z, WORKSHOP, WORKSHOP_FAR, WORKSHOP_X } from "./workshopLayout";

const SCROLL_PX: [number, number] = [256, 512];
const BANNER_PX: [number, number] = [768, 128];
const BANNER_W = 1.8;
const BANNER_H = BANNER_W * (BANNER_PX[1] / BANNER_PX[0]);

const font = (w: number, px: number) => `${w} ${px}px "${FONT_FAMILY}", system-ui, sans-serif`;

function wrapLines(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > max) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

function drawScroll(g: CanvasRenderingContext2D, r: Rect, w: WorkshopProject) {
  g.save();
  g.fillStyle = "#f4e6c4";
  g.fillRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16);
  g.strokeStyle = "#b8862b";
  g.lineWidth = 6;
  g.strokeRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16);
  g.fillStyle = "#8f2f1d";
  g.fillRect(r.x + 8, r.y + 8, r.w - 16, 26);
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  const cx = r.x + r.w / 2;
  const max = r.w - 44;
  g.fillStyle = "#3a2419";
  g.font = font(800, 40);
  const lines = wrapLines(g, w.name, max).slice(0, 3);
  lines.forEach((l, i) => g.fillText(l, cx, r.y + 92 + i * 46, max));
  g.font = font(600, 26);
  g.fillStyle = "#6b4a3a";
  w.stack.slice(0, 4).forEach((t, i) => g.fillText(t, cx, r.y + 270 + i * 34, max));
  g.fillStyle = "#8f2f1d";
  g.beginPath();
  g.roundRect(r.x + 36, r.y + r.h - 86, r.w - 72, 44, 22);
  g.fill();
  g.fillStyle = "#ffe9b0";
  g.font = font(800, 24);
  g.fillText("CODE ONLY", cx, r.y + r.h - 56);
  g.restore();
}

function drawBanner(g: CanvasRenderingContext2D, r: Rect) {
  g.save();
  g.fillStyle = "#8f2f1d";
  g.beginPath();
  g.roundRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8, 20);
  g.fill();
  g.strokeStyle = "#c9a227";
  g.lineWidth = 6;
  g.stroke();
  g.fillStyle = "#ffe9b0";
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.font = font(800, 62);
  g.fillText("Workshop · More on GitHub", r.x + r.w / 2, r.y + r.h * 0.66, r.w - 60);
  g.restore();
}

export default function Workshop() {
  const group = useRef<THREE.Group>(null);
  const atlas = useMemo(() => makeAtlas([...WORKSHOP.map(() => SCROLL_PX), BANNER_PX]), []);
  const redraw = useMemo(
    () => () => {
      WORKSHOP.forEach((w, i) => drawScroll(atlas.g, atlas.rects[i], w));
      drawBanner(atlas.g, atlas.rects[WORKSHOP.length]);
      atlas.tex.needsUpdate = true;
    },
    [atlas],
  );
  useMemo(() => redraw(), [redraw]);
  useFontsSettled(redraw);
  useAnisotropy(atlas.tex);

  const built = useMemo(() => {
    const W = atlas.canvas.width;
    const H = atlas.canvas.height;
    const faces = WORKSHOP.map((_, i) => quad(SCROLL_W, SCROLL_H, at(SCROLL_XS[i], ROD_Y - SCROLL_H / 2 - 0.04, WALL_Z), uvRect(atlas.rects[i], W, H)));
    faces.push(quad(BANNER_W, BANNER_H, at(WORKSHOP_X, ROD_Y + 0.42, WALL_Z), uvRect(atlas.rects[WORKSHOP.length], W, H)));
    const geo = merge(faces);
    const mat = new THREE.MeshBasicMaterial({ map: atlas.tex, toneMapped: false, color: new THREE.Color(0.84, 0.84, 0.84), side: THREE.DoubleSide });
    // beam + a rod at the top and bottom of each scroll
    const span = BOARD_HALF * 2;
    const parts = [new THREE.BoxGeometry(span, 0.09, 0.14).applyMatrix4(at(WORKSHOP_X, ROD_Y + 0.05, WALL_Z - 0.02))];
    // a post at each end and a backing board for the scrolls to hang on
    for (const sx of [-1, 1]) parts.push(new THREE.BoxGeometry(0.12, ROD_Y + 0.1, 0.14).applyMatrix4(at(WORKSHOP_X + sx * (BOARD_HALF - 0.06), (ROD_Y + 0.1) / 2, WALL_Z - 0.02)));
    parts.push(new THREE.BoxGeometry(span - 0.2, SCROLL_H + 0.25, 0.04).applyMatrix4(at(WORKSHOP_X, ROD_Y - SCROLL_H / 2 - 0.06, WALL_Z - 0.06)));
    for (const x of SCROLL_XS) {
      parts.push(new THREE.BoxGeometry(SCROLL_W + 0.1, 0.045, 0.05).applyMatrix4(at(x, ROD_Y - 0.035, WALL_Z + 0.015)));
      parts.push(new THREE.BoxGeometry(SCROLL_W + 0.1, 0.045, 0.05).applyMatrix4(at(x, ROD_Y - SCROLL_H - 0.06, WALL_Z + 0.015)));
    }
    const beamGeo = merge(parts);
    const beamMat = new THREE.MeshStandardMaterial({ color: "#6b3a22", roughness: 0.8 });
    return { geo, mat, beamGeo, beamMat };
  }, [atlas]);

  useEffect(() => register(themeTargets.glows, { mat: built.mat, day: 0.84, night: 1.12 }), [built]);
  useEffect(
    () => () => {
      atlas.tex.dispose();
      built.geo.dispose();
      built.mat.dispose();
      built.beamGeo.dispose();
      built.beamMat.dispose();
    },
    [atlas, built],
  );

  useFrame(() => {
    const g = group.current;
    if (g) g.visible = Math.hypot(playerPos.x - WORKSHOP_X, playerPos.z - WALL_Z) < WORKSHOP_FAR && !debugHidden.has("workshop");
  });

  if (!WORKSHOP.length) return null;
  return (
    <group ref={group}>
      <mesh geometry={built.geo} material={built.mat} />
      <mesh geometry={built.beamGeo} material={built.beamMat} />
    </group>
  );
}
