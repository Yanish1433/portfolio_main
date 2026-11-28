"use client";

// The pottery wheel game (lazy chunk). Drives the hidden meshes that Pottery.tsx created at load:
//  shape   the wheel spins up, the clay springs up from a squat lump; drag / arrow keys pull it (clayProfile.ts), slip flecks fly
//  firing  the wheel spins down, the pot glows in the kiln (heat shimmer + sparks) for 2 s, then the logo is stamped and it cools
//  result  the pot has cooled to terracotta; the card says which skill it was and links to a project that used it
//  placing the pot arcs onto its shelf slot and settles with a small bounce; the new lump rises on the wheel
// Per frame there is no allocation: arrays, vectors and the geometry buffers are all preallocated.
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { profile } from "@/content/profile";
import { projectsForSkill } from "@/content/showcase";
import { isTypingTarget, useWorld } from "@/store/world";
import { pointerClaim } from "../input";
import { projectInfo, visitByVisitor } from "../halls/visit";
import { applyDrag, BANDS, clamp, newClay, nudgeBand, nudgeHeight, stepBand } from "./clayProfile";
import { WHEEL, shelfSlot } from "./layout";
import { setGlaze } from "./clayMaterial";
import { coolAmounts, glazeFor } from "./glaze";
import { allCollected, pickSkill, uniqueSkills } from "./skillPick";
import { addPot, SHELF_MAX, storeSave, type PotterySave } from "./save";
import { potteryCtl, usePottery, type PotResult } from "./potteryStore";
import type { Rig } from "./rig";

const ALL_SKILLS = uniqueSkills(profile.skills.flatMap((g) => g.skills.map((s) => s.name)));
const TWO_PI = Math.PI * 2;
const CLAY_WET = new THREE.Color("#9b765f");
const FIRED = new THREE.Color("#cc6b3d");
const SHELF_SCALE = 0.5;
const OMEGA = 5.5; // rad/s of the wheel while shaping (~0.9 turns a second)
const FIRE_SECS = 2;
const COOL_SECS = 2.4;
const PLACE_SECS = 0.85;
const SETTLE_SECS = 0.55;
const smooth01 = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

type Phase = "shape" | "firing" | "cooling" | "placing";

export default function PotteryGame({ rig, reducedMotion }: { rig: Rig; reducedMotion: boolean }) {
  const { camera } = useThree();
  const s = useRef(
    (() => ({
      phase: "shape" as Phase,
      t: 0,
      target: newClay(),
      dr: new Array<number>(BANDS).fill(0.34),
      vr: new Array<number>(BANDS).fill(0),
      dh: 0.12,
      vh: 0,
      dirty: true,
      omega: 0,
      spin: 0,
      heat: 0,
      wobImp: 0,
      dragging: false,
      pid: -1,
      lastX: 0,
      lastY: 0,
      pdx: 0,
      pdy: 0,
      yFrac: 0.5,
      splashAcc: 0,
      sparkAcc: 0,
      band: 6,
      kbd: false,
      skill: null as string | null,
      pending: null as PotterySave | null,
      committed: true,
      stamped: false,
      logoReady: null as null | typeof import("./logoDraw"),
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      fromYaw: 0,
      confettiAt: -1,
      master: false,
    }))(),
  );

  // ---- pure-ish actions (read/write the ref + store) ---------------------------------------------------------------
  const api = useMemo(() => {
    const st = () => s.current;
    const resetLump = () => {
      const g = st();
      g.target = newClay();
      g.dr.fill(0.34);
      g.vr.fill(0);
      g.dh = 0.12;
      g.vh = 0;
      g.dirty = true;
      g.heat = 0;
      g.stamped = false;
      g.skill = null;
      g.phase = "shape";
      g.t = 0;
      rig.clay.position.set(WHEEL.x, WHEEL.headY, WHEEL.z);
      rig.clay.scale.setScalar(1);
      rig.clay.rotation.set(0, 0, 0);
      rig.mat.color.copy(CLAY_WET);
      const u = rig.mat.userData.clay;
      u.uHeat.value = 0;
      u.uGlazeAmt.value = 0;
      u.uDecal.value = 0;
      u.uWet.value = 0.9;
      if (rig.decalCanvas && rig.decal) {
        const ctx = rig.decalCanvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, rig.decalCanvas.width, rig.decalCanvas.height);
          rig.decal.needsUpdate = true;
        }
      }
      rig.clay.visible = true;
      usePottery.getState().set({ phase: "shape", result: null });
    };

    const commit = () => {
      const g = st();
      if (g.committed || !g.pending) return;
      g.committed = true;
      storeSave(g.pending);
      usePottery.getState().set({ save: g.pending });
    };

    const finishFire = () => {
      const g = st();
      const skill = g.skill ?? "Pottery";
      const before = usePottery.getState().save;
      const next = addPot(before, g.target, skill);
      g.pending = next;
      g.committed = false;
      const hit = projectsForSkill(skill)[0];
      const project = hit && projectInfo(hit.id) ? { id: hit.id, name: hit.name } : null;
      const masterNow = allCollected(ALL_SKILLS, next.collected);
      g.master = masterNow && !allCollected(ALL_SKILLS, before.collected);
      const result: PotResult = { skill, project, total: ALL_SKILLS.length, collected: next.collected.filter((c) => ALL_SKILLS.some((a) => a.toLowerCase() === c.toLowerCase())).length, master: masterNow };
      usePottery.getState().set({ phase: "result", result });
    };

    const stamp = () => {
      const g = st();
      if (g.stamped || !g.logoReady || !rig.decalCanvas || !rig.decal) return false;
      g.logoReady.stampDecal(rig.decalCanvas, g.skill ?? "Pottery", g.target);
      rig.decal.needsUpdate = true;
      g.stamped = true;
      // the stamped side turns to the camera (the decal is at u = 0.5 = local -z)
      const dx = camera.position.x - WHEEL.x;
      const dz = camera.position.z - WHEEL.z;
      rig.clay.rotation.y = Math.atan2(-dx, -dz);
      rig.mat.color.copy(FIRED);
      setGlaze(rig.mat.userData.clay, glazeFor(g.logoReady.hexFor(g.skill ?? "Pottery")));
      rig.mat.userData.clay.uWet.value = 0.18;
      return true;
    };

    const fire = () => {
      const g = st();
      if (g.phase !== "shape") return;
      g.skill = pickSkill(ALL_SKILLS, usePottery.getState().save.collected) ?? "Pottery";
      g.phase = "firing";
      g.t = 0;
      g.kbd = false;
      g.dragging = false;
      usePottery.getState().set({ phase: "firing", band: null, result: null });
      if (reducedMotion) {
        // instant: no kiln, no spin
        g.heat = 0;
        g.omega = 0;
        const tryStamp = () => {
          if (stamp()) {
            g.phase = "cooling";
            g.t = COOL_SECS;
            finishFire();
          } else window.setTimeout(tryStamp, 30);
        };
        tryStamp();
      }
    };

    const place = () => {
      const g = st();
      if (g.phase !== "cooling" || usePottery.getState().phase !== "result") return;
      const pend = g.pending;
      const idx = Math.min(SHELF_MAX - 1, Math.max(0, (pend?.pots.length ?? 1) - 1));
      const slot = shelfSlot(idx);
      g.from.copy(rig.clay.position);
      g.to.set(slot.x, slot.y, slot.z);
      g.fromYaw = rig.clay.rotation.y;
      g.phase = "placing";
      g.t = 0;
      usePottery.getState().set({ phase: "placing" });
      if (reducedMotion) g.t = PLACE_SECS + SETTLE_SECS; // no flight: shelved at once
    };

    const exit = () => {
      const g = st();
      // leaving mid-firing still keeps the pot
      if (g.phase === "firing" || (g.phase === "cooling" && usePottery.getState().phase === "firing")) finishFire();
      commit();
      useWorld.getState().setPanelOpen(false);
    };

    return { resetLump, commit, finishFire, stamp, fire, place, exit };
  }, [rig, camera, reducedMotion]);

  // ---- mount / unmount ---------------------------------------------------------------------------------------------
  useEffect(() => {
    const g = s.current;
    rig.clay.visible = true;
    rig.points.visible = true;
    rig.particles.clear();
    api.resetLump();
    usePottery.getState().set({ phase: "shape", band: null, result: null });
    void import("./logoDraw").then((m) => {
      g.logoReady = m;
    });
    const down = (e: ThreeEvent<PointerEvent>) => {
      if (g.phase !== "shape") return;
      e.stopPropagation();
      pointerClaim.claim(e.pointerId);
      g.dragging = true;
      g.pid = e.pointerId;
      const ne = e.nativeEvent;
      g.lastX = ne.clientX;
      g.lastY = ne.clientY;
      g.pdx = 0;
      g.pdy = 0;
      g.kbd = false;
      usePottery.getState().set({ band: null });
      g.yFrac = clamp((e.point.y - WHEEL.headY) / Math.max(0.1, g.dh), 0, 1);
    };
    rig.onDown = down;
    const move = (e: PointerEvent) => {
      if (!g.dragging || e.pointerId !== g.pid) return;
      g.pdx += e.clientX - g.lastX;
      g.pdy += e.clientY - g.lastY;
      g.lastX = e.clientX;
      g.lastY = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === g.pid) {
        g.dragging = false;
        g.pid = -1;
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);

    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e)) return;
      const ph = usePottery.getState().phase;
      if (e.code === "Escape") {
        e.preventDefault();
        api.exit();
        return;
      }
      if (ph === "result" && (e.code === "Enter" || e.code === "Space")) {
        e.preventDefault();
        api.place();
        return;
      }
      if (ph !== "shape") return;
      let handled = true;
      if (e.code === "ArrowUp" || e.code === "ArrowDown") {
        const dir = e.code === "ArrowUp" ? 1 : -1;
        if (e.shiftKey) {
          nudgeHeight(g.target, dir);
          g.dirty = true;
        } else g.band = stepBand(g.kbd ? g.band : 6, dir);
        g.kbd = true;
        usePottery.getState().set({ band: g.band });
      } else if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        g.kbd = true;
        nudgeBand(g.target, g.band, e.code === "ArrowRight" ? 1 : -1);
        g.wobImp = Math.min(0.03, g.wobImp + 0.01);
        usePottery.getState().set({ band: g.band });
      } else if (e.code === "Enter") api.fire();
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", key);

    // ?debug only: where the clay is on screen (css px), for the screenshot script
    const debugApi = new URLSearchParams(window.location.search).has("debug") ? (window as unknown as { __pottery?: unknown }) : null;
    if (debugApi) {
      const v = new THREE.Vector3();
      debugApi.__pottery = {
        clayPx: (yFrac = 0.5) => {
          v.set(WHEEL.x, WHEEL.headY + g.dh * yFrac, WHEEL.z).project(camera);
          const el = document.querySelector("canvas")!.getBoundingClientRect();
          return [el.left + ((v.x + 1) / 2) * el.width, el.top + ((1 - v.y) / 2) * el.height];
        },
        phase: () => g.phase,
      };
    }

    potteryCtl.fire = api.fire;
    potteryCtl.place = api.place;
    potteryCtl.exit = api.exit;
    potteryCtl.openProject = (id) => {
      api.exit();
      const ref = projectInfo(id);
      if (ref) void visitByVisitor(ref);
    };
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
      rig.onDown = null;
      potteryCtl.fire = potteryCtl.place = potteryCtl.exit = potteryCtl.openProject = null;
      api.commit(); // a pot that was fired but not shelved is never lost
      rig.clay.visible = false;
      rig.points.visible = false;
      rig.particles.clear();
      rig.mat.userData.clay.uHeat.value = 0;
      rig.mat.userData.clay.uGlazeAmt.value = 0;
      rig.mat.userData.clay.uDecal.value = 0;
      usePottery.getState().set({ phase: "off", band: null, result: null });
    };
  }, [rig, api, camera]);

  // ---- per frame ----------------------------------------------------------------------------------------------------
  useFrame((state, dtRaw) => {
    const g = s.current;
    const dt = Math.min(dtRaw, 0.033);
    const u = rig.mat.userData.clay;
    u.uTime.value = state.clock.elapsedTime;
    const cam = state.camera as THREE.PerspectiveCamera;
    rig.pointsMat.uniforms.uPx.value = (state.size.height * state.viewport.dpr) / (2 * Math.tan((cam.fov * Math.PI) / 360));

    // wheel: angular momentum (spins up while shaping, coasts down when fired)
    const omegaT = g.phase === "shape" ? (reducedMotion ? 1.2 : OMEGA) : 0;
    const k = omegaT > g.omega ? 1.15 : 1.5;
    g.omega += (omegaT - g.omega) * (1 - Math.exp(-dt * k));
    if (Math.abs(g.omega) < 0.002 && omegaT === 0) g.omega = 0;
    g.spin = (g.spin + g.omega * dt) % TWO_PI;
    u.uSpin.value = g.spin;

    // drag: at most one reshape per frame
    let moved = false;
    if (g.phase === "shape" && (g.pdx !== 0 || g.pdy !== 0)) {
      applyDrag(g.target, g.yFrac, g.pdx, g.pdy);
      g.wobImp = Math.min(0.04, g.wobImp + Math.hypot(g.pdx, g.pdy) * 0.0008);
      g.pdx = 0;
      g.pdy = 0;
      moved = true;
    }

    // the clay follows its target like a spring: it pulls up with easing and a slight wobble
    const kS = reducedMotion ? 400 : 85;
    const cS = reducedMotion ? 40 : 10.5;
    let energy = 0;
    for (let i = 0; i < BANDS; i++) {
      const err = g.target.r[i] - g.dr[i];
      g.vr[i] += (err * kS - g.vr[i] * cS) * dt;
      g.dr[i] += g.vr[i] * dt;
      energy = Math.max(energy, Math.abs(err), Math.abs(g.vr[i]) * 0.02);
    }
    const errH = g.target.h - g.dh;
    g.vh += (errH * (kS * 0.8) - g.vh * (cS * 0.9)) * dt;
    g.dh += g.vh * dt;
    energy = Math.max(energy, Math.abs(errH), Math.abs(g.vh) * 0.02);
    if (moved || g.dirty || energy > 4e-4) {
      rig.geo.update(g.dr, g.dh);
      g.dirty = energy > 4e-4;
    }

    // wobble (decays) + wet sheen
    g.wobImp *= Math.exp(-dt * 3);
    const wobBase = reducedMotion || g.phase !== "shape" ? 0 : 0.004 * (g.omega / OMEGA);
    u.uWob.value = reducedMotion ? 0 : wobBase + g.wobImp;

    const midY = WHEEL.headY + g.dh * 0.5;
    const P = rig.particles;

    // slip flecks while the clay is being worked
    if (!reducedMotion && g.phase === "shape" && g.dragging && g.omega > 1) {
      g.splashAcc += dt * 26;
      while (g.splashAcc >= 1) {
        g.splashAcc -= 1;
        const a = Math.random() * TWO_PI;
        const band = Math.round(g.yFrac * (BANDS - 1));
        const r = g.dr[band] + 0.01;
        P.splash(WHEEL.x + Math.sin(a) * r, WHEEL.headY + g.yFrac * g.dh, WHEEL.z + Math.cos(a) * r, Math.cos(a) * g.omega * 0.12, -Math.sin(a) * g.omega * 0.12);
      }
    }

    // keyboard band marker
    if (g.kbd && g.phase === "shape") {
      const bi = clamp(g.band, 0, BANDS - 1);
      P.marker(WHEEL.x, WHEEL.headY + (bi / (BANDS - 1)) * g.dh, WHEEL.z, g.dr[bi] + 0.03, g.spin * 0.3, 1);
    } else P.marker(WHEEL.x, WHEEL.headY, WHEEL.z, 0.1, 0, 0);

    // ---- phases
    if (g.phase === "firing") {
      g.t += dt;
      const f = smooth01(g.t / 0.55);
      g.heat = f;
      u.uHeat.value = g.heat;
      u.uGlazeAmt.value = 0;
      u.uDecal.value = 0;
      rig.mat.color.lerpColors(CLAY_WET, FIRED, smooth01(g.t / FIRE_SECS) * 0.7);
      u.uWet.value = 0.9 * (1 - smooth01(g.t / FIRE_SECS));
      P.glow(WHEEL.x, midY, WHEEL.z, f * (0.55 + 0.15 * Math.sin(g.t * 13)), 1.5 + 0.1 * Math.sin(g.t * 9));
      g.sparkAcc += dt * 34 * f;
      while (g.sparkAcc >= 1) {
        g.sparkAcc -= 1;
        P.spark(WHEEL.x, WHEEL.headY + g.dh * 0.95, WHEEL.z);
      }
      if (g.t >= FIRE_SECS && api.stamp()) {
        g.phase = "cooling";
        g.t = 0;
      }
    } else if (g.phase === "cooling") {
      if (g.t >= 0) {
        g.t += dt;
        const c = clamp(g.t / COOL_SECS, 0, 1);
        g.heat = reducedMotion ? 0 : (1 - easeOutCubic(c)) * (1 - 0.0);
        u.uHeat.value = g.heat;
        // the kiln glow cools into the skill's glaze; the medallion fades in after it (reduced motion: heat is 0 -> both instant)
        const cool = coolAmounts(g.heat);
        u.uGlazeAmt.value = cool.glaze;
        u.uDecal.value = cool.decal;
        P.glow(WHEEL.x, midY, WHEEL.z, g.heat * 0.5, 1.5);
        if (!reducedMotion && g.t > 0.9 && usePottery.getState().phase === "firing") api.finishFire();
      }
    } else if (g.phase === "placing") {
      g.t += dt;
      u.uHeat.value = 0;
      u.uGlazeAmt.value = 1;
      u.uDecal.value = 1;
      P.glow(WHEEL.x, midY, WHEEL.z, 0, 1);
      const k2 = clamp(g.t / PLACE_SECS, 0, 1);
      const e = smooth01(k2);
      if (g.t < PLACE_SECS) {
        rig.clay.position.lerpVectors(g.from, g.to, e);
        rig.clay.position.y += Math.sin(Math.PI * e) * 0.45;
        const sc = 1 + (SHELF_SCALE - 1) * e;
        rig.clay.scale.setScalar(sc);
        let dy = Math.PI - g.fromYaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        rig.clay.rotation.y = g.fromYaw + dy * e;
      } else {
        // settle: a small damped bounce with a little squash
        const t2 = g.t - PLACE_SECS;
        const damp = Math.exp(-9 * t2);
        rig.clay.position.copy(g.to);
        rig.clay.position.y += reducedMotion ? 0 : 0.05 * damp * Math.abs(Math.cos(t2 * 17));
        rig.clay.scale.set(SHELF_SCALE * (1 + 0.06 * damp * Math.sin(t2 * 17)), SHELF_SCALE * (1 - 0.1 * damp * Math.sin(t2 * 17)), SHELF_SCALE * (1 + 0.06 * damp * Math.sin(t2 * 17)));
        api.commit(); // the shelf mesh now holds this pot (the moving copy covers the rebuild); a no-op after the first call
        if (t2 >= SETTLE_SECS) {
          const celebrate = g.master;
          g.master = false;
          api.resetLump(); // a fresh lump rises on the wheel
          if (celebrate && !reducedMotion) P.confetti(WHEEL.x, WHEEL.headY + 0.5, WHEEL.z, 110);
        }
      }
    }

    // sprites: advance + hide when idle
    P.step(dt);
    if (g.phase !== "firing" && g.phase !== "cooling") P.glow(WHEEL.x, midY, WHEEL.z, 0, 1);
  });

  return null; // the HUD lives in the Overlay's dock (PotteryHudHost)
}
