"use client";

// Cinema mode, the 3D half: when a case study opens, the camera eases from the follow view into
// the stand's screen (~0.8 s, GSAP), then the HTML overlay (CinemaMode.tsx) fades in and the
// render loop stops (frameloop "never") to save battery. On close the loop restarts and the
// camera flies back onto the live follow pose (camRig), then hands control back to the Player.
// Reduced motion: no flight; it opens and closes instantly.
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import * as THREE from "three";
import { useWorld } from "@/store/world";
import { camRig } from "../input";
import { screenOf } from "./layout";
import { screenPose } from "./showcaseView";

const FLY_IN_S = 0.8;
const FLY_BACK_S = 0.7;

type V3 = [number, number, number];
type Flight = {
  kind: "in" | "back";
  p: number;
  fromPos: V3;
  fromLook: V3;
  /** Fly-in target (fly-back aims at the live camRig instead). */
  toPos: V3;
  toLook: V3;
  /** performance.now() at the start, and the duration (ms). */
  start: number;
  dur: number;
  /** Called once when the flight lands. */
  done: () => void;
};

/**
 * GSAP's ease, applied to real elapsed time in useFrame. (A gsap.to() tween slows to a crawl on a
 * device rendering a few frames a second: GSAP's lag smoothing counts each long frame as 33 ms.)
 */
const ease = gsap.parseEase("power2.inOut");

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const _look = new THREE.Vector3();

export default function CinemaCamera({ reducedMotion }: { reducedMotion: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const setFrameloop = useThree((s) => s.setFrameloop);
  const size = useThree((s) => s.size);
  const flight = useRef<Flight | null>(null);
  /** Where the camera is looking right now (lookAt target), so a flight starts without a jump. */
  const look = useRef<V3>([camRig.look.x, camRig.look.y, camRig.look.z]);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  useEffect(() => {
    const stop = () => {
      flight.current = null;
    };
    const pauseSoon = () => {
      // let one more frame draw the final pose, then stop rendering while the overlay covers the scene
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (useWorld.getState().cinemaReady) setFrameloop("never");
        }),
      );
    };
    const unsub = useWorld.subscribe((s, prev) => {
      if (s.cinema && s.cinema !== prev.cinema) {
        stop();
        const screen = screenOf(s.cinema);
        if (reducedMotion || !screen) {
          useWorld.getState().setCinemaReady(true);
          pauseSoon();
          return;
        }
        setFrameloop("always");
        const { width, height } = sizeRef.current;
        const to = screenPose(screen, camera.fov, width / Math.max(1, height), 1.0);
        const f: Flight = {
          kind: "in",
          p: 0,
          fromPos: [camera.position.x, camera.position.y, camera.position.z],
          fromLook: [...look.current],
          toPos: to.pos,
          toLook: to.look,
          start: performance.now(),
          dur: FLY_IN_S * 1000,
          done: () => {
            if (useWorld.getState().cinema !== s.cinema) return;
            useWorld.getState().setCinemaReady(true);
            pauseSoon();
          },
        };
        flight.current = f;
      } else if (!s.cinema && prev.cinema) {
        stop();
        setFrameloop("always");
        if (reducedMotion) {
          useWorld.getState().setCameraMode("follow");
          return;
        }
        const f: Flight = {
          kind: "back",
          p: 0,
          fromPos: [camera.position.x, camera.position.y, camera.position.z],
          fromLook: [...look.current],
          toPos: [0, 0, 0],
          toLook: [0, 0, 0],
          start: performance.now(),
          dur: FLY_BACK_S * 1000,
          done: () => {
            if (!useWorld.getState().cinema) useWorld.getState().setCameraMode("follow");
          },
        };
        flight.current = f;
      }
    });
    return () => {
      unsub();
      stop();
      setFrameloop("always");
    };
  }, [camera, reducedMotion, setFrameloop]);

  // Move the camera along the flight. Negative priority (a positive one would switch off R3F's
  // automatic rendering); the Player skips the camera while cameraMode isn't "follow", and the
  // fly-back reads last frame's camRig, which is fine.
  useFrame(() => {
    const f = flight.current;
    const mode = useWorld.getState().cameraMode;
    if (!f) {
      if (mode === "follow") look.current = [camRig.look.x, camRig.look.y, camRig.look.z];
      return;
    }
    const toPos: V3 = f.kind === "back" ? [camRig.pos.x, camRig.pos.y, camRig.pos.z] : f.toPos;
    const toLook: V3 = f.kind === "back" ? [camRig.look.x, camRig.look.y, camRig.look.z] : f.toLook;
    const raw = Math.min(1, (performance.now() - f.start) / f.dur);
    const t = (f.p = ease(raw));
    camera.position.set(lerp(f.fromPos[0], toPos[0], t), lerp(f.fromPos[1], toPos[1], t), lerp(f.fromPos[2], toPos[2], t));
    look.current = [lerp(f.fromLook[0], toLook[0], t), lerp(f.fromLook[1], toLook[1], t), lerp(f.fromLook[2], toLook[2], t)];
    camera.lookAt(_look.set(...look.current));
    if (raw >= 1) {
      flight.current = null;
      f.done();
    }
  }, -1);

  return null;
}
