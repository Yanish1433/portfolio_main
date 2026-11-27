"use client";

import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { AVATAR_HEIGHT, characterById, GAIT_CLIPS, gaitCycleRate, type CharacterId } from "./characters";
import { avatarMotion, RUN_SPEED, WALK_SPEED } from "./input";
import { applyLookdev, releaseLookdev } from "./lookdev";
import { useWorld } from "@/store/world";
import { createDanceAura, createDanceFlag, type DanceAura, type DanceFlag } from "./dance/danceFx";
import { FLAG_HIDE_BEFORE_END, FLAG_SHOW_FROM, HAND_BONE_RE } from "./dance/danceMath";
import { themeState } from "./nepal/themeState";

const DRACO_PATH = "/draco/";
const TARGET_HEIGHT = AVATAR_HEIGHT;

// --- Walk / run -------------------------------------------------------------
// The model ships Idle, Walk, Run and Dance clips. Idle / Walk / Run all play, weighted by the avatar's
// speed; Walk and Run share one phase (so the feet never scissor mid-blend) that advances at
// speed / stride, i.e. each clip's playback rate = speed / its measured ground speed.
//
// The procedural gait below is only a FALLBACK for a model without the Walk / Run clips. It is built per
// frame on the Mixamo bones, AFTER the mixer has written the Idle pose, and blended over it
// by speed (idle -> walk -> run). The phase is integrated from the distance
// travelled (phase += d / stride), so the feet don't slide and the legs don't
// pop when the stride length changes between walk and run.
// Sign convention (rotation about the character's +X axis): a negative angle
// swings a hanging limb forward; a positive angle tips the torso forward.
const deg = THREE.MathUtils.degToRad;
const lerp = THREE.MathUtils.lerp;
/** [walk, run] values. */
const G = {
  stride: [1.3, 2.2], // m per full cycle (two steps)
  thigh: [deg(25), deg(35)],
  thighFwd: [0, deg(6)], // run carries the legs a little more forward
  knee: [deg(40), deg(75)], // peak on the recovery leg
  kneeStance: [0.08, 0.22], // fraction of knee kept on the stance leg
  arm: [deg(15), deg(30)],
  elbow: [deg(12), deg(80)],
  hipYaw: [deg(5), deg(7)],
  spineYaw: [deg(8), deg(12)],
  hipLean: [deg(2), deg(8)], // whole-body lean, from the hips
  spineLean: [deg(1), deg(2)],
  bounce: [0.02, 0.045], // m
} as const;
const g = (k: keyof typeof G, run: number) => lerp(G[k][0], G[k][1], run);
/** Share of the torso lean / sway the head cancels, so the mask stays steady. */
const HEAD_STEADY = 0.7;

const AXIS_X = new THREE.Vector3(1, 0, 0); // character right is -X (it faces +Z)
const AXIS_Y = new THREE.Vector3(0, 1, 0);

type RigBone = {
  bone: THREE.Object3D;
  /** Idle pose at t = 0 (arms down), the base the walk offsets are applied to. */
  base: THREE.Quaternion;
  /** Character-space X / Y axes expressed in the bone's local frame. */
  ax: THREE.Vector3;
  ay: THREE.Vector3;
  az: THREE.Vector3;
};
type Rig = Partial<
  Record<
    | "hips"
    | "spine"
    | "spine1"
    | "lUpLeg"
    | "rUpLeg"
    | "lLeg"
    | "rLeg"
    | "lFoot"
    | "rFoot"
    | "lArm"
    | "rArm"
    | "lForeArm"
    | "rForeArm"
    | "neck"
    | "head",
    RigBone
  >
>;

const BONES: Record<keyof Rig, string> = {
  hips: "mixamorigHips",
  spine: "mixamorigSpine",
  spine1: "mixamorigSpine1",
  lUpLeg: "mixamorigLeftUpLeg",
  rUpLeg: "mixamorigRightUpLeg",
  lLeg: "mixamorigLeftLeg",
  rLeg: "mixamorigRightLeg",
  lFoot: "mixamorigLeftFoot",
  rFoot: "mixamorigRightFoot",
  lArm: "mixamorigLeftArm",
  rArm: "mixamorigRightArm",
  lForeArm: "mixamorigLeftForeArm",
  rForeArm: "mixamorigRightForeArm",
  neck: "mixamorigNeck",
  head: "mixamorigHead",
};

const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _rootInv = new THREE.Quaternion();

/** World up, 1 m long, in the hips' parent space (the bounce goes on the hips position). */
function hipsUp(scene: THREE.Object3D): THREE.Vector3 | null {
  const hips = scene.getObjectByName(BONES.hips);
  const parent = hips?.parent;
  if (!parent) return null;
  parent.updateWorldMatrix(true, false);
  const inv = parent.matrixWorld.clone().invert();
  const o = new THREE.Vector3().applyMatrix4(inv);
  // The avatar's outer groups are unscaled, so 1 world metre is 1 m here.
  return new THREE.Vector3(0, 1, 0).applyMatrix4(inv).sub(o);
}

/** Upper arms hang this far down from the T-pose rest in the gait base pose. */
const ARM_DOWN = deg(75);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
/** Arm bones whose gait base comes from the rest (T-pose), not the stylised Idle (arms out). */
const REST_BASED = ["lArm", "rArm", "lForeArm", "rForeArm"] as const;

/**
 * Capture the gait base pose and per-bone axes, relative to `root`. Legs, hips and
 * spine use the current Idle(t=0) pose. The arms use the rest pose with the upper arms
 * rotated down to the sides, because the shared Idle holds them out (a guardian pose).
 * `rest` holds the rest quaternions captured before the mixer first ran.
 */
function buildRig(scene: THREE.Object3D, root: THREE.Object3D, rest: Map<THREE.Object3D, THREE.Quaternion>, armDown = ARM_DOWN): Rig {
  root.updateWorldMatrix(true, true);
  root.getWorldQuaternion(_rootInv).invert();
  const rig: Rig = {};
  // Put the arms into their gait base first (children before parents don't matter: the
  // world matrices are refreshed afterwards), remembering the Idle values to restore.
  const idleQ = new Map<THREE.Object3D, THREE.Quaternion>();
  for (const key of REST_BASED) {
    const bone = scene.getObjectByName(BONES[key]);
    const r = bone && rest.get(bone);
    if (bone && r) {
      idleQ.set(bone, bone.quaternion.clone());
      bone.quaternion.copy(r);
    }
  }
  root.updateWorldMatrix(true, true);
  for (const [key, sign] of [
    ["lArm", -1],
    ["rArm", 1],
  ] as const) {
    const bone = scene.getObjectByName(BONES[key]);
    if (!bone || !idleQ.has(bone)) continue;
    const rel = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(_rootInv).invert();
    const az = AXIS_Z.clone().applyQuaternion(rel).normalize();
    bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(az, sign * armDown));
  }
  root.updateWorldMatrix(true, true);
  for (const key of Object.keys(BONES) as (keyof Rig)[]) {
    const bone = scene.getObjectByName(BONES[key]);
    if (!bone) continue;
    // rel = rootWorld⁻¹ · boneWorld; a character-space axis a becomes rel⁻¹ · a in bone-local space.
    const rel = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(_rootInv).invert();
    rig[key] = {
      bone,
      base: bone.quaternion.clone(),
      ax: AXIS_X.clone().applyQuaternion(rel).normalize(),
      ay: AXIS_Y.clone().applyQuaternion(rel).normalize(),
      az: AXIS_Z.clone().applyQuaternion(rel).normalize(),
    };
  }
  for (const [bone, q] of idleQ) bone.quaternion.copy(q);
  root.updateWorldMatrix(true, true);
  return rig;
}

/** bone.q = slerp(animated, base · R(axis, θx) · R(axisY, θy), w) */
function pose(r: RigBone | undefined, thetaX: number, thetaY: number, w: number) {
  if (!r) return;
  _q.copy(r.base);
  if (thetaX) _q.multiply(_qa.setFromAxisAngle(r.ax, thetaX));
  if (thetaY) _q.multiply(_qb.setFromAxisAngle(r.ay, thetaY));
  r.bone.quaternion.slerp(_q, w);
}

/** bone.q *= R(ax, θx) · R(az, θz): a small additive nudge in character space. */
function nudge(r: RigBone | undefined, thetaX: number, thetaZ = 0) {
  if (!r) return;
  if (thetaX) r.bone.quaternion.multiply(_qa.setFromAxisAngle(r.ax, thetaX));
  if (thetaZ) r.bone.quaternion.multiply(_qb.setFromAxisAngle(r.az, thetaZ));
}

// Relaxed standing pose (replaces the stiff Idle arms; per character via idleRelax / idleArmDown).
const RELAX = {
  elbow: deg(14), // slight bend
  breathAmp: deg(1.5), // spine / chest pitch
  breathHz: 0.25,
  shiftAmp: deg(1.1), // hips roll for the weight shift
  shiftHz: 0.11,
} as const;

// --- Model loading ----------------------------------------------------------

/** Loaded glTFs by url, so a replaced character can be disposed (one model in memory at a time). */
const loaded = new Map<string, GLTF>();

function disposeGltf(url: string) {
  const gltf = loaded.get(url);
  loaded.delete(url);
  if (gltf) {
    const all: THREE.Material[] = [];
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) all.push(...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
    });
    releaseLookdev(all);
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m) continue;
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
        m.dispose();
      }
    });
  }
  useGLTF.clear(url);
}

/** Falls back to the capsule if the model fails to load or parse. */
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[Avatar] character model failed to load, using capsule placeholder:", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function CapsuleAvatar() {
  return (
    <group>
      <mesh position={[0, 0.8, 0]} castShadow>
        <capsuleGeometry args={[0.36, 0.8, 8, 16]} />
        <meshStandardMaterial color="#e2795a" roughness={0.6} />
      </mesh>
      {/* face-direction nub (+Z is "forward") */}
      <mesh position={[0, 1.15, 0.38]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.12, 0.28, 12]} />
        <meshStandardMaterial color="#fff1dc" roughness={0.5} />
      </mesh>
    </group>
  );
}

type Gait = { thigh: number; knee: number; arm: number };

function CharacterModel({ url, gait, idleRelax, idleArmDown }: { url: string; gait: Gait; idleRelax: number; idleArmDown: number }) {
  const gltf = useGLTF(url, DRACO_PATH) as unknown as GLTF;
  loaded.set(url, gltf);
  const root = useRef<THREE.Group>(null);
  const { gl, scene: threeScene, camera } = useThree();
  const fx = useRef<{ flag: DanceFlag | null; aura: DanceAura | null; reduced: boolean; lite: boolean; centre: THREE.Vector3 }>({
    flag: null,
    aura: null,
    reduced: false,
    lite: false,
    centre: new THREE.Vector3(),
  });

  // Clone so the cached glTF scene (and its skeleton) can be reused safely.
  const { scene, scale, offsetY } = useMemo(() => {
    const cloned = cloneSkinned(gltf.scene);
    applyLookdev(cloned, gl);
    cloned.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false; // skinned bounds can be stale
      }
    });
    const box = new THREE.Box3().setFromObject(cloned);
    const h = box.max.y - box.min.y || 1;
    return { scene: cloned, scale: TARGET_HEIGHT / h, offsetY: -box.min.y * (TARGET_HEIGHT / h) };
  }, [gltf.scene, gl]);

  const anim = useMemo(() => {
    const mixer = new THREE.AnimationMixer(scene);
    const clip = (n: string) => gltf.animations.find((c) => c.name === n);
    const idleClip = clip("Idle");
    const danceClip = clip("Dance");
    const walkClip = clip(GAIT_CLIPS.walk.name);
    const runClip = clip(GAIT_CLIPS.run.name);
    const idle = idleClip ? mixer.clipAction(idleClip) : null;
    const dance = danceClip ? mixer.clipAction(danceClip) : null;
    // Phase-driven: time is set by hand every frame, so the mixer must not advance these two.
    const walk = walkClip && runClip ? mixer.clipAction(walkClip) : null;
    const run = walkClip && runClip ? mixer.clipAction(runClip) : null;
    for (const a of [walk, run]) {
      if (!a) continue;
      a.timeScale = 0;
      a.setEffectiveWeight(0);
      a.play();
    }
    if (dance) {
      dance.setLoop(THREE.LoopOnce, 1);
      dance.clampWhenFinished = true;
    }
    return { mixer, idle, dance, walk, run, walkDur: walkClip?.duration ?? 1, runDur: runClip?.duration ?? 1 };
  }, [scene, gltf.animations]);

  // Dance flag (right hand) and background aura: built once per model, mounted in the draw list only while dancing.
  useEffect(() => {
    const f = fx.current;
    f.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    f.lite = window.matchMedia("(pointer: coarse)").matches || new URLSearchParams(window.location.search).getAll("perf").includes("low");
    let hand: THREE.Object3D | null = null;
    scene.traverse((o) => {
      if (!hand && (o as THREE.Bone).isBone && HAND_BONE_RE.test(o.name)) hand = o;
    });
    if (hand) f.flag = createDanceFlag(hand);
    else if (process.env.NODE_ENV !== "production") console.warn("[Avatar] no right-hand bone found; the dance flag is off");
    if (!f.lite) f.aura = createDanceAura(threeScene);
    return () => {
      f.flag?.dispose();
      f.aura?.dispose();
      f.flag = f.aura = null;
    };
  }, [scene, threeScene]);

  const st = useRef({
    rig: null as Rig | null,
    /** Arm bones captured at the relaxed (idleArmDown) pose. */
    relaxRig: null as Rig | null,
    /** Eased 0..1 weight of the relaxed overlay (0 while dancing). */
    relax: 0,
    dancing: false,
    // Spawning (a pick) dances once; restoring on load counts too.
    danceSeq: -1,
    spawnSeq: useWorld.getState().spawnSeq,
    w: 0,
    /** Dance clip weight (eased in / out over 0.25 s; the other clips share the rest). */
    dw: 0,
    /** Walk / Run clip phase, 0..1 cycles. */
    cycle: 0,
    /** Walk -> run blend (eased). */
    run: 0,
    phase: 0,
    lastDist: avatarMotion.dist,
    up: null as THREE.Vector3 | null,
    stopDance: null as null | (() => void),
    /** Every bone's Idle(t=0) local transform. Restored before each mixer update, because
     * Idle doesn't animate every bone: without this, Dance (or walk) offsets on bones
     * Idle doesn't touch would stick after the clip fades out. */
    bind: [] as { o: THREE.Object3D; q: THREE.Quaternion; p: THREE.Vector3 }[],
  });

  useEffect(() => {
    const { mixer, dance } = anim;
    const backToIdle = () => {
      st.current.dancing = false; // useFrame fades the dance weight out
    };
    const onFinished = (e: { action: THREE.AnimationAction }) => {
      if (e.action === dance) backToIdle();
    };
    mixer.addEventListener("finished", onFinished);
    st.current.stopDance = backToIdle;
    // Esc stops the dance, unless it is closing a panel / the video / the picker this same keypress.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !st.current.dancing) return;
      const w = useWorld.getState();
      if (w.info || w.cinema || w.pickerOpen || w.panelOpen) return;
      backToIdle();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      mixer.removeEventListener("finished", onFinished);
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
    };
  }, [anim, scene]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = st.current;
    const { mixer, idle, dance, walk, run: runAction } = anim;
    const useClips = !!(walk && runAction);
    const world = useWorld.getState();

    if (!s.rig) {
      // First frame: rest pose (for the arms), then Idle at t=0 (the rest of the gait base).
      const rest = new Map<THREE.Object3D, THREE.Quaternion>();
      for (const key of REST_BASED) {
        const b = scene.getObjectByName(BONES[key]);
        if (b) rest.set(b, b.quaternion.clone());
      }
      idle?.reset().play();
      mixer.update(0);
      if (root.current) {
        s.rig = buildRig(scene, root.current, rest);
        if (idleRelax > 0) s.relaxRig = buildRig(scene, root.current, rest, deg(idleArmDown));
      }
      s.up = hipsUp(scene);
      scene.traverse((o) => {
        if ((o as THREE.Bone).isBone) s.bind.push({ o, q: o.quaternion.clone(), p: o.position.clone() });
      });
      s.danceSeq = world.danceSeq;
      // Dance when spawned by a pick (spawnSeq > 0), not when there's no choice yet.
      if (world.spawnSeq > 0) s.danceSeq = -1;
    }

    // Dance emote (G / button) or a fresh spawn.
    const gPressed = world.danceSeq !== s.danceSeq;
    const wantDance = gPressed || world.spawnSeq !== s.spawnSeq;
    s.danceSeq = world.danceSeq;
    s.spawnSeq = world.spawnSeq;
    if (gPressed && s.dancing && world.spawnSeq === s.spawnSeq) {
      s.stopDance?.(); // G again stops the dance
    } else if (wantDance && dance && avatarMotion.speed < 0.3) {
      s.dancing = true;
      dance.reset();
      dance.setEffectiveWeight(0);
      dance.play();
    }
    // Any movement cancels the dance.
    if (s.dancing && avatarMotion.speed > 0.4) s.stopDance?.();

    for (const b of s.bind) {
      b.o.quaternion.copy(b.q);
      b.o.position.copy(b.p);
    }

    // Gait weights by speed (eased so stops don't snap): idle -> walk -> run.
    const speed = avatarMotion.speed;
    // (Kept under reduced motion: a character gliding without moving its legs reads worse;
    // reduced motion affects the camera and ambient motion instead.)
    const target = s.dancing ? 0 : THREE.MathUtils.clamp(speed / 0.8, 0, 1);
    s.w += (target - s.w) * (1 - Math.exp(-dt * 10));
    const runTarget = THREE.MathUtils.smoothstep(speed, WALK_SPEED + 0.3, RUN_SPEED - 0.5);
    s.run += (runTarget - s.run) * (1 - Math.exp(-dt * 6)); // ~0.3 s blend
    const w = s.w < 0.002 ? 0 : s.w;
    const run = s.run;

    // Clip weights (sum to 1): dance fades in / out over 0.25 s, the rest is idle / walk / run by speed.
    if (dance) {
      s.dw = THREE.MathUtils.clamp(s.dw + (s.dancing ? dt : -dt) / 0.25, 0, 1);
      if (s.dw > 0) dance.setEffectiveWeight(s.dw);
      else if (dance.isRunning()) dance.stop();
    }
    const rest = 1 - s.dw;
    if (walk && runAction) {
      // Start every step from the left foot's contact; then advance by speed / stride.
      if (w === 0 && avatarMotion.speed < 0.1) s.cycle = 0;
      else s.cycle = (s.cycle + dt * gaitCycleRate(avatarMotion.speed, scale, run)) % 1;
      walk.time = s.cycle * anim.walkDur;
      runAction.time = s.cycle * anim.runDur;
      walk.setEffectiveWeight(rest * w * (1 - run));
      runAction.setEffectiveWeight(rest * w * run);
    }
    idle?.setEffectiveWeight(useClips ? rest * (1 - w) : rest);
    mixer.update(dt);
    // Integrate the phase from the distance actually travelled.
    const d = avatarMotion.dist - s.lastDist;
    s.lastDist = avatarMotion.dist;
    s.phase = (s.phase + (Math.max(0, d) / g("stride", run)) * Math.PI * 2) % (Math.PI * 2);

    // Relaxed standing overlay: REPLACES the Idle clip's arm pose (slerp toward the relaxed pose),
    // then adds breathing and a weight shift. Fades out as speed rises and is fully off while dancing.
    const relaxTarget = s.dancing ? 0 : 1;
    s.relax += (relaxTarget - s.relax) * (1 - Math.exp(-dt * (relaxTarget ? 5 : 25)));
    const rw = s.relax < 0.002 ? 0 : s.relax * idleRelax * (1 - w);
    if (rw > 0 && s.rig && s.relaxRig) {
      const r = s.rig;
      const ra = s.relaxRig;
      pose(ra.lArm, 0, 0, rw);
      pose(ra.rArm, 0, 0, rw);
      pose(ra.lForeArm, -RELAX.elbow, 0, rw);
      pose(ra.rForeArm, -RELAX.elbow, 0, rw);
      const t = performance.now() / 1000;
      const breath = Math.sin(t * Math.PI * 2 * RELAX.breathHz) * RELAX.breathAmp * rw;
      nudge(r.spine, breath);
      nudge(r.spine1, breath * 0.8);
      nudge(r.neck, -breath * 0.7); // head stays calm
      // Weight shift: the hips roll one way, the legs and chest roll back so the body stays upright.
      const shift = Math.sin(t * Math.PI * 2 * RELAX.shiftHz) * RELAX.shiftAmp * rw;
      nudge(r.hips, 0, shift);
      nudge(r.lUpLeg, 0, -shift * 0.9);
      nudge(r.rUpLeg, 0, -shift * 0.9);
      nudge(r.spine, 0, -shift * 0.6);
      nudge(r.spine1, 0, -shift * 0.4);
    }

    if (!useClips && w > 0 && s.rig) {
      const r = s.rig;
      const phi = s.phase;
      const sn = Math.sin(phi);
      const cs = Math.cos(phi);
      const lean = g("hipLean", run) * w;
      // Legs: thighs swing (negative = forward), knees bend on the recovery
      // (forward-swinging) leg and stay soft on the stance leg.
      const thighA = g("thigh", run) * gait.thigh;
      const fwd = g("thighFwd", run) * gait.thigh;
      const kneeA = g("knee", run) * gait.knee;
      const stance = g("kneeStance", run);
      // Thighs also cancel the hip lean, so the legs stay under the body.
      const thighL = -thighA * sn - fwd - lean;
      const thighR = thighA * sn - fwd - lean;
      const kneeL = kneeA * (stance + (1 - stance) * Math.max(0, cs) ** 1.3);
      const kneeR = kneeA * (stance + (1 - stance) * Math.max(0, -cs) ** 1.3);
      pose(r.lUpLeg, thighL, 0, w);
      pose(r.rUpLeg, thighR, 0, w);
      pose(r.lLeg, kneeL, 0, w);
      pose(r.rLeg, kneeR, 0, w);
      // Keep the feet roughly level.
      pose(r.lFoot, -(thighL + kneeL + lean) * 0.55, 0, w);
      pose(r.rFoot, -(thighR + kneeR + lean) * 0.55, 0, w);
      // Arms swing opposite the legs; at a run the elbows bend and pump.
      const armA = g("arm", run) * gait.arm;
      const elbow = g("elbow", run) + deg(10) * run * Math.abs(sn);
      pose(r.lArm, armA * sn, 0, w);
      pose(r.rArm, -armA * sn, 0, w);
      pose(r.lForeArm, -elbow, 0, w);
      pose(r.rForeArm, -elbow, 0, w);
      // Pelvis turns with the leading leg and tips forward; the chest counter-rotates.
      const hipYaw = -g("hipYaw", run) * sn;
      const spineYaw = g("spineYaw", run) * 0.5 * sn;
      const spineLean = g("spineLean", run);
      pose(r.hips, lean / Math.max(w, 1e-3), hipYaw, w);
      pose(r.spine, spineLean, spineYaw, w);
      pose(r.spine1, 0, spineYaw, w);
      // Steady head: cancel most of the lean and the net torso sway (split over neck + head).
      const torsoPitch = lean / Math.max(w, 1e-3) + spineLean;
      const torsoYaw = hipYaw + spineYaw * 2;
      pose(r.neck, (-torsoPitch * HEAD_STEADY) / 2, (-torsoYaw * HEAD_STEADY) / 2, w);
      pose(r.head, (-torsoPitch * HEAD_STEADY) / 2, (-torsoYaw * HEAD_STEADY) / 2, w);
      // Bounce on the hips: walking peaks as the legs pass; running peaks in the
      // flight phase (legs apart) and dips at mid-stance.
      const walkBob = cs * cs;
      const runBob = sn * sn;
      const bounce = g("bounce", run) * w * lerp(walkBob, runBob, run);
      const hips = r.hips?.bone;
      if (hips && s.up) hips.position.addScaledVector(s.up, bounce);
    }
    // Flag + aura: only in the follow camera (not eagle / cinema), and only while dancing.
    const f = fx.current;
    const night = themeState.t;
    const fxOn = world.cameraMode === "follow" && !world.cinema;
    const dt0 = dance?.time ?? 0;
    const inWindow = dt0 >= FLAG_SHOW_FROM && dt0 < (dance?.getClip().duration ?? 15) - FLAG_HIDE_BEFORE_END;
    f.flag?.update(dt, s.dancing && fxOn && inWindow, { reduced: f.reduced, night });
    if (f.aura && root.current) {
      root.current.getWorldPosition(f.centre);
      f.centre.y += 1.1;
      f.aura.update(dt, fxOn ? s.dw : 0, camera, f.centre, { reduced: f.reduced, night });
    }
    if (root.current) root.current.position.y = offsetY;
  });

  return (
    <group ref={root} scale={scale} position={[0, offsetY, 0]}>
      <primitive object={scene} />
    </group>
  );
}

export default function Avatar({ characters }: { characters: CharacterId[] }) {
  const chosen = useWorld((s) => s.character);
  const def = chosen && characters.includes(chosen) ? characterById(chosen) : undefined;
  const url = def?.file;

  // Only one character model stays in GPU/RAM: drop the previous one on a switch.
  const prev = useRef<string | undefined>(undefined);
  useEffect(() => {
    const old = prev.current;
    prev.current = url;
    if (old && old !== url) disposeGltf(old);
  }, [url]);

  if (!chosen) return null;
  return url && def ? (
    <ModelBoundary key={url} fallback={<CapsuleAvatar />}>
      <Suspense fallback={<CapsuleAvatar />}>
        <CharacterModel url={url} gait={def.gait} idleRelax={def.idleRelax} idleArmDown={def.idleArmDown} />
      </Suspense>
    </ModelBoundary>
  ) : (
    <CapsuleAvatar />
  );
}
