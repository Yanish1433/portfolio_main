"use client";

// The prayer-wheel gallery's wheels: one brass drum per skill group (wheelData.ts, brass.ts), ONE InstancedMesh (1 draw call): all five names live in one atlas, the row is picked per instance.
// The wooden frame, roof, pedestals and posts are merged into the town's buckets (wheels/frame.ts, 0 calls).
// - spin: clockwise (seen from above), slowly while the avatar is within 2 m or the mouse is over the wheel,
//   fast once it is chosen. Speeds ease toward their target, so a wheel coasts to a stop. Reduced motion: no spin.
// - wave (spin.ts): while the visitor stands at the row the wheels turn one by one, left to right, and settle with a name facing the camera.
// - pointing: a second, invisible InstancedMesh (material.visible = false: raycast only, never drawn) gives each
//   wheel an easy target; its instanceId is the wheel's number. A click chooses it and stops there, so it never
//   also starts a click-to-walk.
// - the filter chips dim the other groups through instance colours; spin and tint cost no extra draw calls.
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { isTypingTarget, useWorld } from "@/store/world";
import { playerPos, pointerClaim } from "../input";
import { getEnvironment } from "../nepal/materials";
import { themeState } from "../nepal/themeState";
import { cursor } from "../halls/three";
import { GALLERY } from "../zones";
import { useRobot } from "../robot/robotStore";
import { chooseWheel } from "./choose";
import { WHEEL_PROJECTS, WHEELS } from "./wheelData";
import { DRUM_GROW_Y, DRUM_R, DRUM_Y, nearestWheel } from "./wheelLayout";
import { kalamBold, loadKalamBold, makeBrassAtlas, makeBrassGeo, pickAtlasRows } from "./brass";
import { plainGroup } from "./wheelLayout";
import { atRow, newWave, snapYaw, stepWave, waveSpin } from "./spin";
import { avatarMotion } from "../input";

/** Spin when the avatar is within this distance of a wheel (m). */
export const NEAR_R = 2;
/** Everything of the gallery is hidden when the avatar is further than this. */
export const CULL_R = 35;
const SLOW = 1.5; // rad/s while passing or pointing
const FAST = 6; // rad/s once chosen
const EASE = 2.2; // 1/s: how quickly the speed follows its target
/** Instance colours multiply the brass: dimmed wheels go neutral-dark (not muddy), highlighted ones brighten. */
const DIM = new THREE.Color("#6a625a");
const WHITE = new THREE.Color("#ffffff");

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
  const gl = useThree((t) => t.gl);
  const brass = useMemo(() => {
    const geo = makeBrassGeo();
    const n = WHEELS.length;
    // the instance's row in the atlas (counted from the bottom of the texture): wheel i is row i from the top
    const rows = new THREE.InstancedBufferAttribute(new Float32Array(WHEELS.map((_, i) => n - 1 - i)), 1);
    geo.setAttribute("aRow", rows);
    const atlas = makeBrassAtlas(n, kalamBold);
    const names = WHEELS.map((w) => plainGroup(w.category, w.groupLabel).plain);
    atlas.draw(names);
    const mat = new THREE.MeshStandardMaterial({
      color: "#e0a93e",
      metalness: 0.9,
      roughness: 0.35,
      map: atlas.colour,
      bumpMap: atlas.bump,
      bumpScale: 2.2,
    });
    pickAtlasRows(mat, n);
    return { geo, atlas, mat, names };
  }, []);
  const drumGeo = brass.geo;
  const wave = useRef(newWave());
  const canRef = useRef(false);
  const drumRef = useRef<THREE.InstancedMesh>(null);
  const pickRef = useRef<THREE.InstancedMesh>(null);
  const pickMat = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), []);
  // per-wheel animation: yaw (rad), spin speed (rad/s)
  const anim = useRef(WHEELS.map(() => ({ yaw: 0, vel: 0, dirty: true })));
  const key = useRef("");
  const near = useRef<boolean[]>(WHEELS.map(() => false));

  const place = (i: number) => {
    const m = drumRef.current;
    if (!m) return;
    const w = WHEELS[i];
    const sc = w.radius / DRUM_R;
    _q.setFromEuler(_e.set(0, anim.current[i].yaw, 0));
    m.setMatrixAt(i, _m.compose(_p.set(w.x, DRUM_Y, w.z), _q, _s.set(sc, DRUM_GROW_Y, sc)));
  };

  // brass needs something to reflect; the lettering needs Kalam Bold (redraw once it is ready)
  useEffect(() => {
    brass.mat.envMap = getEnvironment(gl);
    brass.mat.needsUpdate = true;
    const aniso = gl.capabilities.getMaxAnisotropy();
    brass.atlas.colour.anisotropy = brass.atlas.bump.anisotropy = Math.min(8, aniso);
    let live = true;
    loadKalamBold().then(() => live && brass.atlas.draw(brass.names));
    return () => {
      live = false;
    };
  }, [brass, gl]);

  useLayoutEffect(() => {
    const m = drumRef.current;
    const pick = pickRef.current;
    if (!m || !pick) return;
    WHEELS.forEach((w, i) => {
      place(i);
      const r = Math.min(0.75, w.radius * 1.5) / 0.5;
      _q.identity();
      pick.setMatrixAt(i, _m.compose(_p.set(w.x, 0, w.z), _q, _s.set(r, DRUM_GROW_Y, r)));
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
      brass.mat.dispose();
      brass.atlas.colour.dispose();
      brass.atlas.bump.dispose();
    },
    [pickMat, drumGeo, brass],
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
      const can = (canRef.current = !!w.character && !w.pickerOpen && !w.cinema && dist < 9);
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
        // same brass on every wheel: filtered-out groups are dimmed, the chosen / pointed-at one brightens
        _c.set(WHITE);
        if (w.skillFilter !== "all" && wh.category !== w.skillFilter) _c.lerp(DIM, 0.8);
        else if (i === w.wheelSelected) _c.multiplyScalar(1.5);
        else if (hl(i)) _c.multiplyScalar(1.22);
        m.setColorAt(i, _c);
      });
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    // the wave: while the visitor stands at the row the wheels spin one by one, left to right (see spin.ts)
    const at = !reducedMotion && canRef.current && atRow(WHEELS, playerPos.x, playerPos.z, w.activeZone);
    const ws = stepWave(wave.current, dt, at, avatarMotion.speed > 0.15, WHEELS.length);
    const waving = ws.active;
    // brass catches less light at night
    brass.mat.envMapIntensity = 1.25 - 0.6 * themeState.t;

    let changed = false;
    WHEELS.forEach((_, i) => {
      const a = anim.current[i];
      const chosen = i === w.wheelSelected;
      const pointed = i === w.wheelHover;
      // the visitor's choice always wins; a nudge for the wheel they walk past is dropped while the wave runs
      const target = reducedMotion ? 0 : chosen ? FAST : pointed || (near.current[i] && !waving) ? SLOW : 0;
      const vel = a.vel + (target - a.vel) * (1 - Math.exp(-dt * EASE));
      a.vel = Math.abs(vel) < 0.01 && target === 0 ? 0 : vel;
      if (a.vel !== 0) {
        a.yaw -= a.vel * dt; // negative rotation about +y = clockwise seen from above
        a.dirty = true;
      }
      // wave: add this frame's share of the eased turns (whole turns per spin: it ends with a name facing the camera)
      if (!reducedMotion && !chosen && !pointed) {
        const cap = ws.lastCycle.length ? ws.lastCycle[i] : Infinity;
        const d = waveSpin(ws.t, i, cap) - waveSpin(Math.max(0, ws.t - dt), i, cap);
        if (d > 0 && (ws.active || ws.lastCycle.length)) {
          a.yaw -= d;
          a.dirty = true;
        }
      }
      // at rest, settle to the nearest name so one always faces the camera
      if (!reducedMotion && target === 0 && a.vel === 0 && !(ws.active || ws.lastCycle.length)) {
        const diff = snapYaw(a.yaw) - a.yaw;
        if (Math.abs(diff) > 1e-3) {
          a.yaw += diff * (1 - Math.exp(-dt * 4));
          a.dirty = true;
        }
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
      <instancedMesh ref={drumRef} args={[drumGeo, brass.mat, WHEELS.length]} frustumCulled={false} />
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
