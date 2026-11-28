"use client";

// step23: floating joystick. It appears where the left thumb lands in the bottom-left zone (routeTouch decides), the knob
// follows through a ref-driven CSS transform (no React renders while dragging) and writes the shared `joystick` vector.
// Claimed pointers are stopped in the window capture phase, so the canvas (tap-to-walk, orbit, R3F object clicks) never sees them.
import { useEffect, useRef, useState } from "react";
import { joystick } from "./input";
import { JOY_RADIUS, JOY_ZONE, joyVector, routeTouch } from "./touchControls";
import { useWorld } from "@/store/world";

const BASE = JOY_RADIUS * 2;
const KNOB = 52;
const MARGIN = 14;
const HINT_KEY = "world-joy-hint";

const buzz = (ms: number) => {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(ms);
  } catch {
    /* not allowed (no user activation / iOS has none) */
  }
};

/** On-screen joystick. Only active on touch-first devices (pointer: coarse). */
export default function Joystick() {
  const root = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState(false);
  const ready = useWorld((s) => s.loaded && !!s.character && !s.pickerOpen);

  // "Drag to walk": once per session, until the first use or a few seconds.
  useEffect(() => {
    if (!ready || !window.matchMedia("(pointer: coarse)").matches) return;
    try {
      if (window.sessionStorage.getItem(HINT_KEY)) return;
      window.sessionStorage.setItem(HINT_KEY, "1");
    } catch {
      /* storage blocked: the hint just shows again next load */
    }
    setHint(true);
    const t = window.setTimeout(() => setHint(false), 9000);
    return () => window.clearTimeout(t);
  }, [ready]);

  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const base = root.current;
    const k = knob.current;
    if (!base || !k) return;
    let active: number | null = null;
    let ox = 0;
    let oy = 0;
    const touches = new Set<number>();

    const show = (on: boolean) => {
      base.dataset.on = on ? "1" : "";
    };
    const stop = (e: Event) => {
      e.stopPropagation();
    };
    const move = (cx: number, cy: number) => {
      const o = joyVector(cx - ox, cy - oy);
      k.style.transform = `translate(${o.kx}px, ${o.ky}px)`;
      joystick.x = o.x;
      joystick.y = o.y;
    };
    const end = () => {
      active = null;
      joystick.x = 0;
      joystick.y = 0;
      k.style.transform = "translate(0px, 0px)";
      show(false);
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const others = touches.size - (active !== null && touches.has(active) ? 1 : 0);
      touches.add(e.pointerId);
      // only a press on the 3D canvas can start the stick; buttons and panels keep their own taps
      if (!(e.target instanceof HTMLCanvasElement)) return;
      const route = routeTouch({ x: e.clientX, y: e.clientY }, others + 1, window.innerWidth, window.innerHeight, JOY_ZONE, active !== null);
      if (route !== "joystick") return;
      active = e.pointerId;
      ox = Math.min(Math.max(e.clientX, JOY_RADIUS + MARGIN), window.innerWidth * JOY_ZONE.w);
      oy = Math.min(Math.max(e.clientY, JOY_RADIUS + MARGIN), window.innerHeight - JOY_RADIUS - MARGIN);
      base.style.left = `${ox - JOY_RADIUS}px`;
      base.style.top = `${oy - JOY_RADIUS}px`;
      show(true);
      setHint(false);
      buzz(8);
      move(e.clientX, e.clientY);
      stop(e);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== active) return;
      move(e.clientX, e.clientY);
      stop(e);
    };
    const onUp = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      if (e.pointerId !== active) return;
      end();
      stop(e);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      end();
    };
  }, []);

  return (
    <div className="pointer-events-none hidden [@media(pointer:coarse)]:block" aria-hidden="true">
      {/* the floating stick: moved under the thumb with left/top, invisible until a touch starts */}
      <div
        ref={root}
        data-joystick
        className="fixed z-20 hidden rounded-full border-2 border-white/60 bg-white/20 shadow-lg backdrop-blur-sm data-[on=1]:block"
        style={{ width: BASE, height: BASE, touchAction: "none" }}
      >
        <div
          ref={knob}
          className="absolute rounded-full bg-white/85 shadow-md"
          style={{ width: KNOB, height: KNOB, left: (BASE - KNOB) / 2, top: (BASE - KNOB) / 2 }}
        />
      </div>
      {/* first-time hint ring, where the thumb rests */}
      <div
        data-joy-hint
        className={`fixed z-20 flex flex-col items-center gap-1 transition-opacity duration-500 ${hint ? "opacity-100" : "opacity-0"}`}
        style={{ left: "max(16px, env(safe-area-inset-left))", bottom: "calc(150px + env(safe-area-inset-bottom))", width: 100 }}
      >
        <div className="h-[84px] w-[84px] animate-pulse rounded-full border-2 border-dashed border-white/80 bg-white/15" />
        <span className="rounded-md bg-[#3e2416]/85 px-2 py-0.5 text-sm font-semibold text-[#fbe9b7]">Drag to walk</span>
      </div>
    </div>
  );
}
