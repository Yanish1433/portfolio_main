"use client";

// Replaces the old "3 frames then loaded" gate: compile every shader program of the scene while the
// loading screen is still up (renderer.compileAsync, gl.compile fallback), capped at ~1 s, then draw a few
// stable frames and only then flip `loaded` (which drops the overlay and starts the fly-in).
// Lazily mounted things (dance flag, weather, guestbook) still compile on first use: out of scope.
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useWorld } from "@/store/world";
import { warmupReady } from "./gate";

export default function Warmup() {
  const { gl, scene, camera } = useThree();
  const compiled = useRef(false);
  const t0 = useRef(performance.now());
  const frames = useRef(0);
  const done = useRef(false);

  useEffect(() => {
    let alive = true;
    const finish = () => {
      if (alive) compiled.current = true;
    };
    try {
      const r = gl as unknown as { compileAsync?: (s: unknown, c: unknown) => Promise<unknown> };
      if (r.compileAsync) r.compileAsync(scene, camera).then(finish, finish);
      else {
        gl.compile(scene, camera);
        finish();
      }
    } catch {
      finish();
    }
    return () => {
      alive = false;
    };
  }, [gl, scene, camera]);

  useFrame(() => {
    if (done.current) return;
    frames.current++;
    if (warmupReady({ compiled: compiled.current, elapsedMs: performance.now() - t0.current, frames: frames.current })) {
      done.current = true;
      useWorld.getState().setLoaded(true);
    }
  });
  return null;
}
