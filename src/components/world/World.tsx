"use client";

import * as THREE from "three";
import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { KeyboardControls, PerformanceMonitor, type KeyboardControlsEntry } from "@react-three/drei";
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import type { CharacterId } from "./characters";
import Player, { type Controls } from "./Player";
import Town from "./nepal/Town";
import Props from "./nepal/Props";
import Sky from "./nepal/Sky";
import Island from "./nepal/Island";
import Labels from "./nepal/LabelSprites";
import Rings from "./nepal/Rings";
import Places from "./nepal/Places";
import Milestones from "./nepal/Milestones";
import Ghar from "./nepal/Ghar";
import HireLantern from "./nepal/HireLantern";
import Weather from "./weather/WeatherLayer";
import ThemeDriver from "./nepal/ThemeDriver";
import RobotBuddy from "./robot/RobotBuddy";
import Halls from "./halls/Halls";
import GuideFootprints from "./guide/GuideFootprints";
import CinemaCamera from "./halls/CinemaCamera";
import WheelGallery from "./wheels/WheelGallery";
import WheelLabels from "./wheels/WheelLabels";
import Threads from "./wheels/ThreadsLayer";
import Warmup from "./warmup/Warmup";
import Guestbook from "./guestbook/Guestbook";
import { themeTargets } from "./nepal/themeState";
import { initTime, useWorld } from "@/store/world";

const KEY_MAP: KeyboardControlsEntry<Controls>[] = [
  { name: "forward", keys: ["ArrowUp", "KeyW"] },
  { name: "back", keys: ["ArrowDown", "KeyS"] },
  { name: "left", keys: ["ArrowLeft", "KeyA"] },
  { name: "right", keys: ["ArrowRight", "KeyD"] },
  // WASD runs by default; hold Shift to walk.
  { name: "walk", keys: ["ShiftLeft", "ShiftRight"] },
];

/**
 * postprocessing's ToneMappingMode values (runtime enum: ACES_FILMIC 6, AGX 7, NEUTRAL 8).
 * The RenderPass draws into a render target, where three.js skips its own tone mapping,
 * so there's no double tone mapping; without the composer the renderer's ACES applies.
 */
const TONE_MODES = { aces: 6, agx: 7, neutral: 8 } as const;
type ToneName = keyof typeof TONE_MODES;
/** Picked after comparing the lacquer mask close up (see the world-ui report). */
const DEFAULT_TONE: ToneName = "aces";
const DEFAULT_EXPOSURE = 1;

/** renderer.toneMappingExposure (read by both the renderer's and the ToneMapping effect's operators). */
function Exposure({ value }: { value: number }) {
  const { gl } = useThree();
  useEffect(() => {
    gl.toneMappingExposure = value;
  }, [gl, value]);
  return null;
}

/** Renderer stats (draw calls / triangles of the last frame) for checks and the report. */
function Stats() {
  const { gl, scene, camera } = useThree();
  const last = useRef({ calls: 0, triangles: 0, points: 0, frames: 0 });
  useEffect(() => {
    gl.info.autoReset = false;
    // `frames` counts rendered frames (it stops while cinema mode pauses the loop)
    const w = window as unknown as { __render?: () => { calls: number; triangles: number; points: number; frames: number } };
    w.__render = () => ({ ...last.current });
    // Draw-call inventory (debug only): every visible drawable, with whether it is in the camera frustum.
    (w as unknown as { __inventory?: () => unknown }).__inventory = () => {
      const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const rows: unknown[] = [];
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!(m.isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine)) return;
        let vis = true;
        for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) vis = false;
        const mat = Array.isArray(m.material) ? m.material[0] : m.material;
        const g = m.geometry;
        if (!g.boundingSphere) g.computeBoundingSphere();
        const sph = g.boundingSphere!.clone().applyMatrix4(o.matrixWorld);
        rows.push({ n: o.name || o.type, mat: mat?.name || mat?.type, vis: vis && mat?.visible !== false, cast: m.castShadow, cull: m.frustumCulled, inView: !m.frustumCulled || fr.intersectsSphere(sph), tris: (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3 * ((m as THREE.InstancedMesh).count ?? 1), inst: (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 0, r: Math.round(sph.radius), c: [sph.center.x, sph.center.y, sph.center.z].map(Math.round).join(",") });
      });
      return rows;
    };
    return () => {
      gl.info.autoReset = true;
      delete w.__render;
      delete (w as unknown as { __inventory?: unknown }).__inventory;
    };
  }, [gl, scene, camera]);
  // Runs first each frame: store the previous frame's totals, then reset.
  useFrame(() => {
    const r = gl.info.render;
    last.current = { calls: r.calls, triangles: r.triangles, points: r.points, frames: last.current.frames + 1 };
    gl.info.reset();
  }, -100);
  return null;
}

/** Bloom on the gold finials, lamps and lit windows. Intensity is driven by ThemeDriver. */
function Post({ tone }: { tone: ToneName }) {
  return (
    <EffectComposer multisampling={4}>
      <Bloom
        ref={(b: unknown) => {
          themeTargets.bloom = (b as { intensity: number } | null) ?? null;
        }}
        mipmapBlur
        luminanceThreshold={1}
        luminanceSmoothing={0.2}
        intensity={0.2}
      />
      <ToneMapping mode={TONE_MODES[tone]} />
    </EffectComposer>
  );
}

/** The robot appears once a character has been chosen. */
function Robot({ reducedMotion }: { reducedMotion: boolean }) {
  const chosen = useWorld((s) => !!s.character);
  return chosen ? <RobotBuddy reducedMotion={reducedMotion} /> : null;
}

export default function World({ characters, thumbs, posters = [], aboutPhoto = null }: { characters: CharacterId[]; thumbs: string[]; posters?: string[]; aboutPhoto?: string | null }) {
  const [reducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [coarse] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  // Desktop: never below 1 (jaggies), and capped at 1.5 while the composer's MSAA x4 runs.
  const [minDpr] = useState(() => (coarse ? 0.75 : 1));
  const [maxDpr] = useState(() =>
    Math.max(minDpr, Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, coarse ? 2 : 1.5)),
  );
  const [dpr, setDpr] = useState(maxDpr);
  // ?tm=aces|agx|neutral: compare tone mappers (debug).
  const [tone, setTone] = useState<ToneName>(DEFAULT_TONE);
  const [exposure, setExposure] = useState(DEFAULT_EXPOSURE);
  const [shadows, setShadows] = useState(true);
  const [bloom, setBloom] = useState(!coarse);
  // ?perf=off disables adaptive quality (used by the headless screenshot check).
  const [adaptive, setAdaptive] = useState(true);
  // Living screens play demo clips on desktop only; ?perf=low (or a phone) keeps posters.
  const [liveVideo, setLiveVideo] = useState(!coarse);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const perf = q.getAll("perf");
    if (perf.includes("off")) setAdaptive(false);
    if (perf.includes("low")) setLiveVideo(false);
    if (q.get("bloom") === "off") setBloom(false);
    const tm = q.get("tm");
    if (tm === "aces" || tm === "agx" || tm === "neutral") setTone(tm);
    const exp = Number(q.get("exp"));
    if (exp > 0 && exp < 4) setExposure(exp);
    initTime();
  }, []);

  return (
    <KeyboardControls map={KEY_MAP}>
      <Canvas
        shadows="percentage"
        dpr={dpr}
        camera={{ fov: 45, near: 0.5, far: 280, position: [0, 11, 18] }}
        gl={{ antialias: !bloom, powerPreference: "high-performance" }}
        style={{ touchAction: "none" }}
        aria-label="Interactive 3D portfolio world: a Newari heritage square. Click or tap the ground to walk."
      >
        {adaptive && (
          <PerformanceMonitor
            onChange={({ factor }) => {
              // factor is 0..1: scale pixel ratio between 0.75 and the device max.
              setDpr(minDpr + (maxDpr - minDpr) * factor);
              setShadows(factor > 0.35);
            }}
            onDecline={() => setBloom(false)}
          />
        )}
        <ThemeDriver shadows={shadows} reducedMotion={reducedMotion} hiShadow={!coarse} />
        <Sky />
        <Weather reducedMotion={reducedMotion} lite={!liveVideo} />
        <Suspense fallback={null}>
          <Town />
          <Island lite={coarse} reducedMotion={reducedMotion} />
          <Places />
          <Props lite={coarse} reducedMotion={reducedMotion || !liveVideo} />
          <Ghar photo={aboutPhoto} />
          <HireLantern reducedMotion={reducedMotion} />
          <Rings reducedMotion={reducedMotion} />
          <Milestones reducedMotion={reducedMotion} />
          <GuideFootprints />
          <Labels />
          <Halls thumbs={thumbs} posters={posters} liveVideo={liveVideo} reducedMotion={reducedMotion} />
          <WheelGallery reducedMotion={reducedMotion} />
          <WheelLabels />
          <Threads reducedMotion={reducedMotion} />
          <Guestbook reducedMotion={reducedMotion || !liveVideo} />
          <CinemaCamera reducedMotion={reducedMotion} />
          <Player characters={characters} reducedMotion={reducedMotion} />
          <Robot reducedMotion={reducedMotion} />
          <Warmup />
        </Suspense>
        {bloom && <Post tone={tone} />}
        <Stats />
        <Exposure value={exposure} />
      </Canvas>
    </KeyboardControls>
  );
}
