"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Wraps the hero and publishes two CSS variables for the scenery: --mx (pointer, -1..1) and
 * --sy (scroll in px, capped). One requestAnimationFrame per change, nothing when idle.
 * Does nothing at all under prefers-reduced-motion.
 */
export function Parallax({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let mx = 0;
    let tx = 0;
    let sy = -1;
    let raf = 0;

    const frame = () => {
      raf = 0;
      mx += (tx - mx) * 0.12;
      const y = Math.min(window.scrollY, 900);
      if (y !== sy) {
        sy = y;
        el.style.setProperty("--sy", String(y));
      }
      el.style.setProperty("--mx", mx.toFixed(3));
      if (Math.abs(tx - mx) > 0.002) raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      kick();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", kick, { passive: true });
    kick();
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", kick);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <header ref={ref} className={className}>
      {children}
    </header>
  );
}
