"use client";

// Bilingual labels and signs drawn with Canvas2D. troika (drei <Text>) has no
// Indic shaping, so Devanagari conjuncts like "क्ष" would break; the browser's
// canvas text shaping handles them correctly once the font is loaded.
import { use, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { TEA_SIGN, zones } from "../zones";
import { LABELS } from "./labels";
import { NAVIGATE_EVENT } from "./navigate";
import { pointerClaim, robotPos } from "../input";
import { useRobot } from "../robot/robotStore";
import { occlusion } from "./materials";

export const FONT_FAMILY = "Mukta";

let fontPromise: Promise<void> | null = null;
/** Resolves once Mukta (Latin + Devanagari) is ready for canvas drawing. Never rejects. */
export function loadLabelFonts(): Promise<void> {
  if (!fontPromise) {
    fontPromise = Promise.all([
      document.fonts.load(`600 64px "${FONT_FAMILY}"`, "Project Hall"),
      document.fonts.load(`600 64px "${FONT_FAMILY}"`, "परियोजना कक्ष शिक्षा"),
    ])
      .then(() => undefined)
      .catch(() => undefined);
  }
  return fontPromise;
}

export function drawBilingual(en: string, ne: string, opts: { bg?: string; fg?: string; stroke?: string; pad?: number } = {}) {
  const scale = 2;
  const enPx = 46 * scale;
  const nePx = 42 * scale;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  ctx.font = `600 ${enPx}px "${FONT_FAMILY}", sans-serif`;
  const wEn = ctx.measureText(en).width;
  ctx.font = `600 ${nePx}px "${FONT_FAMILY}", sans-serif`;
  const wNe = ctx.measureText(ne).width;
  const pad = (opts.pad ?? 26) * scale;
  c.width = Math.ceil(Math.max(wEn, wNe) + pad * 2);
  c.height = Math.ceil(enPx * 1.25 + nePx * 1.45 + pad * 1.2);
  const g = c.getContext("2d")!;
  if (opts.bg) {
    g.fillStyle = opts.bg;
    const r = 22 * scale;
    g.beginPath();
    g.roundRect(4, 4, c.width - 8, c.height - 8, r);
    g.fill();
    g.strokeStyle = "rgba(201,162,39,0.9)";
    g.lineWidth = 4 * scale;
    g.stroke();
  }
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.lineJoin = "round";
  const line = (text: string, px: number, y: number, alpha = 1) => {
    g.font = `600 ${px}px "${FONT_FAMILY}", sans-serif`;
    if (opts.stroke) {
      g.strokeStyle = opts.stroke;
      g.lineWidth = 9 * scale;
      g.strokeText(text, c.width / 2, y);
    }
    g.globalAlpha = alpha;
    g.fillStyle = opts.fg ?? "#fffaf0";
    g.fillText(text, c.width / 2, y);
    g.globalAlpha = 1;
  };
  line(en, enPx, pad * 0.6 + enPx);
  line(ne, nePx, pad * 0.6 + enPx * 1.25 + nePx * 1.2, 0.95);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { tex: t, aspect: c.width / c.height };
}

function ZoneLabel({ position, en, ne, height = 1.35 }: { position: [number, number, number]; en: string; ne: string; height?: number }) {
  const { tex, aspect } = useMemo(() => drawBilingual(en, ne, { bg: "rgba(58,36,24,0.78)", fg: "#fff6e4" }), [en, ne]);
  const mat = useRef<THREE.SpriteMaterial>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  const bubbleK = useRef(1);
  // Fade out while the label is drawn on top of the avatar, and to ~25% while the robot's speech bubble is up beside it.
  useFrame(({ camera, gl }, dt) => {
    if (!mat.current) return;
    const h = gl.domElement.height;
    v.set(...position).project(camera);
    const px = (v.x * 0.5 + 0.5) * gl.domElement.width;
    const py = (v.y * 0.5 + 0.5) * h;
    const d = Math.hypot(px - occlusion.value.x, py - occlusion.value.y) / h;
    const { line, thinking } = useRobot.getState();
    const near = line || thinking ? 1 - THREE.MathUtils.smoothstep(Math.hypot(position[0] - robotPos.x, position[2] - robotPos.z), 3.2, 4.4) : 0;
    bubbleK.current = THREE.MathUtils.damp(bubbleK.current, 1 - 0.75 * near, 12, Math.min(dt, 0.1));
    mat.current.opacity = (THREE.MathUtils.smoothstep(d, 0.12, 0.24) * 0.85 + 0.15) * bubbleK.current;
  });
  return (
    <sprite position={position} scale={[height * aspect, height, 1]} renderOrder={5}>
      <spriteMaterial ref={mat} map={tex} transparent depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

/** Painted sign board on the tea stall; clicking it opens Recruiter Mode. */
function TeaSign() {
  const { tex, aspect } = useMemo(
    () => drawBilingual(LABELS.signs.teaStall.en, LABELS.signs.teaStall.ne, { bg: "#7a1f16", fg: "#ffe9b0", pad: 20 }),
    [],
  );
  const h = 0.75;
  const open = () => window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: "/recruiter" }));
  const cursor = (v: string) => () => {
    document.body.style.cursor = v;
  };
  // Standing board south of the stall, facing the camera (+z).
  return (
    <mesh
      position={[TEA_SIGN.x, TEA_SIGN.y, TEA_SIGN.z + 0.06]}
      onPointerDown={(e) => pointerClaim.claim(e.pointerId)}
      onClick={(e) => {
        e.stopPropagation();
        open();
      }}
      onPointerOver={cursor("pointer")}
      onPointerOut={cursor("")}
    >
      <planeGeometry args={[h * aspect, h]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

/** Suspends until the label font is ready (so the loading screen covers it). */
export default function Labels() {
  use(loadLabelFonts());
  return (
    <group>
      {zones.map((z) => {
        const l = LABELS.zones[z.id];
        return <ZoneLabel key={z.id} position={[z.position[0], z.labelY, z.position[1]]} en={l.en} ne={l.ne} />;
      })}
      <TeaSign />
    </group>
  );
}
