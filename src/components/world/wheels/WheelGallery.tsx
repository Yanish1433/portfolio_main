"use client";

// The prayer-wheel gallery's wheels: one golden drum per skill group (wheelData.ts), ONE InstancedMesh (1 draw call).
// The wooden frame, roof, pedestals and posts are merged into the town's buckets (wheels/frame.ts, 0 calls).
// - spin: clockwise (seen from above), slowly while the avatar is within 2 m or the mouse is over the wheel,
//   fast once it is chosen. Speeds ease toward their target, so a wheel coasts to a stop. Reduced motion: no spin.
// - pointing: a second, invisible InstancedMesh (material.visible = false: raycast only, never drawn) gives each
//   wheel an easy target; its instanceId is the wheel's number. A click chooses it and stops there, so it never
//   also starts a click-to-walk.
// - the filter chips dim the other groups through instance colours; spin and tint cost no extra draw calls.
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { isTypingTarget, useWorld } from "@/store/world";
import { playerPos, pointerClaim } from "../input";
import { getMaterials } from "../nepal/materials";
import { lathe } from "../nepal/geom";
import { cursor } from "../halls/three";
import { GALLERY } from "../zones";
import { useRobot } from "../robot/robotStore";
import { chooseWheel } from "./choose";
import { WHEEL_PROJECTS, WHEELS } from "./wheelData";
import { DRUM_H, DRUM_R, DRUM_Y, nearestWheel } from "./wheelLayout";

/** Spin when the avatar is within this distance of a wheel (m). */
export const NEAR_R = 2;
/** Everything of the gallery is hidden when the avatar is further than this. */
export const CULL_R = 35;
const SLOW = 1.5; // rad/s while passing or pointing
const FAST = 6; // rad/s once chosen
const EASE = 2.2; // 1/s: how quickly the speed follows its target
const DIM = new THREE.Color("#3a332e");
const WHITE = new THREE.Color("#ffffff");

/** Shared materials use vertexColors; give the geometry a colour attribute so instance colours show as they are. */
function colourBy(g: THREE.BufferGeometry, body: [number, number, number], band: [number, number, number], bandY: [number, number][]) {
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const inBand = bandY.some(([a, b]) => y >= a && y <= b);
    const c = inBand ? band : body;
    col.set(c, i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/** A tall drum with a flared lip, two embossed bands, a collar and a little lotus finial (radius 0.3, 1.0 tall + finial). */
export function makeDrumGeo() {
  const H = DRUM_H;
  const r = DRUM_R;
  const g = lathe(
    [
      [0, 0],
      [r * 0.7, 0],
      [r * 0.82, 0.04],
      [r * 1.0, 0.07], // lower lip
      [r * 1.0, 0.13],
      [r * 0.92, 0.16],
      [r * 0.92, 0.3], // body
      [r * 1.06, 0.32], // embossed band (lower)
      [r * 1.06, 0.36],
      [r * 0.92, 0.38],
      [r * 0.92, 0.5],
      [r * 1.1, 0.53], // embossed band (middle, widest)
      [r * 1.1, 0.6],
      [r * 0.92, 0.63],
      [r * 0.92, 0.72],
      [r * 1.06, 0.74], // embossed band (upper)
      [r * 1.06, 0.78],
      [r * 0.92, 0.8],
      [r * 0.92, H - 0.12],
      [r * 1.0, H - 0.1], // upper lip
      [r * 1.0, H - 0.04],
      [r * 0.7, H],
      [r * 0.3, H + 0.02], // finial: a small lotus bud
      [r * 0.36, H + 0.08],
      [r * 0.2, H + 0.16],
      [0, H + 0.24],
    ],
    14,
  );
  // body warm gold, bands near-white so they take the group accent through the instance colour
  return colourBy(g, [0.92, 0.8, 0.55], [1, 1, 1], [
    [0.31, 0.37],
    [0.52, 0.61],
    [0.73, 0.79],
  ]);
}

const pickGeo = (() => {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 2.0, 8).translate(0, 1.0, 0);
  const n = g.attributes.position.count;
  g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return g;
})();

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

/** Distance from the avatar to the middle of the gallery. */
export const galleryDist = () => Math.hypot(playerPos.x - GALLERY.x, playerPos.z - GALLERY.z);

export default function WheelGallery({ reducedMotion }: { reducedMotion: boolean }) {
  const mats = getMaterials();
  const drumGeo = useMemo(makeDrumGeo, []);
  const drumRef = useRef<THREE.InstancedMesh>(null);
  const pickRef = useRef<THREE.InstancedMesh>(null);
  const pickMat = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), []);
  // per-wheel animation: yaw (rad), spin speed (rad/s)
  const anim = useRef(WHEELS.map((w, i) => ({ yaw: i * 1.3 + w.x, vel: 0, dirty: true })));
  const key = useRef("");
  const near = useRef<boolean[]>(WHEELS.map(() => false));

  const place = (i: number) => {
    const m = drumRef.current;
    if (!m) return;
    const w = WHEELS[i];
    const sc = w.radius / DRUM_R;
    _q.setFromEuler(_e.set(0, anim.current[i].yaw, 0));
    m.setMatrixAt(i, _m.compose(_p.set(w.x, DRUM_Y, w.z), _q, _s.set(sc, 1, sc)));
  };

  useLayoutEffect(() => {
    const m = drumRef.current;
    const pick = pickRef.current;
    if (!m || !pick) return;
    WHEELS.forEach((w, i) => {
      place(i);
      const r = Math.min(0.55, w.radius * 1.5) / 0.5;
      _q.identity();
      pick.setMatrixAt(i, _m.compose(_p.set(w.x, 0, w.z), _q, _s.set(r, 1, r)));
    });
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    pick.instanceMatrix.needsUpdate = true;
    pick.computeBoundingSphere();
  }, []);

  useEffect(
    () => () => {
      pickMat.dispose();
      drumGeo.dispose();
    },
    [pickMat, drumGeo],
  );

  // Press E next to a wheel to choose it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyE" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e)) return;
      const w = useWorld.getState();
      if (w.cinema || w.pickerOpen || w.wheelNear === null) return;
      chooseWheel(w.wheelNear);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const last = useRef(0);
  useFrame((state, dtRaw) => {
    const m = drumRef.current;
    if (!m) return;
    const dt = Math.min(dtRaw, 0.05);
    const w = useWorld.getState();
    const dist = galleryDist();
    m.visible = dist < CULL_R && !galleryHidden.has("wheels");
    if (!m.visible) return;

    // walk-up (10 Hz): only near the gallery, only with a character, never while a case study is open
    const now = state.clock.elapsedTime;
    if (now - last.current > 0.1) {
      last.current = now;
      const can = !!w.character && !w.pickerOpen && !w.cinema && dist < 9;
      const nearest = can ? nearestWheel(WHEELS, playerPos.x, playerPos.z, NEAR_R) : -1;
      w.setWheelNear(nearest >= 0 ? nearest : null);
      WHEELS.forEach((wh, i) => {
        near.current[i] = can && Math.hypot(wh.x - playerPos.x, wh.z - playerPos.z) <= NEAR_R;
      });
      // walking far away closes the card
      if (w.wheelSelected !== null && dist > 13) w.selectWheel(null);
    }

    // colours: dim the groups the filter doesn't show, brighten highlighted wheels (only when something changed)
    const hl = (i: number) => i === w.wheelHover || i === w.wheelNear || i === w.wheelSelected;
    const k = `${w.skillFilter}|${w.wheelHover}|${w.wheelNear}|${w.wheelSelected}`;
    if (k !== key.current) {
      key.current = k;
      WHEELS.forEach((wh, i) => {
        // tint the bands toward the group colour; the gold body stays gold
        _c.set(wh.colour).lerp(WHITE, 0.2);
        if (w.skillFilter !== "all" && wh.category !== w.skillFilter) _c.lerp(DIM, 0.68);
        else if (i === w.wheelSelected) _c.multiplyScalar(1.55);
        else if (hl(i)) _c.multiplyScalar(1.25);
        m.setColorAt(i, _c);
      });
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    let changed = false;
    WHEELS.forEach((_, i) => {
      const a = anim.current[i];
      const target = reducedMotion ? 0 : i === w.wheelSelected ? FAST : near.current[i] || i === w.wheelHover ? SLOW : 0;
      const vel = a.vel + (target - a.vel) * (1 - Math.exp(-dt * EASE));
      a.vel = Math.abs(vel) < 0.01 && target === 0 ? 0 : vel;
      if (a.vel !== 0) {
        a.yaw -= a.vel * dt; // negative rotation about +y = clockwise seen from above
        a.dirty = true;
      }
      if (a.dirty) {
        place(i);
        changed = true;
        a.dirty = false;
      }
    });
    if (changed) m.instanceMatrix.needsUpdate = true;
  });

  if (!WHEELS.length) return null;
  return (
    <group>
      <instancedMesh ref={drumRef} args={[drumGeo, mats.gold, WHEELS.length]} frustumCulled={false} />
      <instancedMesh
        ref={pickRef}
        args={[pickGeo, pickMat, WHEELS.length]}
        onPointerOver={(e) => {
          // hover is for mice; a touch tap goes straight to the click
          if (e.pointerType === "touch" || useWorld.getState().cinema) return;
          e.stopPropagation();
          useWorld.getState().setWheelHover(e.instanceId ?? null);
          cursor("pointer")();
        }}
        onPointerOut={() => {
          useWorld.getState().setWheelHover(null);
          cursor("")();
        }}
        onPointerDown={(e) => pointerClaim.claim(e.pointerId)}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined && !useWorld.getState().cinema) chooseWheel(e.instanceId);
        }}
      />
      <DebugHook anim={anim} />
    </group>
  );
}

/** ?debug (or dev): window.__wheels for the automated checks (positions, real clicks, spin, chips). */
function DebugHook({ anim }: { anim: React.RefObject<{ yaw: number; vel: number }[]> }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && !new URLSearchParams(window.location.search).has("debug")) return;
    const w = window as unknown as { __wheels?: unknown };
    w.__wheels = {
      list: () => WHEELS.map((p) => ({ i: p.index, name: p.groupLabel, category: p.category, skills: p.skills.length, x: p.x, z: p.z, radius: p.radius, colour: p.colour, projects: WHEEL_PROJECTS[p.index].length })),
      choose: (i: number | null) => chooseWheel(i),
      /** Current yaw (rad) and speed (rad/s) of wheel i. */
      anim: (i: number) => ({ ...anim.current[i] }),
      /** The robot's current speech line. */
      line: () => useRobot.getState().line,
      /** World point -> CSS px in the canvas. */
      screen: (x: number, y: number, z: number) => {
        const v = new THREE.Vector3(x, y, z).project(camera);
        const r = gl.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
      hide: (part: string, on = true) => (on ? galleryHidden.add(part) : galleryHidden.delete(part)),
    };
    return () => {
      delete w.__wheels;
    };
  }, [camera, gl, anim]);
  return null;
}

/** ?debug: layers switched off to measure their cost ("wheels", "labels", "threads", "pulse"). */
export const galleryHidden = new Set<string>();
