"use client";

// One floating label per row of pots, in plain words ("Websites & apps (frontend)"). All rows share ONE
// atlas texture and ONE merged mesh (1 draw call). Shown only within 8 m of the square. The labels sit at
// the rows' north end and alternate in height so neighbouring rows (0.9 m apart) never overlap.
import { use, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FONT_FAMILY, loadLabelFonts } from "../nepal/LabelSprites";
import { uvRect } from "../halls/atlas";
import { at, makeAtlas, merge, quad, useAnisotropy, useFontsSettled } from "../halls/three";
import { POT_ROW_Z } from "../zones";
import { POTS } from "./potData";
import { glazeOf, plainGroup, rowsOf } from "./potLayout";
import { CULL_R, skillsHidden, squareDist } from "./SkillPots";

export const LABEL_R = 8;
const CELL: [number, number] = [440, 150];
const SIZE: [number, number] = [1.3, 1.3 * (CELL[1] / CELL[0])];

function drawCell(g: CanvasRenderingContext2D, x: number, y: number, category: string, label: string) {
  const [w, h] = CELL;
  const { plain, tech } = plainGroup(category, label);
  g.clearRect(x, y, w, h);
  g.beginPath();
  g.roundRect(x + 6, y + 6, w - 12, h - 40, 26);
  g.fillStyle = "rgba(255,248,236,0.96)";
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = glazeOf(category);
  g.stroke();
  // pointer down to the row's pots
  g.beginPath();
  g.moveTo(x + w / 2 - 18, y + h - 36);
  g.lineTo(x + w / 2, y + h - 4);
  g.lineTo(x + w / 2 + 18, y + h - 36);
  g.closePath();
  g.fillStyle = glazeOf(category);
  g.fill();
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillStyle = "#3a2419";
  let size = 58;
  g.font = `600 ${size}px "${FONT_FAMILY}", system-ui, sans-serif`;
  while (size > 30 && g.measureText(plain).width > w - 56) g.font = `600 ${(size -= 2)}px "${FONT_FAMILY}", system-ui, sans-serif`;
  g.fillText(plain, x + w / 2, y + (tech ? 70 : 88));
  if (tech) {
    g.font = `400 36px "${FONT_FAMILY}", system-ui, sans-serif`;
    g.fillStyle = "#6b4a36";
    g.fillText(`(${tech})`, x + w / 2, y + 116);
  }
  g.textAlign = "start";
}

export default function PotLabels() {
  use(loadLabelFonts());
  const rows = useMemo(() => rowsOf(POTS), []);
  const built = useMemo(() => {
    const atlas = makeAtlas(rows.map(() => CELL));
    const redraw = () => {
      rows.forEach((r, i) => drawCell(atlas.g, atlas.rects[i].x, atlas.rects[i].y, r.category, r.label));
      atlas.tex.needsUpdate = true;
    };
    redraw();
    const tilt = new THREE.Matrix4().makeRotationX(-0.45);
    const geos = rows.map((r, i) => {
      const y = 0.95 + SIZE[1] / 2 + (i % 2) * (SIZE[1] + 0.05);
      return quad(SIZE[0], SIZE[1], tilt.clone().premultiply(at(r.x, y, POT_ROW_Z[0] - 0.1)), uvRect(atlas.rects[i], atlas.canvas.width, atlas.canvas.height));
    });
    const geo = geos.length ? merge(geos) : new THREE.BufferGeometry();
    const mat = new THREE.MeshBasicMaterial({ map: atlas.tex, transparent: true, depthWrite: false, toneMapped: false });
    return { atlas, geo, mat, redraw };
  }, [rows]);
  useAnisotropy(built.atlas.tex);
  useFontsSettled(built.redraw);
  useEffect(
    () => () => {
      built.geo.dispose();
      built.mat.dispose();
      built.atlas.tex.dispose();
    },
    [built],
  );
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (mesh.current) mesh.current.visible = squareDist() < Math.min(LABEL_R, CULL_R) && !skillsHidden.has("labels");
  });
  if (!rows.length) return null;
  return <mesh ref={mesh} geometry={built.geo} material={built.mat} renderOrder={4} visible={false} />;
}
