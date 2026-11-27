"use client";

import type { CharacterId } from "./characters";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useKeyboardControls } from "@react-three/drei";
import * as THREE from "three";
import Avatar from "./Avatar";
import { blockedAt, findPath, resolveMove } from "./nav";
import { avatarMotion, camRig, joystick, navPath, playerPos, pointerClaim, RUN_SPEED, WALK_SPEED, worldControl } from "./input";
import { SPAWN, zones } from "./zones";
import {
  DEFAULT_VIEW,
  EAGLE_DEFAULT,
  EAGLE_SECS,
  FLY_IN_KEY,
  FLY_IN_SECS,
  GestureTracker,
  WHEEL_ZOOM,
  clampDist,
  clampEagleDist,
  eagleOrbitBy,
  eaglePose,
  flyBetween,
  wrapEagleYaw,
  type Pose,
  clampPitch,
  clampYaw,
  flyInPose,
  frozenFlyT,
  moveVector,
  newFrameState,
  noteManual,
  orbitBy,
  shouldFlyIn,
  updateFrame,
  type Ring,
} from "./cameraRig";
import { isTypingTarget, movementLocked, useWorld, type Vec2 } from "@/store/world";
import { themeState } from "./nepal/themeState";

/** Soft contact-shadow blob texture (radial falloff). */
function blobTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(0,0,0,1)");
  grad.addColorStop(0.45, "rgba(0,0,0,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export type Controls = "forward" | "back" | "left" | "right" | "walk";

/** Speed smoothing time constant (critically damped), s. */
const SPEED_TAU = 0.15;
/** Click / auto-walks run while more than this much path remains, then walk the last bit. */
const RUN_UNTIL = 3;
/** Extra camera distance at full run speed (follows a damped speed). */
const RUN_PULLBACK = 2.5;

const _pathLeft = (x: number, z: number, path: Vec2[], idx: number) => {
  let d = 0;
  let px = x;
  let pz = z;
  for (let i = idx; i < path.length; i++) {
    d += Math.hypot(path[i][0] - px, path[i][1] - pz);
    [px, pz] = path[i];
  }
  return d;
};
/** Camera distance for the pick / Dance showcase, and how long it holds. */
const SHOWCASE_DIST = 9;
const SHOWCASE_SECS = 2;
/** Preset zones' entrance rings, for the auto-framer (cameraRig.ts holds the per-zone views). */
const RINGS: Ring[] = zones.map((z) => ({ id: z.id, x: z.ring[0], z: z.ring[1] }));
/** Keyboard camera: orbit speed (rad/s) and zoom speed (m/s). */
const KEY_ORBIT = 1.6;
const KEY_ZOOM = 14;
const CAM_KEYS = new Set(["KeyZ", "KeyC", "Equal", "NumpadAdd", "Minus", "NumpadSubtract"]);

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

type DebugApi = {
  walkTo: (x: number, z: number) => boolean;
  pos: () => Vec2;
  blockedAt: (x: number, z: number) => boolean;
  /** Teleport (screenshots). */
  place: (x: number, z: number) => void;
  zoom: (d: number) => void;
  /** Set the orbit (radians; `snap` skips the easing). */
  orbit: (yaw: number, pitch: number, snap?: boolean) => void;
  /** Camera state now: yaw / pitch (radians), distance, framed zone. */
  camState: () => { yaw: number; pitch: number; dist: number; zone: string | null; manual: boolean };
  /** Fixed camera for overview screenshots (null = back to the normal follow camera). */
  cam: (view: { pos: [number, number, number]; look: [number, number, number] } | null) => void;
};

// ?debug only (set through window.__world.cam): never set in normal use.
let debugCamView: { pos: [number, number, number]; look: [number, number, number] } | null = null;

export default function Player({ characters, reducedMotion }: { characters: CharacterId[]; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const marker = useRef<THREE.Group>(null);
  const { camera, gl } = useThree();
  const [, getKeys] = useKeyboardControls<Controls>();

  const s = useRef({
    x: SPAWN[0],
    z: SPAWN[1],
    heading: 0,
    path: [] as Vec2[],
    idx: 0,
    zone: null as string | null,
    camDist: DEFAULT_VIEW.dist,
    zoomTarget: DEFAULT_VIEW.dist,
    /** Orbit angles (current / wanted), see cameraRig.ts. */
    yaw: DEFAULT_VIEW.yaw,
    pitch: DEFAULT_VIEW.pitch,
    yawTarget: DEFAULT_VIEW.yaw,
    pitchTarget: DEFAULT_VIEW.pitch,
    frame: newFrameState(),
    viewCustom: false,
    camTarget: new THREE.Vector3(SPAWN[0], 1, SPAWN[1]),
    lastStore: 0,
    manual: false,
    /** Set by place(): the next frame's jump isn't walking. */
    teleported: false,
    /** performance.now() (s) until which the camera eases to SHOWCASE_DIST. */
    showcaseUntil: 0,
    /** Damped movement speed (m/s): drives both the position and the gait. */
    curSpeed: 0,
    curAccel: 0,
    /** Damped speed for the camera pull-back. */
    camSpeed: 0,
    /** Heading to turn to while standing (worldControl.face), or null. */
    faceTo: null as number | null,
    /** First-visit fly-in: checked once when the world has loaded; `t0` in performance.now() ms, `frozen` for screenshots. */
    /** Eagle (sky) view: orbit targets + the glide. `t` 0..1 (in = up, out = down); `from` = the pose the glide leaves. */
    eagle: { on: false, out: false, t: 1, yaw: 0, pitch: EAGLE_DEFAULT.pitch, dist: EAGLE_DEFAULT.dist, yawT: 0, pitchT: EAGLE_DEFAULT.pitch, distT: EAGLE_DEFAULT.dist, from: null as Pose | null },
    fly: { checked: false, on: false, t0: 0, frozen: null as number | null, off: null as (() => void) | null },
  });
  const blob = useRef<THREE.Mesh>(null);
  const blobMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: blobTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0.45,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        toneMapped: false,
      }),
    [],
  );
  useEffect(
    () => () => {
      blobMat.map?.dispose();
      blobMat.dispose();
    },
    [blobMat],
  );

  // Showcase: ease the camera in on a pick and on the Dance emote (not under reduced motion).
  // While the fly-in plays the showcase waits: it starts when the fly-in lands (endFly below).
  useEffect(
    () =>
      useWorld.subscribe((w, prev) => {
        if (reducedMotion) return;
        if (w.spawnSeq !== prev.spawnSeq || w.danceSeq !== prev.danceSeq) {
          if (s.current.fly.on) return;
          s.current.showcaseUntil = performance.now() / 1000 + SHOWCASE_SECS;
        }
      }),
    [reducedMotion],
  );

  /** End the fly-in (landed, skipped, or cinema took the camera): the follow camera takes over. */
  const endFly = (land: boolean) => {
    const f = s.current.fly;
    if (!f.on) return;
    f.on = false;
    f.off?.();
    f.off = null;
    if (land && !reducedMotion) s.current.showcaseUntil = performance.now() / 1000 + SHOWCASE_SECS;
  };
  /** First visit only: the camera starts high above the island and glides down. Any click / key / touch skips it. */
  const startFly = () => {
    const search = window.location.search;
    let seen = false;
    try {
      seen = window.localStorage.getItem(FLY_IN_KEY) === "1";
    } catch {
      /* storage blocked: treat as seen, so a visitor without storage doesn't get it on every load */
      seen = true;
    }
    if (!shouldFlyIn({ reducedMotion, search, seen })) return;
    try {
      window.localStorage.setItem(FLY_IN_KEY, "1");
    } catch {
      /* ignore */
    }
    const f = s.current.fly;
    f.on = true;
    f.t0 = performance.now();
    f.frozen = frozenFlyT(search);
    s.current.showcaseUntil = 0;
    const skip = () => endFly(false);
    const opts = { capture: true } as const;
    for (const ev of ["pointerdown", "keydown", "touchstart", "wheel"] as const) window.addEventListener(ev, skip, opts);
    f.off = () => {
      for (const ev of ["pointerdown", "keydown", "touchstart", "wheel"] as const) window.removeEventListener(ev, skip, opts);
    };
  };
  useEffect(() => () => s.current.fly.off?.(), []);

  // Eagle view on / off (button, V, R, or cinema taking over). The glide starts from wherever the camera is now.
  useEffect(
    () =>
      useWorld.subscribe((w, prev) => {
        if (w.cameraMode === prev.cameraMode) return;
        const e = s.current.eagle;
        const here = (): Pose => ({
          pos: [camera.position.x, camera.position.y, camera.position.z],
          look: [camRig.look.x, camRig.look.y, camRig.look.z],
        });
        if (w.cameraMode === "eagle") {
          endFly(false);
          e.from = here();
          e.on = true;
          e.out = false;
          e.t = reducedMotion ? 1 : 0;
        } else if (prev.cameraMode === "eagle") {
          // Back down (to follow), or cinema took over (it flies from the live camera by itself).
          if (w.cameraMode === "follow" && e.on && !reducedMotion) {
            e.from = here();
            e.out = true;
            e.t = 0;
          } else {
            e.on = false;
            e.out = false;
          }
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [camera, reducedMotion],
  );

  /** `auto`: robot-led walk (not visitor input, so it doesn't cancel a tour). */
  const walkTo = (x: number, z: number, auto = false): boolean => {
    const st = s.current;
    if (useWorld.getState().cameraMode === "eagle") return false;
    const path = findPath([st.x, st.z], [x, z]);
    if (!path) return false;
    if (!auto) useWorld.getState().interrupt();
    st.path = path;
    st.idx = 1;
    st.faceTo = null;
    navPath.path = path;
    navPath.idx = 1;
    const end = path[path.length - 1];
    marker.current?.position.set(end[0], 0.05, end[1]);
    if (marker.current) marker.current.visible = path.length > 1;
    useWorld.getState().setTarget(end);
    useWorld.getState().setMoved();
    return true;
  };
  const walkToRef = useRef(walkTo);
  walkToRef.current = walkTo;

  const place = (x: number, z: number, heading?: number) => {
    const st = s.current;
    st.x = x;
    st.z = z;
    st.path = [];
    st.idx = 0;
    navPath.path = st.path;
    navPath.idx = 0;
    if (heading !== undefined) st.heading = heading;
    st.teleported = true;
    st.camTarget.set(x, 1, z);
    if (marker.current) marker.current.visible = false;
    useWorld.getState().setTarget(null);
  };
  const placeRef = useRef(place);
  placeRef.current = place;

  useEffect(() => {
    worldControl.walkTo = (x, z) => walkToRef.current(x, z, true);
    worldControl.face = (x, z) => {
      const st = s.current;
      if (Math.hypot(x - st.x, z - st.z) > 0.05) st.faceTo = Math.atan2(x - st.x, z - st.z);
    };
    return () => {
      worldControl.walkTo = null;
      worldControl.face = null;
    };
  }, []);

  // A new character spawns at the plaza, facing the camera.
  useEffect(
    () =>
      useWorld.subscribe((st, prev) => {
        if (st.spawnSeq !== prev.spawnSeq) placeRef.current(SPAWN[0], SPAWN[1], 0);
      }),
    [],
  );

  // Click / tap on the ground to walk; wheel to zoom. Pointer listeners live on the canvas.
  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const gesture = new GestureTracker();
    const manual = () => noteManual(s.current.frame);

    const onDown = (e: PointerEvent) => {
      pointerClaim.reset();
      gesture.down(e.pointerId, e.clientX, e.clientY, e.pointerType, e.button);
    };
    const onMove = (e: PointerEvent) => {
      const d = gesture.move(e.pointerId, e.clientX, e.clientY, pointerClaim.claimed(e.pointerId));
      if (!d) return;
      const st = s.current;
      if (useWorld.getState().cameraMode === "eagle") {
        if (d.dx || d.dy) {
          const o = eagleOrbitBy(st.eagle.yawT, st.eagle.pitchT, d.dx, d.dy);
          st.eagle.yawT = o.yaw;
          st.eagle.pitchT = o.pitch;
        }
        if (d.pinch !== 1) st.eagle.distT = clampEagleDist(st.eagle.distT / d.pinch);
        return;
      }
      if (movementLocked(useWorld.getState())) return;
      if (d.dx || d.dy) {
        const o = orbitBy(st.yawTarget, st.pitchTarget, d.dx, d.dy);
        st.yawTarget = o.yaw;
        st.pitchTarget = o.pitch;
        manual();
        if (e.pointerType === "mouse") {
          try {
            el.setPointerCapture(e.pointerId);
          } catch {
            /* not capturable: the drag just stops at the canvas edge */
          }
        }
      }
      if (d.pinch !== 1) {
        st.zoomTarget = clampDist(st.zoomTarget / d.pinch);
        manual();
      }
    };
    const onUp = (e: PointerEvent) => {
      // Only a short single-pointer press is a tap; a drag (orbit) or two-finger gesture is not.
      if (!gesture.up(e.pointerId).tap) return;
      // The press landed on a clickable 3D object (stand, book, sign): it handles the walk itself.
      if (pointerClaim.claimed(e.pointerId)) return;
      // A case study is open (or the camera is flying): no walking.
      if (movementLocked(useWorld.getState())) return;
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(plane, hit)) walkToRef.current(hit.x, hit.z);
    };
    const onCancel = (e: PointerEvent) => gesture.cancel(e.pointerId);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const st = s.current;
      if (useWorld.getState().cameraMode === "eagle") {
        st.eagle.distT = clampEagleDist(st.eagle.distT + e.deltaY * WHEEL_ZOOM * 3);
        return;
      }
      st.zoomTarget = clampDist(st.zoomTarget + e.deltaY * WHEEL_ZOOM);
      manual();
    };
    const onContext = (e: Event) => e.preventDefault(); // right-drag orbits

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onContext);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onContext);
    };
  }, [camera, gl]);

  // Camera keys: Z / C turn, + / - zoom (held), R resets the view. (E = interact, G = dance, N = night.)
  const camKeys = useRef(new Set<string>());
  useEffect(() => {
    const held = camKeys.current;
    const resetView = () => {
      const st = s.current;
      if (useWorld.getState().cameraMode === "eagle") useWorld.getState().toggleEagle(); // back down first
      st.yawTarget = DEFAULT_VIEW.yaw;
      st.pitchTarget = DEFAULT_VIEW.pitch;
      st.zoomTarget = DEFAULT_VIEW.dist;
      noteManual(st.frame); // stays on the default view until the next zone
    };
    worldControl.resetView = resetView;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e)) return;
      if (e.code === "KeyV") {
        if (!e.repeat && !useWorld.getState().pickerOpen) useWorld.getState().toggleEagle();
      } else if (e.code === "KeyR") {
        const w = useWorld.getState();
        if (!e.repeat && !w.pickerOpen && (w.cameraMode === "eagle" || !movementLocked(w))) resetView();
      } else if (CAM_KEYS.has(e.code)) held.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => held.delete(e.code);
    const clear = () => held.clear();
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clear);
    return () => {
      worldControl.resetView = null;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clear);
    };
  }, []);

  // Hook for automated checks (dev, or ?debug in production).
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && !new URLSearchParams(window.location.search).has("debug")) return;
    const api: DebugApi = {
      walkTo: (x, z) => walkToRef.current(x, z),
      pos: () => [s.current.x, s.current.z],
      blockedAt: (x, z) => blockedAt(x, z),
      place: (x, z) => placeRef.current(x, z),
      zoom: (d) => {
        s.current.zoomTarget = d;
        s.current.camDist = d;
      },
      orbit: (yaw, pitch, snap) => {
        const st = s.current;
        st.yawTarget = clampYaw(yaw);
        st.pitchTarget = clampPitch(pitch);
        noteManual(st.frame);
        if (snap) {
          st.yaw = st.yawTarget;
          st.pitch = st.pitchTarget;
        }
      },
      camState: () => ({ yaw: s.current.yaw, pitch: s.current.pitch, dist: s.current.camDist, zone: s.current.frame.zone, manual: s.current.frame.manual }),
      cam: (view) => {
        debugCamView = view;
      },
    };
    const w = window as unknown as { __world?: DebugApi; __store?: unknown; __motion?: unknown };
    w.__world = api;
    w.__store = useWorld;
    w.__motion = avatarMotion;
    return () => {
      delete w.__world;
      delete w.__store;
      delete w.__motion;
    };
  }, []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const st = s.current;
    const world = useWorld.getState();
    // Keys are ignored while the picker is open (it uses the arrows itself) and in cinema mode.
    const locked = movementLocked(world);
    const keys = world.pickerOpen || locked ? { forward: false, back: false, left: false, right: false, walk: false } : getKeys();
    const px = st.x;
    const pz = st.z;

    // Keys / joystick are relative to the camera ("up" = away from it); click-to-walk is world-space.
    let [ix, iz] = moveVector(
      (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + (locked ? 0 : joystick.x),
      (keys.back ? 1 : 0) - (keys.forward ? 1 : 0) + (locked ? 0 : joystick.y),
      st.yaw,
    );
    const mag = Math.hypot(ix, iz);
    let targetHeading = st.heading;
    // Wanted speed this frame; curSpeed eases toward it (critically damped).
    let want = 0;
    let dirX = 0;
    let dirZ = 0;

    if (mag > 0.08) {
      // Manual control cancels any click-to-walk path.
      const k = Math.min(mag, 1) / mag;
      ix *= k;
      iz *= k;
      if (!st.manual) {
        st.manual = true;
        world.interrupt();
      }
      st.faceTo = null;
      if (st.path.length) {
        st.path = [];
        st.idx = 0;
        navPath.path = st.path;
        navPath.idx = 0;
        if (marker.current) marker.current.visible = false;
        useWorld.getState().setTarget(null);
      }
      // Keys run by default (Shift walks). Joystick: a partial push walks, a full push runs.
      const push = Math.min(mag, 1);
      const keyHeld = keys.forward || keys.back || keys.left || keys.right;
      if (keyHeld) want = keys.walk ? WALK_SPEED : RUN_SPEED;
      else
        want =
          push < 0.6
            ? WALK_SPEED * (push / 0.6)
            : WALK_SPEED + (RUN_SPEED - WALK_SPEED) * THREE.MathUtils.smoothstep(push, 0.6, 0.95);
      dirX = ix / push;
      dirZ = iz / push;
      targetHeading = Math.atan2(ix, iz);
      world.setMoved();
    } else if (st.idx < st.path.length) {
      st.manual = false;
      const [tx, tz] = st.path[st.idx];
      const dx = tx - st.x;
      const dz = tz - st.z;
      const dist = Math.hypot(dx, dz);
      // Run while the path is long; walk the final approach, slowing into the stop.
      const left = _pathLeft(st.x, st.z, st.path, st.idx);
      want = left > RUN_UNTIL ? RUN_SPEED : Math.max(0.5, Math.min(WALK_SPEED, left * 2.2));
      // Damp first, so the step below uses this frame's speed.
      const k = dt / SPEED_TAU;
      st.curAccel += (-(st.curSpeed - want) / SPEED_TAU - 2 * st.curAccel) * k;
      st.curSpeed = Math.max(0.3, st.curSpeed + st.curAccel * dt);
      const step = Math.min(st.curSpeed * dt, dist);
      if (dist > 1e-4) {
        st.x += (dx / dist) * step;
        st.z += (dz / dist) * step;
        targetHeading = Math.atan2(dx, dz);
      }
      if (dist - step <= 0.04) {
        st.idx++;
        navPath.idx = st.idx;
        if (st.idx >= st.path.length) {
          st.path = [];
          st.idx = 0;
          navPath.path = st.path;
          navPath.idx = 0;
          if (marker.current) marker.current.visible = false;
          world.setTarget(null);
          world.arrive();
        }
      }
    } else {
      st.manual = false;
      if (st.faceTo !== null) {
        targetHeading = st.faceTo;
        if (Math.abs(wrapAngle(st.faceTo - st.heading)) < 0.01) st.faceTo = null;
      }
    }

    // Manual / idle: damp curSpeed toward the wanted speed, then move with it.
    if (!(st.idx < st.path.length) || mag > 0.08) {
      if (!(mag > 0.08)) want = 0;
      const k = dt / SPEED_TAU;
      st.curAccel += (-(st.curSpeed - want) / SPEED_TAU - 2 * st.curAccel) * k;
      st.curSpeed = Math.max(0, st.curSpeed + st.curAccel * dt);
      if (st.curSpeed < 0.02 && want === 0) {
        st.curSpeed = 0;
        st.curAccel = 0;
      }
      if (mag > 0.08 && st.curSpeed > 0) {
        const step = st.curSpeed * dt;
        [st.x, st.z] = resolveMove(st.x, st.z, dirX * step, dirZ * step);
      }
    }

    // Distance actually travelled (the gait phase integrates it, so blocked = no legs).
    // A teleport (place) doesn't count.
    const moved = st.teleported ? 0 : Math.min(Math.hypot(st.x - px, st.z - pz), RUN_SPEED * dt * 1.5);
    st.teleported = false;
    avatarMotion.dist += moved;
    // Gait weight follows the damped speed, but not while pushing into a wall.
    const blockedRatio = st.curSpeed > 0.05 ? Math.min(1, moved / (st.curSpeed * dt + 1e-6)) : 1;
    avatarMotion.speed = st.curSpeed * blockedRatio;

    // Turn to face the direction of travel.
    st.heading += wrapAngle(targetHeading - st.heading) * (1 - Math.exp(-dt * 14));

    if (group.current) {
      group.current.position.set(st.x, 0, st.z);
      group.current.rotation.y = st.heading;
    }
    playerPos.x = st.x;
    playerPos.z = st.z;
    avatarMotion.heading = st.heading;

    // Target marker pulse.
    if (marker.current?.visible && !reducedMotion) {
      const p = 1 + Math.sin(state.clock.elapsedTime * 5) * 0.1;
      marker.current.scale.set(p, 1, p);
    }

    // Zone enter/leave + throttled position write.
    let zoneId: string | null = null;
    for (const z of zones) {
      if (Math.hypot(st.x - z.ring[0], st.z - z.ring[1]) < z.ringRadius) {
        zoneId = z.id;
        break;
      }
    }
    const store = useWorld.getState();
    if (zoneId !== st.zone) {
      st.zone = zoneId;
      store.setActiveZone(zoneId);
    }
    const now = state.clock.elapsedTime;
    if (now - st.lastStore > 0.1) {
      st.lastStore = now;
      store.setPosition([st.x, st.z]);
    }

    // Camera keys (Z / C turn, + / - zoom) while the world has the keyboard.
    if (!locked && !world.pickerOpen && camKeys.current.size) {
      const h = camKeys.current;
      const turn = (h.has("KeyC") ? 1 : 0) - (h.has("KeyZ") ? 1 : 0);
      const zoomIn = (h.has("Equal") || h.has("NumpadAdd") ? 1 : 0) - (h.has("Minus") || h.has("NumpadSubtract") ? 1 : 0);
      if (turn) st.yawTarget = clampYaw(st.yawTarget + turn * KEY_ORBIT * dt);
      if (zoomIn) st.zoomTarget = clampDist(st.zoomTarget - zoomIn * KEY_ZOOM * dt);
      if (turn || zoomIn) noteManual(st.frame);
    }
    // Auto-frame: in a section the camera eases closer and turns to face its content; back in the
    // centre it returns to the wide view. A visitor who has taken the camera is left alone (cameraRig.ts).
    if (!locked) {
      const view = updateFrame(st.frame, st.x, st.z, Math.min(dtRaw, 0.25), RINGS); // real time: the dwell must not stretch at a low frame rate
      if (view) {
        st.zoomTarget = view.dist;
        st.yawTarget = view.yaw;
        st.pitchTarget = view.pitch;
      }
    }

    // Third-person follow camera (orbit + distance around the avatar, slight lag).
    const follow = reducedMotion ? 1 : 1 - Math.exp(-dt * 3.5);
    const zoom = reducedMotion ? 1 : 1 - Math.exp(-dt * 6);
    const turnK = reducedMotion ? 1 : 1 - Math.exp(-dt * 5);
    st.yaw += (st.yawTarget - st.yaw) * turnK;
    st.pitch += (st.pitchTarget - st.pitch) * turnK;
    const custom =
      Math.abs(st.yawTarget - DEFAULT_VIEW.yaw) > 0.02 ||
      Math.abs(st.pitchTarget - DEFAULT_VIEW.pitch) > 0.02 ||
      Math.abs(st.zoomTarget - DEFAULT_VIEW.dist) > 0.5;
    if (custom !== st.viewCustom) {
      st.viewCustom = custom;
      world.setViewCustom(custom);
    }
    const showcase = performance.now() / 1000 < st.showcaseUntil;
    // Pull back a little while running (damped; static under reduced motion).
    st.camSpeed += (avatarMotion.speed - st.camSpeed) * (1 - Math.exp(-dt * 1.5));
    const pull = reducedMotion ? 0 : RUN_PULLBACK * THREE.MathUtils.clamp((st.camSpeed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
    const wantDist = showcase ? Math.min(st.zoomTarget, SHOWCASE_DIST) : st.zoomTarget + pull;
    st.camDist += (wantDist - st.camDist) * (showcase ? 1 - Math.exp(-dt * 3) : zoom);

    // Contact shadow: lighter at night (softer moonlight).
    blobMat.opacity = 0.45 * (1 - 0.35 * themeState.t);
    st.camTarget.x += (st.x - st.camTarget.x) * follow;
    st.camTarget.z += (st.z - st.camTarget.z) * follow;
    const flat = Math.cos(st.pitch) * st.camDist;
    camRig.pos.x = st.camTarget.x + Math.sin(st.yaw) * flat;
    camRig.pos.y = st.camTarget.y + Math.sin(st.pitch) * st.camDist;
    camRig.pos.z = st.camTarget.z + Math.cos(st.yaw) * flat;
    camRig.look.x = st.camTarget.x;
    camRig.look.y = st.camTarget.y;
    camRig.look.z = st.camTarget.z;
    // First visit: start the fly-in once the world has loaded.
    if (!st.fly.checked && world.loaded) {
      st.fly.checked = true;
      startFly();
    }
    // Cinema mode (halls/CinemaCamera.tsx) owns the camera while it flies in, is parked, or flies back.
    const eg = st.eagle;
    if (world.cameraMode === "eagle" || (eg.on && eg.out && world.cameraMode === "follow")) {
      endFly(false);
      // Orbit targets ease in; the glide up / down only blends the camera write (camRig keeps the follow pose).
      const ek = reducedMotion ? 1 : 1 - Math.exp(-dt * 6);
      eg.yawT = wrapEagleYaw(eg.yawT);
      eg.yaw += (eg.yawT - eg.yaw) * ek;
      eg.pitch += (eg.pitchT - eg.pitch) * ek;
      eg.dist += (eg.distT - eg.dist) * ek;
      const sky = eaglePose(eg.yaw, eg.pitch, eg.dist);
      const followPose: Pose = { pos: [camRig.pos.x, camRig.pos.y, camRig.pos.z], look: [camRig.look.x, camRig.look.y, camRig.look.z] };
      if (reducedMotion) eg.t = 1;
      else eg.t = Math.min(1, eg.t + dt / EAGLE_SECS);
      const start = eg.from ?? followPose;
      const pose = eg.out ? flyBetween(eg.t, start, followPose) : flyBetween(eg.t, start, sky);
      if (eg.out && eg.t >= 1) {
        eg.on = false;
        eg.out = false;
      }
      camera.position.set(...pose.pos);
      camera.lookAt(...pose.look);
      return;
    }
    if (world.cameraMode !== "follow") {
      endFly(false);
      eg.on = false;
      eg.out = false;
      return;
    }
    camera.position.set(camRig.pos.x, camRig.pos.y, camRig.pos.z);
    camera.lookAt(st.camTarget);
    if (st.fly.on) {
      // Only the camera write is blended: camRig keeps the normal pose (cinema flies back to it), and the
      // fly pose ends exactly on it, so landing has no jump.
      const t = st.fly.frozen ?? (performance.now() - st.fly.t0) / 1000 / FLY_IN_SECS;
      if (t >= 1) endFly(true);
      else {
        const pose = flyInPose(t, { pos: [camRig.pos.x, camRig.pos.y, camRig.pos.z], look: [camRig.look.x, camRig.look.y, camRig.look.z] });
        camera.position.set(...pose.pos);
        camera.lookAt(...pose.look);
      }
    }
    if (debugCamView) {
      camera.position.set(...debugCamView.pos);
      camera.lookAt(...debugCamView.look);
    }
  });

  return (
    <>
      <group ref={group} position={[SPAWN[0], 0, SPAWN[1]]}>
        <Avatar characters={characters} />
        <mesh ref={blob} rotation-x={-Math.PI / 2} position-y={0.012} material={blobMat} renderOrder={1}>
          <planeGeometry args={[1.25, 1.25]} />
        </mesh>
      </group>
      <group ref={marker} visible={false}>
        <mesh rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.35, 0.5, 32]} />
          <meshBasicMaterial color="#fff6e0" transparent opacity={0.95} toneMapped={false} depthWrite={false} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position-y={0.005}>
          <circleGeometry args={[0.2, 24]} />
          <meshBasicMaterial color="#ffb347" transparent opacity={0.9} toneMapped={false} depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}
