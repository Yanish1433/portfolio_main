"use client";

import { useEffect, useRef } from "react";
import { BOOK_VIDEO_EVENT } from "@/components/recruiter/book/active";
import s from "./landing.module.css";

const SRC = { day: "/recruiter/pagoda-day.mp4", night: "/recruiter/pagoda-night.mp4" } as const;

/**
 * The dim pagoda behind everything. The poster is plain CSS (the matching one downloads); ONE <video> is added only on
 * desktop width, no reduced motion, no Save-Data, after load + idle. It pauses when hidden or while the door preview plays.
 */
export function PagodaBg() {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const b = box.current;
    const v = video.current;
    if (!b || !v) return;
    const mq = (q: string) => window.matchMedia(q).matches;
    if (!mq("(min-width: 901px)") || mq("(prefers-reduced-motion: reduce)")) return;
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    const wrap = b.closest<HTMLElement>("[data-time-root]");
    let alive = true;
    let started = false;
    let doorPlaying = false;
    let current = "";
    const sync = () => {
      if (started && !document.hidden && !doorPlaying) void v.play().catch(() => {});
      else v.pause();
    };
    const load = () => {
      const m = wrap?.dataset.theme === "night" ? "night" : "day";
      if (m === current) return;
      current = m;
      v.dataset.on = "false";
      v.src = SRC[m];
      v.load();
      sync();
    };
    const start = () => {
      if (!alive) return;
      started = true;
      load();
    };
    const onDoor = (e: Event) => {
      doorPlaying = (e as CustomEvent<boolean>).detail === true;
      sync();
    };
    const onTime = () => started && load();
    const onPlaying = () => (v.dataset.on = "true");
    const after = () => {
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (idle) idle(start, { timeout: 2500 });
      else window.setTimeout(start, 600);
    };
    v.addEventListener("playing", onPlaying);
    window.addEventListener("world-time", onTime);
    window.addEventListener(BOOK_VIDEO_EVENT, onDoor);
    document.addEventListener("visibilitychange", sync);
    if (document.readyState === "complete") after();
    else window.addEventListener("load", after, { once: true });
    return () => {
      alive = false;
      v.removeEventListener("playing", onPlaying);
      window.removeEventListener("world-time", onTime);
      window.removeEventListener(BOOK_VIDEO_EVENT, onDoor);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("load", after);
      v.pause();
      v.removeAttribute("src");
      v.load();
    };
  }, []);
  return (
    <div ref={box} className={s.bg} aria-hidden="true">
      <video ref={video} className={s.bgVideo} data-on="false" muted loop playsInline preload="none" tabIndex={-1} />
      <div className={s.bgShade} />
    </div>
  );
}
