"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { blockedAt } from "../nav";
import { SPOTS } from "../halls/layout";
import { avatarMotion, navPath, playerPos, robotPos } from "../input";
import { getEnvironment } from "../nepal/materials";
import { themeState } from "../nepal/themeState";
import { useWorld } from "@/store/world";
import { createRobotGeometry, createRobotMaterials, glowTexture, type EyeState } from "./robotMesh";
import { robotMotion, useRobot } from "./robotStore";
import RobotBubble from "./RobotBubble";
import { AVATAR_SCALE } from "../characters";

const HEIGHT = 1.6 * AVATAR_SCALE;
const PAD = 0.3; // keep this far from walls
const SIDE = 0.85 * AVATAR_SCALE; // to the avatar's right
const BACK = 0.9 * AVATAR_SCALE; // behind the avatar
const LEAD_AHEAD = 2.0;
/** Follow speed cap (m/s), faster than the avatar's run, with a catch-up boost when far behind. */
const MAX_SPEED = 5.5;
const CATCH_UP_DIST = 4;
const CATCH_UP = 1.8;

/** Point `ahead` metres further along the avatar's remaining path. */
function pointAhead(ahead: number): [number, number] | null {
  const { path, idx } = navPath;
  if (!path.length || idx >= path.length) return null;
  let px = playerPos.x;
  let pz = playerPos.z;
  let left = ahead;
  for (let i = idx; i < path.length; i++) {
    const [x, z] = path[i];
    const d = Math.hypot(x - px, z - pz);
    if (d >= left) return [px + ((x - px) / d) * left, pz + ((z - pz) / d) * left];
    left -= d;
    px = x;
    pz = z;
  }
  return [px, pz];
}

export default function RobotBuddy({ reducedMotion }: { reducedMotion: boolean }) {
  const { gl } = useThree();
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const sprite = useRef<THREE.Sprite>(null);

  const geometry = useMemo(() => createRobotGeometry(), []);
  const mats = useMemo(() => createRobotMaterials(getEnvironment(gl)), [gl]);
  const glowMat = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: glowTexture(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        opacity: 0.3,
      }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      mats.dispose();
      glowMat.map?.dispose();
      glowMat.dispose();
    },
    [geometry, mats, glowMat],
  );

  const s = useRef({
    x: playerPos.x + 1,
    z: playerPos.z + 1,
    yaw: 0,
    placed: false,
    crumbs: [] as [number, number][],
    nextBlink: 3,
    blinkUntil: 0,
    spawnSeq: -1,
  });

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const st = s.current;
    const g = group.current;
    if (!g) return;
    const now = state.clock.elapsedTime;
    const nowAbs = performance.now() / 1000;
    const h = avatarMotion.heading;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    // Right of a character facing (fx, fz) is (-fz, fx).
    const rx = -fz;
    const rz = fx;

    // Respawn next to the avatar when it (re)spawns.
    const spawnSeq = useWorld.getState().spawnSeq;
    if (!st.placed || spawnSeq !== st.spawnSeq) {
      st.spawnSeq = spawnSeq;
      st.placed = true;
      st.x = playerPos.x + rx * SIDE * 1.5 - fx * BACK;
      st.z = playerPos.z + rz * SIDE * 1.5 - fz * BACK;
      st.crumbs = [];
    }

    // Breadcrumbs of the avatar's walk (walkable points by construction).
    const last = st.crumbs[st.crumbs.length - 1];
    if (!last || Math.hypot(last[0] - playerPos.x, last[1] - playerPos.z) > 0.3) {
      st.crumbs.push([playerPos.x, playerPos.z]);
      if (st.crumbs.length > 24) st.crumbs.shift();
    }

    // Where to fly: ahead along the path when leading, else behind-right of the avatar.
    let tx: number;
    let tz: number;
    let rate = 3.2;
    const ahead = robotMotion.leading ? pointAhead(LEAD_AHEAD) : null;
    if (ahead) {
      [tx, tz] = ahead;
      rate = 4;
    } else {
      tx = playerPos.x + rx * SIDE - fx * BACK;
      tz = playerPos.z + rz * SIDE - fz * BACK;
      // Standing at a project stand's ring: wait beside the ring, not over the stand's diorama.
      const near = SPOTS.find((sp) => sp.kind === "project" && Math.hypot(sp.ring[0] - playerPos.x, sp.ring[1] - playerPos.z) < 1.2);
      if (near) {
        tx = near.ring[0] + (rx >= 0 ? 1 : -1) * 1.15;
        tz = near.ring[1] + 0.3;
      }
      if (blockedAt(tx, tz, PAD)) {
        // Fall back to the avatar's own trail (~1.2 m back), which is always walkable.
        let crumb: [number, number] = [playerPos.x, playerPos.z];
        for (let i = st.crumbs.length - 1; i >= 0; i--) {
          crumb = st.crumbs[i];
          if (Math.hypot(crumb[0] - playerPos.x, crumb[1] - playerPos.z) > 1.2) break;
        }
        [tx, tz] = crumb;
      }
    }
    // Ease toward the target, but never faster than the speed cap (boosted when far behind).
    const gap = Math.hypot(tx - st.x, tz - st.z);
    const far = Math.hypot(playerPos.x - st.x, playerPos.z - st.z) > CATCH_UP_DIST;
    const maxStep = MAX_SPEED * (far ? CATCH_UP : 1) * dt;
    const stepLen = Math.min(gap * (1 - Math.exp(-dt * rate)) * (far ? CATCH_UP : 1), maxStep, gap);
    let nx = st.x + (gap > 1e-5 ? ((tx - st.x) / gap) * stepLen : 0);
    let nz = st.z + (gap > 1e-5 ? ((tz - st.z) / gap) * stepLen : 0);
    // Never inside a building: ease toward the avatar until free.
    for (let i = 0; i < 6 && blockedAt(nx, nz, PAD); i++) {
      nx += (playerPos.x - nx) * 0.25;
      nz += (playerPos.z - nz) * 0.25;
    }
    const vx = (nx - st.x) / Math.max(dt, 1e-3);
    const vz = (nz - st.z) / Math.max(dt, 1e-3);
    st.x = nx;
    st.z = nz;

    // Look: at what it's talking about, else ahead when leading, else at the avatar.
    let lx = playerPos.x;
    let lz = playerPos.z;
    if (robotMotion.lookAt && nowAbs < robotMotion.lookUntil) [lx, lz] = robotMotion.lookAt;
    else if (ahead) [lx, lz] = [tx + (tx - playerPos.x), tz + (tz - playerPos.z)];
    const want = Math.atan2(lx - st.x, lz - st.z);
    st.yaw += Math.atan2(Math.sin(want - st.yaw), Math.cos(want - st.yaw)) * (1 - Math.exp(-dt * 5));

    const bob = reducedMotion ? 0 : Math.sin(now * 2.1) * 0.06;
    g.position.set(st.x, HEIGHT + bob, st.z);
    robotPos.x = st.x;
    robotPos.z = st.z;
    if (body.current) {
      body.current.rotation.y = st.yaw;
      // Lean into the motion a little.
      const speed = Math.hypot(vx, vz);
      body.current.rotation.x = reducedMotion ? 0 : Math.min(speed * 0.05, 0.25);
    }

    // Theme: brighter lantern at night.
    const t = themeState.t;
    mats.brass.emissiveIntensity = 0.25 + t * 1.6;
    glowMat.opacity = 0.18 + t * 0.6;
    if (sprite.current) sprite.current.scale.setScalar(0.9 + t * 0.5);

    // Eyes: thinking > happy (just replied) > blink every ~4 s > open.
    const robot = useRobot.getState();
    if (now > st.nextBlink) {
      st.blinkUntil = now + 0.13;
      st.nextBlink = now + 3.2 + Math.random() * 1.6;
    }
    let eye: EyeState = "open";
    if (robot.thinking) eye = "thinking";
    else if (nowAbs - robotMotion.repliedAt < 1.6) eye = "happy";
    else if (now < st.blinkUntil && !reducedMotion) eye = "blink";
    mats.eyes.draw(eye);
  });

  return (
    <group ref={group} position={[0, HEIGHT, 0]}>
      <group ref={body}>
        <mesh geometry={geometry} material={[mats.brass, mats.screen]} />
      </group>
      <sprite ref={sprite} material={glowMat} scale={0.9} renderOrder={2} />
      <Html position={[0, 0.42, 0]} zIndexRange={[9, 0]} style={{ pointerEvents: "none" }}>
        <RobotBubble reducedMotion={reducedMotion} />
      </Html>
    </group>
  );
}
