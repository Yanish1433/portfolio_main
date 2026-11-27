"use client";

// Text of the gallery, in ONE atlas texture and ONE mesh (1 draw call):
//  - a carved plaque below every wheel with the group name in plain words ("Websites & apps (frontend)")
//  - the glowing ring of skill names for the CHOSEN wheel only: a flat, camera-facing arc above it, at most
//    8 names (the strongest), big plain names. The ring cells are redrawn and the geometry rebuilt when the
//    choice changes; the HTML card carries the full detail.
// Shown only within PLAQUE_R of the gallery; the ring stays while a wheel is chosen.
import { use, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useWorld } from "@/store/world";
import { FONT_FAMILY, loadLabelFonts } from "../nepal/LabelSprites";
import { uvRect } from "../halls/atlas";
import { makeAtlas, merge, quad, useAnisotropy, useFontsSettled } from "../halls/three";
import { PLAQUE, plaqueHeight, plaqueWidth } from "./frame";
import { CULL_R, galleryDist, galleryHidden } from "./WheelGallery";
import { WHEELS } from "./wheelData";
import { accentOf, plainGroup, RING_CELL, RING_H, RING_MAX, RING_W, ringSkills, ringSlot, SIGN_CELL, SIGN_INNER_W, fitLabel } from "./wheelLayout";

export const PLAQUE_R = 14;
/** Signboard cell (px): a wide carved dark-wood board; the group name in big Kalam Bold, the technical word beneath (step14b). */
const CELL = SIGN_CELL;
const RING_SIZE: [number, number] = [RING_W, RING_H];
const RING_Y = 3.0;
const RING_Z = 1.15;

const font = (weight: number, px: number) => `${weight} ${px}px "${FONT_FAMILY}", system-ui, sans-serif`;
const KALAM = "Kalam";
const kalam = (weight: number, px: number) => `${weight} ${px}px "${KALAM}", "${FONT_FAMILY}", system-ui, sans-serif`;

let kalamPromise: Promise<void> | null = null;
/** Kalam's faces load only for matching text (unicode-range), so ask for both the Latin and the Devanagari cuts. Never rejects. */
function loadKalam(): Promise<void> {
  if (!kalamPromise) {
    kalamPromise = Promise.all([
      document.fonts.load(`700 64px "${KALAM}"`, "Websites & apps"),
      document.fonts.load(`400 40px "${KALAM}"`, "frontend"),
      document.fonts.load(`400 40px "${KALAM}"`, "सीप"),
    ])
      .then(() => undefined)
      .catch(() => undefined);
  }
  return kalamPromise;
}

/** Measure with the canvas in Kalam Bold (the font must be loaded first, see loadKalam). */
function fitName(g: CanvasRenderingContext2D, text: string, max: number) {
  return fitLabel(text, max, (t, size) => {
    g.font = kalam(700, size);
    return g.measureText(t).width;
  });
}

function drawPlaque(g: CanvasRenderingContext2D, x: number, y: number, category: string, label: string) {
  const [w, h] = CELL;
  const { plain } = plainGroup(category, label);
  g.clearRect(x, y, w, h);
  // carved dark wood with a faint grain
  const wood = g.createLinearGradient(x, y, x, y + h);
  wood.addColorStop(0, "#3b2417");
  wood.addColorStop(1, "#2a190f");
  g.beginPath();
  g.roundRect(x + 4, y + 4, w - 8, h - 8, 20);
  g.fillStyle = wood;
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = "rgba(255,210,150,0.06)";
  g.lineWidth = 2;
  for (let k = 0; k < 14; k++) {
    const gy = y + 14 + k * (h / 13.5);
    g.beginPath();
    g.moveTo(x, gy);
    g.bezierCurveTo(x + w * 0.3, gy + 6 * Math.sin(k), x + w * 0.65, gy - 7 * Math.cos(k), x + w, gy + 3);
    g.stroke();
  }
  g.restore();
  g.beginPath();
  g.roundRect(x + 4, y + 4, w - 8, h - 8, 20);
  g.lineWidth = 8;
  g.strokeStyle = accentOf(category);
  g.stroke();
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  const { size, lines } = fitName(g, plain, SIGN_INNER_W);
  g.font = kalam(700, size);
  const lh = size * 0.98;
  const top = y + (h - lines.length * lh) / 2;
  lines.forEach((l, i) => {
    const by = top + size * 0.82 + i * lh;
    g.fillStyle = "rgba(0,0,0,0.55)"; // carved shadow
    g.fillText(l, x + w / 2 + 2, by + 3);
    g.fillStyle = "#f6cf74"; // warm gold ink
    g.fillText(l, x + w / 2, by);
  });
  g.textAlign = "start";
}

function drawRing(g: CanvasRenderingContext2D, x: number, y: number, text: string, colour: string) {
  const [w, h] = RING_CELL;
  g.clearRect(x, y, w, h);
  if (!text) return;
  g.beginPath();
  g.roundRect(x + 5, y + 5, w - 10, h - 10, h / 2 - 5);
  g.fillStyle = "rgba(40,24,10,0.78)";
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = colour;
  g.stroke();
  g.textAlign = "center";
  g.textBaseline = "middle";
  let size = 54;
  g.font = font(700, size);
  while (size > 26 && g.measureText(text).width > w - 44) g.font = font(700, (size -= 2));
  g.shadowColor = "rgba(255,200,80,0.95)";
  g.shadowBlur = 14;
  g.fillStyle = "#fff4d0";
  g.fillText(text, x + w / 2, y + h / 2 + 3);
  g.shadowBlur = 0;
  g.textAlign = "start";
  g.textBaseline = "alphabetic";
}

export default function WheelLabels() {
  use(loadLabelFonts());
  const built = useMemo(() => {
    const atlas = makeAtlas([...WHEELS.map(() => CELL), ...Array.from({ length: RING_MAX }, () => RING_CELL)]);
    const ringRects = atlas.rects.slice(WHEELS.length);
    const redrawPlaques = () => {
      WHEELS.forEach((w, i) => drawPlaque(atlas.g, atlas.rects[i].x, atlas.rects[i].y, w.category, w.groupLabel));
      atlas.tex.needsUpdate = true;
    };
    redrawPlaques();
    const plaqueGeos = () =>
      WHEELS.map((w, i) => {
        const pw = plaqueWidth(WHEELS.length);
        const ph = plaqueHeight(WHEELS.length);
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(w.x, PLAQUE.y + Math.sin(-PLAQUE.tilt) * 0.04, w.z + PLAQUE.dz + Math.cos(PLAQUE.tilt) * 0.04),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), PLAQUE.tilt),
          new THREE.Vector3(1, 1, 1),
        );
        return quad(pw, ph, m, uvRect(atlas.rects[i], atlas.canvas.width, atlas.canvas.height));
      });
    const tilt = new THREE.Matrix4().makeRotationX(-0.4);
    /** Draw and place the ring of wheel `sel` (or nothing); returns the whole mesh geometry. */
    const geometry = (sel: number | null) => {
      const list = plaqueGeos();
      const wheel = sel === null ? undefined : WHEELS[sel];
      const names = wheel ? ringSkills(wheel.skills) : [];
      ringRects.forEach((r, k) => drawRing(atlas.g, r.x, r.y, names[k] ? (names[k].display ?? names[k].name) : "", wheel?.colour ?? "#e9b62e"));
      atlas.tex.needsUpdate = true;
      if (wheel) {
        names.forEach((_, k) => {
          const { dx, dy } = ringSlot(k, names.length);
          const m = tilt.clone().premultiply(new THREE.Matrix4().makeTranslation(wheel.x + dx, RING_Y + dy, wheel.z + RING_Z));
          list.push(quad(RING_SIZE[0], RING_SIZE[1], m, uvRect(ringRects[k], atlas.canvas.width, atlas.canvas.height)));
        });
      }
      return merge(list);
    };
    const mat = new THREE.MeshBasicMaterial({ map: atlas.tex, transparent: true, depthWrite: false, toneMapped: false });
    return { atlas, geometry, mat, redrawPlaques };
  }, []);
  useAnisotropy(built.atlas.tex);
  const mesh = useRef<THREE.Mesh>(null);
  const shown = useRef<number | null>(null);
  const setGeo = (sel: number | null) => {
    const m = mesh.current;
    if (!m) return;
    const old = m.geometry;
    m.geometry = built.geometry(sel);
    shown.current = sel;
    if (old !== m.geometry) old.dispose();
  };
  useFontsSettled(() => {
    built.redrawPlaques();
    setGeo(shown.current);
  });
  // Kalam loads only for matching text: draw with the fallback first, redraw once it is ready
  useEffect(() => {
    let live = true;
    loadKalam().then(() => {
      if (!live) return;
      built.redrawPlaques();
      setGeo(shown.current);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built]);
  useEffect(() => {
    setGeo(useWorld.getState().wheelSelected);
    return useWorld.subscribe((s) => {
      if (s.wheelSelected !== shown.current) setGeo(s.wheelSelected);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built]);
  useEffect(
    () => () => {
      mesh.current?.geometry.dispose();
      built.mat.dispose();
      built.atlas.tex.dispose();
    },
    [built],
  );
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const d = galleryDist();
    m.visible = d < CULL_R && (d < PLAQUE_R || shown.current !== null) && !galleryHidden.has("labels");
  });
  if (!WHEELS.length) return null;
  return <mesh ref={mesh} material={built.mat} renderOrder={4} visible={false} frustumCulled={false} raycast={() => null} />;
}
