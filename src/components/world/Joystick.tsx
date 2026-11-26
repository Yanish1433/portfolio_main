"use client";

import { useRef, useState } from "react";
import { joystick } from "./input";

const BASE = 120;
const KNOB = 52;
const MAX = (BASE - KNOB) / 2 + 6;

/** On-screen joystick. Only visible on touch-first devices (pointer: coarse). */
export default function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (clientX: number, clientY: number) => {
    const rect = base.current!.getBoundingClientRect();
    let dx = clientX - (rect.left + rect.width / 2);
    let dy = clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > MAX) {
      dx = (dx / len) * MAX;
      dy = (dy / len) * MAX;
    }
    setKnob({ x: dx, y: dy });
    joystick.x = dx / MAX;
    joystick.y = dy / MAX;
  };

  const reset = () => {
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    joystick.x = 0;
    joystick.y = 0;
  };

  return (
    <div
      className="pointer-events-none absolute bottom-0 left-0 hidden p-6 [@media(pointer:coarse)]:block"
      style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
    >
      <div
        ref={base}
        role="application"
        aria-label="Movement joystick"
        className="pointer-events-auto relative rounded-full border border-white/60 bg-white/25 backdrop-blur-sm"
        style={{ width: BASE, height: BASE, touchAction: "none" }}
        onPointerDown={(e) => {
          if (pointer.current !== null) return;
          pointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          update(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.pointerId === pointer.current) update(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (e.pointerId === pointer.current) reset();
        }}
        onPointerCancel={(e) => {
          if (e.pointerId === pointer.current) reset();
        }}
      >
        <div
          className="absolute rounded-full bg-white/80 shadow-md"
          style={{
            width: KNOB,
            height: KNOB,
            left: (BASE - KNOB) / 2,
            top: (BASE - KNOB) / 2,
            transform: `translate(${knob.x}px, ${knob.y}px)`,
          }}
        />
      </div>
    </div>
  );
}
