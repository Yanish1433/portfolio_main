"use client";

import { useEffect, useRef } from "react";
import styles from "./recruiter.module.css";

const SRC = { light: "/recruiter/pagoda-day.mp4", dark: "/recruiter/pagoda-night.mp4" } as const;
const THEME_EVENT = "themechange"; // same string as THEME_EVENT in theme.ts (kept local so this file stays tiny)

type NetInfo = { connection?: { saveData?: boolean } };

/**
 * Hero background: the poster (pure CSS, per theme, see .pagodaBg) is what paints first.
 * This component adds ONE <video> on top, only when it is worth it:
 * desktop width, no reduced motion, no Save-Data. It starts after window load + idle, pauses
 * when the hero is off-screen or the tab is hidden, and swaps `src` (never two decoders) on a theme change.
 */
export function PagodaHero() {
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const box = root.current;
    const v = video.current;
    if (!box || !v) return;
    const wrap = box.closest<HTMLElement>("[data-recruiter-root]");
    const mq = (q: string) => window.matchMedia(q).matches;
    if (!mq("(min-width: 641px)") || mq("(prefers-reduced-motion: reduce)")) return;
    if ((navigator as Navigator & NetInfo).connection?.saveData) return;

    let alive = true;
    let started = false;
    let visible = true;
    const mode = () => (wrap?.dataset.theme === "dark" ? "dark" : "light");
    let current: "light" | "dark" | null = null;

    const sync = () => {
      if (!started) return;
      if (visible && !document.hidden) void v.play().catch(() => {});
      else v.pause();
    };
    const load = () => {
      const m = mode();
      if (m === current) return;
      current = m;
      v.dataset.on = "false"; // fade out over the poster, then swap
      v.src = SRC[m];
      v.load();
      sync();
    };
    const onPlaying = () => {
      v.dataset.on = "true";
    };
    const onTheme = () => {
      if (started) load();
    };

    const start = () => {
      if (!alive) return;
      started = true;
      load();
    };
    const afterLoad = () => {
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
        .requestIdleCallback;
      if (idle) idle(start, { timeout: 2500 });
      else window.setTimeout(start, 600);
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      sync();
    });
    io.observe(box);
    v.addEventListener("playing", onPlaying);
    window.addEventListener(THEME_EVENT, onTheme);
    document.addEventListener("visibilitychange", sync);
    if (document.readyState === "complete") afterLoad();
    else window.addEventListener("load", afterLoad, { once: true });

    return () => {
      alive = false;
      io.disconnect();
      v.removeEventListener("playing", onPlaying);
      window.removeEventListener(THEME_EVENT, onTheme);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("load", afterLoad);
      v.pause();
      v.removeAttribute("src");
      v.load();
    };
  }, []);

  return (
    <div ref={root} className={styles.pagodaBg} aria-hidden="true">
      <video ref={video} className={styles.pagodaVideo} data-on="false" muted loop playsInline preload="none" tabIndex={-1} />
      <div className={styles.pagodaShade} />
    </div>
  );
}
