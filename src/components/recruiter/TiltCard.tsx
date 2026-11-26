"use client";

import { useEffect, useRef } from "react";
import styles from "./recruiter.module.css";

/**
 * Wraps card content. On hover-capable devices (and no reduced motion) the card
 * tilts in 3D following the pointer, and any <video> inside plays while hovered.
 */
export function TiltCard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const video = el.querySelector("video");
    const canHover = window.matchMedia("(hover: hover)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!canHover) return;

    let raf = 0;
    const play = () => {
      if (video && !reduced) video.play().catch(() => {});
    };
    const pause = () => {
      if (video) {
        video.pause();
        video.currentTime = 0;
      }
    };
    const onMove = (e: PointerEvent) => {
      if (reduced) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty("--ry", `${(px * 14).toFixed(2)}deg`);
        el.style.setProperty("--rx", `${(-py * 12).toFixed(2)}deg`);
        el.style.setProperty("--gx", `${((px + 0.5) * 100).toFixed(1)}%`);
        el.style.setProperty("--gy", `${((py + 0.5) * 100).toFixed(1)}%`);
      });
    };
    const onEnter = () => {
      el.dataset.tilting = "true";
      play();
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      delete el.dataset.tilting;
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
      pause();
    };

    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("focusin", play);
    el.addEventListener("focusout", pause);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("focusin", play);
      el.removeEventListener("focusout", pause);
    };
  }, []);

  return (
    <article ref={ref} className={styles.card}>
      {children}
    </article>
  );
}
