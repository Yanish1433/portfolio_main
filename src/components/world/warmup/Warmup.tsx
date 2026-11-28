"use client";

// Replaces the old "3 frames then loaded" gate: compile every shader program of the scene while the
// loading screen is still up (renderer.compileAsync, gl.compile fallback), capped at ~1 s, then draw a few
// stable frames and only then flip `loaded` (which drops the overlay and starts the fly-in).
// step21a: it also waits for the program count to settle, re-compiles whatever mounted late (the avatar's skinned
// materials) and pre-uploads every material texture (renderer.initTexture), so nothing links or uploads mid fly-in.
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useWorld } from "@/store/world";
import * as THREE from "three";
import { prewarmDance } from "../dance/danceFx";
import { prewarmPottery } from "../pottery/potteryWarm";
import { warmupReady } from "./gate";

/**
 * The scene is drawn through the post-processing composer (a render target = linear output) unless bloom is off
 * (phones, ?bloom=off): a program compiled against the screen has a different key (sRGB output) and is never reused,
 * so warm-up compiles against a throw-away render target in the composer case. This halves the warm-up compile.
 */
function usesComposer(): boolean {
  if (typeof window === "undefined") return true;
  return !(window.matchMedia("(pointer: coarse)").matches || new URLSearchParams(window.location.search).get("bloom") === "off");
}

export default function Warmup({ characters = [] }: { characters?: string[] }) {
  const wantAvatar = characters.includes("lakhey");
  const spawned = useRef(false);
  const { gl, scene, camera } = useThree();
  const compiled = useRef(false);
  const t0 = useRef(performance.now());
  const frames = useRef(0);
  const done = useRef(false);
  const progs = useRef({ n: -1, stable: 0 });
  const avatar = useRef(false);
  const seen = useRef(new WeakSet<object>());
  const rt = useRef<THREE.WebGLRenderTarget | null>(null);
  const avatarCompiled = useRef(false);
  const dancePrewarmed = useRef(false);

  // Lakhey normally spawns when CharacterInit sees `loaded`, so his GLB, textures and skinned shaders used to load 2 s
  // INTO the fly-in. Spawn him now, behind the loading screen (no spawn dance yet: that is bumped with `loaded`).
  useEffect(() => {
    const w = useWorld.getState();
    if (wantAvatar && !w.character) {
      spawned.current = true;
      useWorld.setState({ character: "lakhey", pickerOpen: false });
    }
  }, [wantAvatar]);

  useEffect(() => {
    let alive = true;
    const finish = () => {
      if (alive) compiled.current = true;
    };
    const g = gl as unknown as THREE.WebGLRenderer;
    if (usesComposer()) rt.current = new THREE.WebGLRenderTarget(4, 4);
    const prev = g.getRenderTarget();
    try {
      g.setRenderTarget(rt.current);
      const r = gl as unknown as { compileAsync?: (s: unknown, c: unknown) => Promise<unknown> };
      if (r.compileAsync) r.compileAsync(scene, camera).then(finish, finish);
      else {
        gl.compile(scene, camera);
        finish();
      }
    } catch {
      finish();
    } finally {
      g.setRenderTarget(prev);
    }
    return () => {
      alive = false;
      rt.current?.dispose();
      rt.current = null;
    };
  }, [gl, scene, camera]);

  useFrame(() => {
    if (done.current) return;
    frames.current++;
    // Re-compile what mounted since the last look (hidden behind the loading screen) and pre-upload new textures.
    const g = gl as unknown as THREE.WebGLRenderer;
    const n = g.info.programs?.length ?? 0;
    if (frames.current % 4 === 1) {
      const prev = g.getRenderTarget();
      try {
        scene.traverse((o) => {
          // Lakhey's skinned body (other skinned meshes, e.g. the robot, don't count)
          if ((o as THREE.SkinnedMesh).isSkinnedMesh && [(o as THREE.Mesh).material].flat().some((m) => m?.name === "Skin")) avatar.current = true;
        });
        g.setRenderTarget(rt.current);
        g.compile(scene, camera);
        if (avatar.current) {
          avatarCompiled.current = true; // a compile ran with the avatar already in the scene
          if (!dancePrewarmed.current) {
            dancePrewarmed.current = true;
            prewarmDance(g, scene, camera); // flag, pole, aura and sparks: same (composer) variant as the real draw
            prewarmPottery(g, scene, camera); // step22: the pottery game's clay + sprite shaders (hidden until "Make a pot")
          }
        }
        scene.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
            for (const v of Object.values(mat as unknown as Record<string, unknown>)) {
              const tex = v as THREE.Texture | null;
              if (tex && (tex as THREE.Texture).isTexture && !seen.current.has(tex) && (tex as THREE.Texture).image) {
                seen.current.add(tex);
                g.initTexture(tex);
              }
            }
          }
        });
      } catch {
        /* a failed warm-up step never blocks the world */
      } finally {
        g.setRenderTarget(prev);
      }
    }
    const pg = progs.current;
    const n2 = g.info.programs?.length ?? n;
    if (n2 !== pg.n) {
      pg.n = n2;
      pg.stable = 0;
    } else pg.stable++;
    if (warmupReady({ compiled: compiled.current, elapsedMs: performance.now() - t0.current, frames: frames.current, stableFrames: progs.current.stable, avatarReady: !wantAvatar || avatarCompiled.current })) {
      done.current = true;
      useWorld.getState().setLoaded(true);
      if (spawned.current) useWorld.setState((w) => ({ spawnSeq: w.spawnSeq + 1 })); // the first-visit spawn dance, as CharacterInit used to start it
    }
  });
  return null;
}
