"use client";

// Prayer flags for the guestbook: ONE instanced mesh (the flags, text painted on ONE 1024x512 atlas, flutter in the
// vertex shader) + ONE merged mesh for the two posts and the strings. +2 draw calls in all. Tap a flag for the full
// note; tap a post to leave one. Text only (canvas fillText + React text nodes), never innerHTML.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { pointerClaim } from "../input";
import { FONT_FAMILY, loadLabelFonts } from "../nepal/LabelSprites";
import { FLAG_COLORS, FLAG_INK, flagCount, flagLayout, GUESTBOOK as G, stringY } from "./flagSpec";
import { guestbookEnabled, loadNotes, useGuestbook } from "./store";
import { useWorld } from "@/store/world";
import type { Note } from "@/lib/guestbook";

const CELL = G.atlas.w / G.atlas.cols; // 128

/** Fit one line of text into `maxW` px: shrink the font first, then cut with an ellipsis. */
function fit(g: CanvasRenderingContext2D, text: string, maxW: number, px: number, min: number) {
  let size = px;
  for (; size > min; size -= 2) {
    g.font = `600 ${size}px "${FONT_FAMILY}", sans-serif`;
    if (g.measureText(text).width <= maxW) return text;
  }
  g.font = `600 ${min}px "${FONT_FAMILY}", sans-serif`;
  const chars = Array.from(text);
  while (chars.length > 1 && g.measureText(chars.join("") + "…").width > maxW) chars.pop();
  return chars.join("") + "…";
}

/** Paints all 32 cells: cloth colour (traditional order), a darker hem, and the visitor's name (if any). */
function paint(c: HTMLCanvasElement, notes: Note[]) {
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, c.width, c.height);
  const total = G.atlas.cols * G.atlas.rows;
  for (let i = 0; i < total; i++) {
    const x = (i % G.atlas.cols) * CELL;
    const y = Math.floor(i / G.atlas.cols) * CELL;
    const k = i % 5;
    g.fillStyle = FLAG_COLORS[k];
    g.fillRect(x, y, CELL, CELL);
    g.fillStyle = "rgba(0,0,0,0.16)";
    g.fillRect(x, y, CELL, 12); // hem the string passes through
    const note = notes[i];
    if (!note) continue;
    g.fillStyle = FLAG_INK[k];
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(fit(g, note.name, CELL - 18, 30, 15), x + CELL / 2, y + CELL / 2 + 6);
  }
}

function buildPosts(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry) => parts.push(g.index ? g.toNonIndexed() : g);
  for (const p of [G.postA, G.postB]) {
    add(new THREE.CylinderGeometry(0.06, 0.09, G.postH, 6).translate(p.x, G.postH / 2, p.z));
    add(new THREE.SphereGeometry(0.1, 6, 4).translate(p.x, G.postH + 0.05, p.z)); // finial
  }
  // each string: a short run of thin boxes following the sag
  const seg = 12;
  G.strings.forEach((_, s) => {
    for (let i = 0; i < seg; i++) {
      const t0 = i / seg;
      const t1 = (i + 1) / seg;
      const a = new THREE.Vector3(G.postA.x + (G.postB.x - G.postA.x) * t0, stringY(s, t0), G.postA.z + (G.postB.z - G.postA.z) * t0);
      const b = new THREE.Vector3(G.postA.x + (G.postB.x - G.postA.x) * t1, stringY(s, t1), G.postA.z + (G.postB.z - G.postA.z) * t1);
      const len = a.distanceTo(b);
      const m = new THREE.BoxGeometry(0.025, 0.025, len);
      m.lookAt(b.clone().sub(a));
      m.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      add(m);
    }
  });
  const out = mergeGeometries(parts, false);
  out.computeBoundingSphere();
  return out;
}

/** Cloth flag, hanging down from its top edge (the origin), one quad. */
function buildFlagGeo(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(G.flagW, G.flagH, 1, 3).translate(0, -G.flagH / 2, 0);
  // atlas cell size in uv; the per-instance offset (aCell) is added in the vertex shader
  g.setAttribute("aCell", new THREE.InstancedBufferAttribute(new Float32Array(G.maxFlags * 2), 2));
  return g;
}

export default function Guestbook({ reducedMotion }: { reducedMotion: boolean }) {
  const notes = useGuestbook((s) => s.notes);
  const uTime = useRef({ value: 0 });
  const mesh = useRef<THREE.InstancedMesh>(null);

  const { flagGeo, flagMat, postGeo, postMat, tex } = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = G.atlas.w;
    c.height = G.atlas.h;
    paint(c, []);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    // no mipmaps: they would blend neighbouring atlas cells (the flag colours) at a distance
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    const flagMat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.25 });
    flagMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime.current;
      sh.vertexShader = sh.vertexShader
        .replace("void main() {", "uniform float uTime;\nattribute vec2 aCell;\nvoid main() {")
        .replace("#include <uv_vertex>", `#include <uv_vertex>\n  vMapUv = vMapUv * vec2(${(1 / G.atlas.cols).toFixed(5)}, ${(1 / G.atlas.rows).toFixed(5)}) + aCell;`)
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
  float hang = clamp(-position.y / ${G.flagH.toFixed(3)}, 0.0, 1.0);
  float ph = instanceMatrix[3].z * 1.9 + instanceMatrix[3].y * 2.3;
  transformed.z += sin(uTime * 2.3 + ph + position.y * 4.0) * 0.07 * hang;
  transformed.x += sin(uTime * 1.7 + ph * 1.3) * 0.025 * hang;`,
        );
    };
    const postMat = new THREE.MeshLambertMaterial({ color: "#7a4a2b" });
    return { flagGeo: buildFlagGeo(), flagMat, postGeo: buildPosts(), postMat, tex };
  }, []);

  // fetch once after the first idle moment (not a loader: the progress bar is unaffected)
  useEffect(() => {
    if (!guestbookEnabled()) return;
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    let id = 0;
    let timer = 0;
    if (w.requestIdleCallback) id = w.requestIdleCallback(() => void loadNotes(), { timeout: 4000 });
    else timer = window.setTimeout(() => void loadNotes(), 2000);
    return () => {
      if (id && w.cancelIdleCallback) w.cancelIdleCallback(id);
      window.clearTimeout(timer);
    };
  }, []);

  // names painted on the atlas once the font is ready; fall back to the first paint if the fonts fail
  useEffect(() => {
    let live = true;
    const draw = () => {
      if (!live) return;
      paint(tex.image as HTMLCanvasElement, notes);
      tex.needsUpdate = true;
    };
    draw();
    loadLabelFonts().then(draw, () => {});
    return () => {
      live = false;
    };
  }, [notes, tex]);

  // place the flags (count follows the notes; a few empty ones always hang)
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const places = flagLayout(flagCount(notes.length));
    const cell = flagGeo.getAttribute("aCell") as THREE.InstancedBufferAttribute;
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), G.yaw);
    const one = new THREE.Vector3(1, 1, 1);
    places.forEach((p, i) => {
      m.setMatrixAt(i, mat.compose(new THREE.Vector3(p.x, p.y, p.z), q, one));
      cell.setXY(i, p.cellCol / G.atlas.cols, 1 - (p.cellRow + 1) / G.atlas.rows);
    });
    m.count = places.length;
    m.instanceMatrix.needsUpdate = true;
    // raycasts test the cached bounding sphere first: refresh it now that the instances are in place
    m.computeBoundingSphere();
    cell.needsUpdate = true;
  }, [notes, flagGeo]);

  useEffect(
    () => () => {
      flagGeo.dispose();
      flagMat.dispose();
      postGeo.dispose();
      postMat.dispose();
      tex.dispose();
    },
    [flagGeo, flagMat, postGeo, postMat, tex],
  );

  useFrame(({ clock }) => {
    if (!reducedMotion) uTime.current.value = clock.elapsedTime;
  });

  const cursor = (v: string) => () => {
    document.body.style.cursor = v;
  };
  const usable = () => {
    const s = useWorld.getState();
    return !s.cinema && s.cameraMode === "follow"; // not while a video or the eagle view is up
  };

  return (
    <group>
      {/* a flag costs nothing to hit-test: R3F raycasts the instanced mesh and tells us which one was tapped */}
      <instancedMesh
        ref={mesh}
        args={[flagGeo, flagMat, G.maxFlags]}
        frustumCulled={false}
        onPointerMove={(e) => {
          e.stopPropagation();
          document.body.style.cursor = e.instanceId !== undefined && notes[e.instanceId] ? "pointer" : "";
        }}
        onPointerOut={cursor("")}
        onPointerDown={(e) => pointerClaim.claim(e.pointerId)}
        onClick={(e) => {
          e.stopPropagation();
          const n = e.instanceId !== undefined ? notes[e.instanceId] : undefined;
          if (n && usable()) useGuestbook.getState().setCard(n);
        }}
      />
      <mesh geometry={postGeo} material={postMat} frustumCulled={false} />
      {/* generous invisible click boxes on both posts: leave a note (only when the guestbook is configured) */}
      {[G.postA, G.postB].map((p) => (
        <mesh
          key={p.x}
          position={[p.x, G.postH / 2, p.z]}
          onPointerOver={(e) => {
            e.stopPropagation();
            if (guestbookEnabled()) cursor("pointer")();
          }}
          onPointerOut={cursor("")}
          onPointerDown={(e) => pointerClaim.claim(e.pointerId)}
          onClick={(e) => {
            e.stopPropagation();
            if (guestbookEnabled() && usable()) useGuestbook.getState().openForm();
          }}
        >
          <boxGeometry args={[0.9, G.postH, 0.9]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      ))}
    </group>
  );
}
