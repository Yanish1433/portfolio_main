"use client";

// The Workshop: a board of large carved plaques, one per GitHub-only project (name, one-line blurb, tech chips).
// Budget: 2 draw calls. All plaque faces (plus the banner) are quads of ONE atlas mesh; the posts, beam and
// backing board are one merged mesh. Hidden beyond WORKSHOP_FAR m. Walking up / tapping opens the Workshop panel.
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
import { BOARD_HALF, BOARD_TOP, PLAQUES, PLAQUE_H, PLAQUE_W, TOP_Y, WALL_Z, WORKSHOP, WORKSHOP_FAR, WORKSHOP_X } from "./workshopLayout";

/** Atlas cell per plaque (px). 400 px per metre: the name's letters stay crisp at the walk-up view (step13b). */
const PLAQUE_PX: [number, number] = [540, 420];
const BANNER_PX: [number, number] = [1024, 160];
const BANNER_W = 2.6;
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

/** The blurb cut to one short line: its first clause, at most `max` characters. */
export function shortBlurb(text: string, max = 42): string {
  const clause = text.split(/[:;.,]| - /)[0].trim();
  const t = clause.length >= 12 ? clause : text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

const ICONS: Record<string, [string, string]> = {
  react: ["Re", "#2b8fb3"],
  typescript: ["TS", "#2f6fb5"],
  "three.js": ["3D", "#3d3d3d"],
  "react three fiber": ["3D", "#3d3d3d"],
  tailwind: ["Tw", "#1f9aa8"],
  vite: ["Vi", "#7a52c7"],
  express: ["Ex", "#4a4a4a"],
  mongodb: ["Mo", "#2f7d4f"],
  mongoose: ["Mo", "#2f7d4f"],
  jwt: ["JW", "#b23a6a"],
  zod: ["Zo", "#2b5fa3"],
  zustand: ["Zu", "#8a5a1e"],
  tanstack: ["TQ", "#c0392b"],
  gemini: ["Ge", "#4a6fd0"],
  python: ["Py", "#c9a227"],
  node: ["No", "#3c873a"],
  next: ["Nx", "#222222"],
};
const PALETTE = ["#8f2f1d", "#2f6a4f", "#2b5fa3", "#8a5a1e", "#6a3a8a", "#1f7a8a"];

/** Short code + colour of a tech chip: a known name, else its first two letters on a palette colour. */
export function techIcon(name: string): { code: string; colour: string } {
  const key = name.toLowerCase();
  const hit = Object.keys(ICONS).find((k) => key.startsWith(k) || key.includes(k));
  if (hit) return { code: ICONS[hit][0], colour: ICONS[hit][1] };
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { code: (name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2) || "?").replace(/^./, (c) => c.toUpperCase()), colour: PALETTE[h % PALETTE.length] };
}

function drawPlaque(g: CanvasRenderingContext2D, r: Rect, w: WorkshopProject) {
  g.save();
  g.fillStyle = "#f4e6c4";
  g.fillRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16);
  g.strokeStyle = "#b8862b";
  g.lineWidth = 10;
  g.strokeRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16);
  // red header strip with the badge
  g.fillStyle = "#8f2f1d";
  g.fillRect(r.x + 8, r.y + 8, r.w - 16, 52);
  g.fillStyle = "#ffe9b0";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = font(800, 30);
  g.fillText("CODE ONLY · GITHUB", r.x + r.w / 2, r.y + 35);
  g.textBaseline = "alphabetic";
  const cx = r.x + r.w / 2;
  const max = r.w - 56;
  // the repo name: as big as fits in at most two lines
  let size = 92;
  let lines: string[] = [];
  for (; size >= 52; size -= 4) {
    g.font = font(800, size);
    lines = wrapLines(g, w.name, max);
    if (lines.length <= 2 && lines.every((l) => g.measureText(l).width <= max)) break;
  }
  g.fillStyle = "#3a2419";
  const nameTop = r.y + 70;
  const lineH = size * 1.05;
  lines.slice(0, 2).forEach((l, i) => g.fillText(l, cx, nameTop + size * 0.85 + i * lineH, max));
  // one short line about it
  g.font = font(600, 36);
  g.fillStyle = "#6b4a3a";
  g.fillText(shortBlurb(w.blurb), cx, r.y + 70 + 2 * lineH + 28, max);
  // tech chips (up to four)
  const chips = w.stack.slice(0, 4).map(techIcon);
  const d = 56;
  const gap = 18;
  const total = chips.length * d + (chips.length - 1) * gap;
  chips.forEach((c, i) => {
    const x = cx - total / 2 + i * (d + gap) + d / 2;
    const y = r.y + r.h - 56;
    g.fillStyle = c.colour;
    g.beginPath();
    g.arc(x, y, d / 2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff6dc";
    g.font = font(800, 26);
    g.textBaseline = "middle";
    g.fillText(c.code, x, y + 2);
    g.textBaseline = "alphabetic";
  });
  g.restore();
}

function drawBanner(g: CanvasRenderingContext2D, r: Rect) {
  g.save();
  g.fillStyle = "#8f2f1d";
  g.beginPath();
  g.roundRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8, 26);
  g.fill();
  g.strokeStyle = "#c9a227";
  g.lineWidth = 8;
  g.stroke();
  g.fillStyle = "#ffe9b0";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = font(800, 84);
  g.fillText("Workshop · More on GitHub", r.x + r.w / 2, r.y + r.h / 2 + 4, r.w - 80);
  g.restore();
}

export default function Workshop() {
  const group = useRef<THREE.Group>(null);
  const atlas = useMemo(() => makeAtlas([...WORKSHOP.map(() => PLAQUE_PX), BANNER_PX]), []);
  const redraw = useMemo(
    () => () => {
      WORKSHOP.forEach((w, i) => drawPlaque(atlas.g, atlas.rects[i], w));
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
    const faces = WORKSHOP.map((_, i) => quad(PLAQUE_W, PLAQUE_H, at(PLAQUES[i].x, PLAQUES[i].y, WALL_Z + 0.03), uvRect(atlas.rects[i], W, H)));
    faces.push(quad(BANNER_W, BANNER_H, at(WORKSHOP_X, BOARD_TOP + 0.4, WALL_Z + 0.03), uvRect(atlas.rects[WORKSHOP.length], W, H)));
    const geo = merge(faces);
    const mat = new THREE.MeshBasicMaterial({ map: atlas.tex, toneMapped: false, color: new THREE.Color(0.84, 0.84, 0.84), side: THREE.DoubleSide });
    // two posts, a top beam, and a backing board for the plaques to hang on, plus a frame bar under every row
    const span = BOARD_HALF * 2;
    const bottom = Math.min(...PLAQUES.map((p) => p.y)) - PLAQUE_H / 2;
    const parts: THREE.BufferGeometry[] = [new THREE.BoxGeometry(span, 0.12, 0.16).applyMatrix4(at(WORKSHOP_X, BOARD_TOP, WALL_Z - 0.02))];
    for (const sx of [-1, 1]) parts.push(new THREE.BoxGeometry(0.16, BOARD_TOP + 0.1, 0.16).applyMatrix4(at(WORKSHOP_X + sx * (BOARD_HALF - 0.08), (BOARD_TOP + 0.1) / 2, WALL_Z - 0.02)));
    parts.push(new THREE.BoxGeometry(span - 0.2, TOP_Y - bottom + 0.4, 0.05).applyMatrix4(at(WORKSHOP_X, (TOP_Y + bottom) / 2, WALL_Z - 0.04)));
    for (const y of new Set(PLAQUES.map((p) => p.y))) parts.push(new THREE.BoxGeometry(span - 0.2, 0.06, 0.08).applyMatrix4(at(WORKSHOP_X, y - PLAQUE_H / 2 - 0.09, WALL_Z + 0.01)));
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
