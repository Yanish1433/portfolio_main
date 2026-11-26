"use client";

// The Pottery Square's skill pots: one pot per skill (potData.ts), drawn as ONE InstancedMesh.
// - size: height and girth grow with the skill's level; glaze colour comes from the group (potLayout.ts)
// - pointing: a second, invisible InstancedMesh (material.visible = false: raycast only, never drawn) with fatter
//   pick shapes gives each pot an easy target; its instanceId is the pot's number. A click chooses the pot
//   and stops there, so it never also starts a click-to-walk.
// - highlight (hovered, walked up to, or chosen): the pot lifts a little and spins slowly (no spin with
//   reduced motion). Spin, lift and the filter's dimming are all instance matrices/colours: 0 extra draw calls.
// - walk-up: the avatar can't enter the square (its collision box covers the rows), so "near" means the
//   nearest pot within 1.2 m of the avatar, which the outer rows reach; the rest are for pointing and tapping.
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { isTypingTarget, useWorld } from "@/store/world";
import { playerPos, pointerClaim } from "../input";
import { getMaterials } from "../nepal/materials";
import { cursor } from "../halls/three";
import { POTTERY } from "../zones";
import { useRobot } from "../robot/robotStore";
import { choosePot } from "./choose";
import { POT_PROJECTS, POTS } from "./potData";
import { nearestPot, POT_H } from "./potLayout";
import { whiteColours, potGeo } from "./potGeo";

const NEAR_R = 1.2;
// Everything of the square is hidden when the avatar is further than this.
export const CULL_R = 35;
const LIFT = 0.07;
const SPIN = 0.9; // rad/s
const DIM = new THREE.Color("#3a332e");

const pickGeo = whiteColours(new THREE.CylinderGeometry(0.34, 0.34, POT_H * 1.2, 8).translate(0, (POT_H * 1.2) / 2, 0));

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

/** Distance from the avatar to the middle of the square. */
export const squareDist = () => Math.hypot(playerPos.x - POTTERY.x, playerPos.z - POTTERY.z);

export default function SkillPots({ reducedMotion }: { reducedMotion: boolean }) {
  const mats = getMaterials();
  const potRef = useRef<THREE.InstancedMesh>(null);
  const pickRef = useRef<THREE.InstancedMesh>(null);
  const pickMat = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), []);
  // per-pot animation: lift (m) and yaw (rad)
  const anim = useRef(POTS.map((p, i) => ({ lift: 0, yaw: i * 2.4 + p.x, dirty: true })));
  const key = useRef("");

  const place = (i: number) => {
    const m = potRef.current;
    if (!m) return;
    const p = POTS[i];
    const a = anim.current[i];
    _q.setFromEuler(_e.set(0, a.yaw, 0));
    m.setMatrixAt(i, _m.compose(_p.set(p.x, 0.02 + a.lift, p.z), _q, _s.set(p.girth, p.height, p.girth)));
  };

  useLayoutEffect(() => {
    const m = potRef.current;
    const pick = pickRef.current;
    if (!m || !pick) return;
    POTS.forEach((p, i) => {
      place(i);
      // fatter, taller pick shape than the pot itself (min 0.8 so small pots are still easy to hit)
      _q.identity();
      pick.setMatrixAt(i, _m.compose(_p.set(p.x, 0.02, p.z), _q, _s.set(Math.max(p.girth, 0.8), Math.max(p.height, 0.9), Math.max(p.girth, 0.8))));
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
    },
    [pickMat],
  );

  // Press E next to a pot to choose it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyE" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e)) return;
      const w = useWorld.getState();
      if (w.cinema || w.pickerOpen || w.potNear === null) return;
      choosePot(w.potNear);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const last = useRef(0);
  useFrame((state, dtRaw) => {
    const m = potRef.current;
    if (!m) return;
    const dt = Math.min(dtRaw, 0.05);
    const w = useWorld.getState();
    const dist = squareDist();
    m.visible = dist < CULL_R && !skillsHidden.has("pots");
    if (!m.visible) return;

    // walk-up (10 Hz): only near the square, only with a character, never while a case study is open
    const now = state.clock.elapsedTime;
    if (now - last.current > 0.1) {
      last.current = now;
      const can = !!w.character && !w.pickerOpen && !w.cinema && dist < 9;
      const near = can ? nearestPot(POTS, playerPos.x, playerPos.z, NEAR_R) : -1;
      w.setPotNear(near >= 0 ? near : null);
      // walking far away closes the card
      if (w.potSelected !== null && dist > 13) w.selectPot(null);
    }

    const hl = new Set<number>();
    if (w.potHover !== null) hl.add(w.potHover);
    if (w.potNear !== null) hl.add(w.potNear);
    if (w.potSelected !== null) hl.add(w.potSelected);

    // colours: dim the rows the filter doesn't show, brighten highlighted pots (only when something changed)
    const k = `${w.skillFilter}|${[...hl].join(",")}`;
    if (k !== key.current) {
      key.current = k;
      POTS.forEach((p, i) => {
        _c.set(p.colour);
        if (w.skillFilter !== "all" && p.category !== w.skillFilter) _c.lerp(DIM, 0.68);
        else if (hl.has(i)) _c.multiplyScalar(1.3);
        m.setColorAt(i, _c);
      });
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    let changed = false;
    POTS.forEach((_, i) => {
      const a = anim.current[i];
      const on = hl.has(i);
      const lift = a.lift + ((on ? LIFT : 0) - a.lift) * Math.min(1, dt * 9);
      let dirty = a.dirty;
      if (Math.abs(lift - a.lift) > 1e-4) {
        a.lift = lift;
        dirty = true;
      }
      if (on && !reducedMotion) {
        a.yaw += dt * SPIN;
        dirty = true;
      }
      if (dirty) {
        place(i);
        changed = true;
      }
      a.dirty = false;
    });
    if (changed) m.instanceMatrix.needsUpdate = true;
  });

  if (!POTS.length) return null;
  return (
    <group>
      <instancedMesh ref={potRef} args={[potGeo, mats.clay, POTS.length]} receiveShadow frustumCulled={false} />
      <instancedMesh
        ref={pickRef}
        args={[pickGeo, pickMat, POTS.length]}
        onPointerOver={(e) => {
          // hover is for mice; a touch tap goes straight to the click
          if (e.pointerType === "touch" || useWorld.getState().cinema) return;
          e.stopPropagation();
          useWorld.getState().setPotHover(e.instanceId ?? null);
          cursor("pointer")();
        }}
        onPointerOut={() => {
          useWorld.getState().setPotHover(null);
          cursor("")();
        }}
        onPointerDown={(e) => pointerClaim.claim(e.pointerId)}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined && !useWorld.getState().cinema) choosePot(e.instanceId);
        }}
      />
      <DebugHook anim={anim} />
    </group>
  );
}

/** ?debug (or dev): window.__pots for the automated checks (pot positions, real clicks, chips). */
function DebugHook({ anim }: { anim: React.RefObject<{ lift: number; yaw: number }[]> }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && !new URLSearchParams(window.location.search).has("debug")) return;
    const w = window as unknown as { __pots?: unknown };
    w.__pots = {
      list: () => POTS.map((p) => ({ i: p.index, row: p.row, name: p.display, level: p.level, x: p.x, z: p.z, girth: p.girth, height: p.height, colour: p.colour, projects: POT_PROJECTS[p.index].length })),
      choose: (i: number | null) => choosePot(i),
      /** Current lift (m) and yaw (rad) of pot i. */
      anim: (i: number) => ({ ...anim.current[i] }),
      /** The robot's current speech line. */
      line: () => useRobot.getState().line,
      /** World point -> CSS px in the canvas. */
      screen: (x: number, y: number, z: number) => {
        const v = new THREE.Vector3(x, y, z).project(camera);
        const r = gl.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
      hide: (part: string, on = true) => (on ? skillsHidden.add(part) : skillsHidden.delete(part)),
    };
    return () => {
      delete w.__pots;
    };
  }, [camera, gl, anim]);
  return null;
}

/** ?debug: layers switched off to measure their cost ("pots", "labels", "threads", "pulse"). */
export const skillsHidden = new Set<string>();
