"use client";

import { useEffect, useRef } from "react";
import styles from "./recruiter.module.css";

type P = { x: number; y: number; vx: number; vy: number; r: number };

const MAX_PARTICLES = 70;

/** Lightweight 2D canvas particles: drift + gentle cursor reaction. */
export function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const readColor = () =>
      getComputedStyle(canvas).getPropertyValue("--particle").trim() || "#46f0c8";
    let accent = readColor();

    let w = 0;
    let h = 0;
    let particles: P[] = [];
    let raf = 0;
    let visible = true;
    let running = false;
    const mouse = { x: -9999, y: -9999 };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = accent;
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.55;
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.lineWidth = 0.6;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 110) {
            ctx.globalAlpha = (1 - d / 110) * 0.18;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(MAX_PARTICLES, Math.round((w * h) / 14000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.6 + 0.6,
      }));
      draw();
    };

    const step = () => {
      for (const p of particles) {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 150 * 150 && d2 > 1) {
          const d = Math.sqrt(d2);
          const f = (1 - d / 150) * 0.05;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
        p.vx *= 0.99;
        p.vy *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;
      }
      draw();
      raf = requestAnimationFrame(step);
    };

    const start = () => {
      if (reduced || running || !visible || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(step);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const onLeave = () => {
      mouse.x = mouse.y = -9999;
    };
    // Theme switch: re-read the colour and repaint once. The loop is never restarted.
    const onTheme = () => {
      accent = readColor();
      draw();
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    const ro = new ResizeObserver(resize);

    const init = () => {
      accent = readColor();
      resize();
      ro.observe(canvas);
      io.observe(canvas);
      window.addEventListener("themechange", onTheme);
      if (!reduced) {
        window.addEventListener("pointermove", onMove, { passive: true });
        document.addEventListener("pointerleave", onLeave);
        document.addEventListener("visibilitychange", onVisibility);
        start();
      }
    };

    const usesIdle = "requestIdleCallback" in window;
    const idle = usesIdle
      ? window.requestIdleCallback(init)
      : window.setTimeout(init, 50);

    return () => {
      if (usesIdle) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      stop();
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("themechange", onTheme);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.particles} aria-hidden="true" />;
}
