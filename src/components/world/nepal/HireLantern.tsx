"use client";

// The "Hire me" lantern: ONE merged mesh (post, arm, chain, brass caps, four paper panels) with one
// emissive material, so +1 draw call. Click/tap it from anywhere: opens the Contact panel (no walking).
// The label is painted on the panels (the texture's lower strip is the brass colour for the metal parts).
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CONTACT_INFO, useWorld } from "@/store/world";
import { pointerClaim } from "../input";
import { HIRE_LANTERN as L } from "./lanternSpec";
import { FONT_FAMILY, loadLabelFonts } from "./LabelSprites";
import { register, themeTargets } from "./themeState";

const W = 512;
const H = 320;
/** Canvas rows [0, PAPER_H) are the paper; the rest is a solid brass strip. */
const PAPER_H = 230;
const V_PAPER = 1 - PAPER_H / H;

function paint(c: HTMLCanvasElement) {
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, PAPER_H);
  grad.addColorStop(0, "#ffd98a");
  grad.addColorStop(1, "#ff9f3c");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, PAPER_H);
  g.strokeStyle = "#b8741a";
  g.lineWidth = 10;
  g.strokeRect(5, 5, W - 10, PAPER_H - 10);
  g.fillStyle = "#b8862b";
  g.fillRect(0, PAPER_H, W, H - PAPER_H);
  g.textAlign = "center";
  g.fillStyle = "#6e1a12";
  g.font = `600 78px "${FONT_FAMILY}", sans-serif`;
  g.fillText(L.en, W / 2, 98);
  g.font = `600 46px "${FONT_FAMILY}", sans-serif`;
  g.fillText(L.ne, W / 2, 172);
}

/** Re-map a geometry's UVs: all to one brass pixel (`panel` false) or the paper region (true). */
function mapUv(g: THREE.BufferGeometry, panel: boolean) {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    if (panel) uv.setXY(i, uv.getX(i), V_PAPER + uv.getY(i) * (1 - V_PAPER));
    else uv.setXY(i, 0.5, V_PAPER / 2);
  }
  return g;
}

function buildGeometry(): THREE.BufferGeometry {
  const ax = L.armLen;
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, panel = false) => parts.push(mapUv(g.index ? g.toNonIndexed() : g, panel));
  // post (foot at the origin) and the arm
  add(new THREE.CylinderGeometry(0.07, 0.1, L.postH, 6).translate(0, L.postH / 2, 0));
  add(new THREE.BoxGeometry(L.armLen + 0.1, 0.07, 0.07).translate(ax / 2, L.postH - 0.1, 0));
  add(new THREE.CylinderGeometry(0.014, 0.014, L.postH - 0.1 - (L.bodyY + L.bodyH / 2 + 0.2), 4).translate(ax, (L.postH - 0.1 + L.bodyY + L.bodyH / 2 + 0.2) / 2, 0));
  // lantern: brass lid (cone), finial, brass base, four slightly tapered paper panels
  const top = L.bodyY + L.bodyH / 2;
  const bot = L.bodyY - L.bodyH / 2;
  add(new THREE.ConeGeometry(L.bodyW * 0.62, 0.22, 4, 1).rotateY(Math.PI / 4).translate(ax, top + 0.11, 0));
  add(new THREE.SphereGeometry(0.045, 6, 4).translate(ax, top + 0.24, 0));
  add(new THREE.CylinderGeometry(L.bodyW * 0.36, L.bodyW * 0.16, 0.1, 4).rotateY(Math.PI / 4).translate(ax, bot - 0.05, 0));
  add(new THREE.ConeGeometry(0.05, 0.28, 4, 1).rotateX(Math.PI).translate(ax, bot - 0.24, 0)); // tassel
  for (let i = 0; i < 4; i++) {
    const p = new THREE.PlaneGeometry(L.bodyW * 0.7, L.bodyH, 1, 1).translate(0, 0, L.bodyW * 0.36);
    p.rotateY((i * Math.PI) / 2);
    p.translate(ax, L.bodyY, 0);
    add(p, true);
  }
  const out = mergeGeometries(parts, false);
  out.computeBoundingSphere();
  return out;
}

export default function HireLantern({ reducedMotion }: { reducedMotion: boolean }) {
  const uTime = useRef({ value: 0 });
  const { geo, mat, tex } = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    paint(c);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: "#ffffff", emissiveIntensity: 0.5, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });
    // Pendulum sway in the vertex shader: only what hangs from the arm (x past the post) swings, so it stays one mesh.
    const armY = (L.postH - 0.1).toFixed(3);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime.current;
      sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float hang = step(0.3, position.x) * clamp((${armY} - position.y) / 0.4, 0.0, 1.0);
        float a = (sin(uTime * 0.9) * 0.05) * hang;
        transformed.x += a * (${armY} - position.y);
        transformed.z += sin(uTime * 0.7 + 1.0) * 0.03 * hang * (${armY} - position.y);`,
      );
    };
    return { geo: buildGeometry(), mat, tex };
  }, []);

  useEffect(() => {
    let live = true;
    loadLabelFonts().then(() => {
      if (!live) return;
      paint(tex.image as HTMLCanvasElement);
      tex.needsUpdate = true;
    });
    const off = register(themeTargets.glows, { mat, day: 0.45, night: 1.7 });
    return () => {
      live = false;
      off();
      geo.dispose();
      mat.dispose();
      tex.dispose();
    };
  }, [geo, mat, tex]);

  useFrame(({ clock }) => {
    if (!reducedMotion) uTime.current.value = clock.elapsedTime;
  });

  const cursor = (v: string) => () => {
    document.body.style.cursor = v;
  };
  const open = () => {
    const s = useWorld.getState();
    if (s.cinema || s.cameraMode !== "follow") return; // not while a video or the eagle view is up
    s.openInfo(CONTACT_INFO);
  };

  return (
    <group position={[L.x, 0, L.z]}>
      <mesh geometry={geo} material={mat} />
      {/* invisible, generous click box around the lantern: works from any distance */}
      <mesh
        position={[L.armLen, L.bodyY, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          cursor("pointer")();
        }}
        onPointerOut={cursor("")}
        onPointerDown={(e) => pointerClaim.claim(e.pointerId)}
        onClick={(e) => {
          e.stopPropagation();
          open();
        }}
      >
        <boxGeometry args={[1.1, 1.7, 1.1]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
}
