"use client";

import { useEffect, useRef } from "react";
import styles from "./recruiter.module.css";
import { BOOK_VIDEO_EVENT } from "./book/active";

const SRC = { day: "/recruiter/pagoda-day.mp4", night: "/recruiter/pagoda-night.mp4" } as const;

type NetInfo = { connection?: { saveData?: boolean } };

/**
 * The pagoda behind the book, dimmed: the poster (pure CSS, per theme, see .pagodaBg) is what paints first.
 * This component adds ONE <video> on top, only when it is worth it:
 * desktop width, no reduced motion, no Save-Data. It starts after window load + idle, pauses
 * when it is off-screen, the tab is hidden or a project video plays on the open page (one video at a time),
 * and swaps `src` (never two decoders) when the clock crosses dusk or dawn.
 */
export function PagodaHero() {
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const box = root.current;
    const v = video.current;
    if (!box || !v) return;
    const wrap = box.closest<HTMLElement>("[data-time-root]");
    const mq = (q: string) => window.matchMedia(q).matches;
    if (!mq("(min-width: 641px)") || mq("(prefers-reduced-motion: reduce)")) return;
    if ((navigator as Navigator & NetInfo).connection?.saveData) return;

    let alive = true;
    let started = false;
    let visible = true;
    let projectPlaying = false;
    const mode = () => (wrap?.dataset.theme === "night" ? "night" : "day");
    let current: "day" | "night" | null = null;

    const sync = () => {
      if (!started) return;
      if (visible && !document.hidden && !projectPlaying) void v.play().catch(() => {});
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
    const onTime = () => {
      if (started) load();
    };
    const onProject = (e: Event) => {
      projectPlaying = (e as CustomEvent<boolean>).detail === true;
      sync();
    };

    const start = () => {
      if (!alive) return;
      started = true;
      load();
    };
    const afterLoad = () => {
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (idle) idle(start, { timeout: 2500 });
      else window.setTimeout(start, 600);
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      sync();
    });
    io.observe(box);
    v.addEventListener("playing", onPlaying);
    window.addEventListener("world-time", onTime);
    window.addEventListener(BOOK_VIDEO_EVENT, onProject);
    document.addEventListener("visibilitychange", sync);
    if (document.readyState === "complete") afterLoad();
    else window.addEventListener("load", afterLoad, { once: true });

    return () => {
      alive = false;
      io.disconnect();
      v.removeEventListener("playing", onPlaying);
      window.removeEventListener("world-time", onTime);
      window.removeEventListener(BOOK_VIDEO_EVENT, onProject);
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
