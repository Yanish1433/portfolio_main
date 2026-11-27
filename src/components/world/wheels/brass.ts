// The brass drum of a prayer wheel: smooth cylinder with raised rim bands, a thin ornamental band and a low dome, plus ONE canvas
// atlas (a row per wheel) that carries the engraved group name (Kalam Bold, dark recessed ink with a light top edge) and the brushing.
// All five names share one material: the instance's row is picked in the vertex shader (aRow), so the drums stay ONE draw call.
import * as THREE from "three";
import { DRUM_H, DRUM_R } from "./wheelLayout";
import { NAME_REPEATS } from "./spin";

export const DRUM_SEGMENTS = 32;

/** Kalam Bold canvas font string. */
export const kalamBold = (px: number) => `700 ${px}px "Kalam", "Mukta", system-ui, sans-serif`;
let kalamP: Promise<void> | null = null;
/** Resolves once Kalam Bold (Latin) is ready for canvas drawing. Never rejects. */
export function loadKalamBold(): Promise<void> {
  if (!kalamP) kalamP = document.fonts.load('700 64px "Kalam"', "Websites & apps Launching running").then(() => undefined, () => undefined);
  return kalamP;
}
/** Atlas row (px): the circumference of the drum is NAME_REPEATS cells wide. */
export const ROW_W = 1024;
export const ROW_H = 560;
/** Vertical layout of a drum, as a fraction of its height: rim, name band, ornament, name band, rim. */
export const BANDS = {
  rimLow: [0, 0.06],
  nameLow: [0.08, 0.45],
  orn: [0.47, 0.53],
  nameHigh: [0.55, 0.92],
  rimHigh: [0.94, 1],
} as const;

/** Drum profile in authored units: [radius factor, height fraction]. */
const PROFILE: [number, number][] = [
  [0.9, 0],
  [1.0, 0],
  [1.07, 0.008],
  [1.07, 0.052],
  [1.0, 0.06], // lower rim band
  [1.0, 0.46],
  [1.045, 0.468],
  [1.045, 0.532],
  [1.0, 0.54], // ornamental band
  [1.0, 0.94],
  [1.07, 0.948],
  [1.07, 0.992],
  [1.0, 1.0], // upper rim band
  [0.93, 1.012], // domed cap
  [0.78, 1.045],
  [0.55, 1.075],
  [0.28, 1.095],
  [0, 1.105],
];
/** Height (m, before the instance scale) of the dome above the drum's top. */
export const DOME_H = (PROFILE[PROFILE.length - 1][1] - 1) * DRUM_H;

/** Brass drum geometry, radius DRUM_R, height DRUM_H (+ dome). u runs around (names centred on +z), v is the height fraction. */
export function makeBrassGeo(): THREE.BufferGeometry {
  const pts = PROFILE.map(([r, y]) => new THREE.Vector2(r * DRUM_R, y * DRUM_H));
  // phiStart puts the middle of the first name cell on +z
  const g = new THREE.LatheGeometry(pts, DRUM_SEGMENTS, -Math.PI / NAME_REPEATS, Math.PI * 2);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, Math.min(1, Math.max(0, pos.getY(i) / DRUM_H)));
  return g;
}

const mulberry = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** The biggest size (px) at which `text` fits `maxW` x `maxH` in at most two lines (balanced), and the lines. */
function fitTwoLines(g: CanvasRenderingContext2D, text: string, maxW: number, maxH: number, face: (px: number) => string) {
  const words = text.split(/\s+/).filter(Boolean);
  const splits: string[][] = [[words.join(" ")]];
  for (let i = 1; i < words.length; i++) splits.push([words.slice(0, i).join(" "), words.slice(i).join(" ")]);
  for (let size = 120; size >= 30; size -= 3) {
    g.font = face(size);
    let best: string[] | null = null;
    let bestW = Infinity;
    for (const lines of splits) {
      if (lines.length * size * 0.96 > maxH) continue;
      const w = Math.max(...lines.map((l) => g.measureText(l).width));
      if (w <= maxW && w < bestW) {
        best = lines;
        bestW = w;
      }
    }
    if (best) return { size, lines: best };
  }
  return { size: 30, lines: splits[splits.length - 1] };
}

export type BrassAtlas = { colour: THREE.CanvasTexture; bump: THREE.CanvasTexture; draw: (names: string[]) => void; rows: number };

/** Two canvases (colour and bump), `rows` rows high. `draw` (re)paints every row; call it again once the font has loaded. */
export function makeBrassAtlas(rows: number, face: (px: number) => string): BrassAtlas {
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = ROW_W;
    c.height = ROW_H * rows;
    return c;
  };
  const cc = mk();
  const bc = mk();
  const cg = cc.getContext("2d")!;
  const bg = bc.getContext("2d")!;
  const colour = new THREE.CanvasTexture(cc);
  colour.colorSpace = THREE.SRGBColorSpace;
  colour.wrapS = THREE.RepeatWrapping;
  const bump = new THREE.CanvasTexture(bc);
  bump.wrapS = THREE.RepeatWrapping;
  // rows of the canvas run top to bottom; v = 1 - y / height, so row r (top first) is at v-row rows-1-r
  const y0 = (r: number, f: number) => r * ROW_H + (1 - f) * ROW_H;

  const draw = (names: string[]) => {
    for (let r = 0; r < rows; r++) {
      const rnd = mulberry(r * 977 + 13);
      const top = r * ROW_H;
      // brushed brass: a pale base with fine vertical streaks (colour) and ridges (bump)
      cg.fillStyle = "#e4dfd6";
      cg.fillRect(0, top, ROW_W, ROW_H);
      bg.fillStyle = "#808080";
      bg.fillRect(0, top, ROW_W, ROW_H);
      for (let k = 0; k < 520; k++) {
        const x = rnd() * ROW_W;
        const y = top + rnd() * ROW_H;
        const len = 40 + rnd() * 240;
        const a = 0.04 + rnd() * 0.09;
        const dark = rnd() < 0.5;
        cg.fillStyle = dark ? `rgba(90,60,20,${a})` : `rgba(255,255,255,${a})`;
        cg.fillRect(x, y, 1 + (rnd() < 0.2 ? 1 : 0), len);
        bg.fillStyle = dark ? `rgba(0,0,0,${a * 1.6})` : `rgba(255,255,255,${a * 1.6})`;
        bg.fillRect(x, y, 1, len);
      }
      // thin engraved lines on the rims and either side of the ornament
      for (const f of [0.065, 0.455, 0.545, 0.935]) {
        cg.fillStyle = "rgba(40,22,8,0.55)";
        cg.fillRect(0, y0(r, f), ROW_W, 2);
        bg.fillStyle = "#303030";
        bg.fillRect(0, y0(r, f), ROW_W, 3);
      }
      // ornament: a chain of small lozenges
      const oy = (y0(r, BANDS.orn[0]) + y0(r, BANDS.orn[1])) / 2;
      const step = ROW_W / (NAME_REPEATS * 12);
      for (let x = step / 2; x < ROW_W; x += step) {
        for (const [g, ink, edge] of [
          [cg, "rgba(40,22,8,0.85)", "rgba(255,255,255,0.9)"],
          [bg, "#202020", "#d0d0d0"],
        ] as const) {
          g.beginPath();
          g.moveTo(x - 9, oy + 1);
          g.lineTo(x, oy - 9);
          g.lineTo(x + 9, oy + 1);
          g.lineTo(x, oy + 11);
          g.closePath();
          g.fillStyle = edge;
          g.save();
          g.translate(0, -2);
          g.fill();
          g.restore();
          g.fillStyle = ink;
          g.fill();
        }
      }
      // the name: engraved twice per cell (both bands), dark recessed ink with a light top edge
      const name = names[r] ?? "";
      const cellW = ROW_W / NAME_REPEATS;
      const bandH = (BANDS.nameLow[1] - BANDS.nameLow[0]) * ROW_H;
      const { size, lines } = fitTwoLines(cg, name, cellW * 0.9, bandH * 0.9, face);
      for (const g of [cg, bg]) {
        g.font = face(size);
        g.textAlign = "center";
        g.textBaseline = "alphabetic";
      }
      const lh = size * 0.96;
      for (const band of [BANDS.nameLow, BANDS.nameHigh]) {
        const mid = (y0(r, band[0]) + y0(r, band[1])) / 2;
        for (let k = 0; k < NAME_REPEATS; k++) {
          const cx = ((k + 0.5) / NAME_REPEATS) * ROW_W;
          lines.forEach((l, i) => {
            const by = mid - ((lines.length - 1) / 2) * lh + i * lh + size * 0.3;
            cg.fillStyle = "#ffffff"; // light top edge
            cg.fillText(l, cx, by - 3);
            cg.fillStyle = "rgba(30,16,6,0.96)"; // dark recessed ink
            cg.fillText(l, cx, by);
            bg.fillStyle = "#d8d8d8";
            bg.fillText(l, cx, by - 3);
            bg.fillStyle = "#101010"; // recessed
            bg.fillText(l, cx, by);
          });
        }
      }
    }
    colour.needsUpdate = true;
    bump.needsUpdate = true;
  };
  return { colour, bump, draw, rows };
}

/** Make `mat` pick its atlas row from the per-instance attribute `aRow` (the row's v offset, 0..rows-1, counted from the bottom). */
export function pickAtlasRows(mat: THREE.MeshStandardMaterial, rows: number) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\nattribute float aRow;`)
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        float rowV = (uv.y + aRow) / ${rows.toFixed(1)};
        #ifdef USE_MAP
          vMapUv.y = rowV;
        #endif
        #ifdef USE_BUMPMAP
          vBumpMapUv.y = rowV;
        #endif`,
      );
  };
  mat.customProgramCacheKey = () => `brass-rows-${rows}`;
}
