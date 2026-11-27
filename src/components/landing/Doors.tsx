"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { MouseEvent } from "react";
import { BOOK_VIDEO_EVENT } from "@/components/recruiter/book/active";
import { todAt } from "@/lib/time/clock";
import { RECRUITER_HREF, WORLD_HREF } from "./routes";
import s from "./landing.module.css";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const plain = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
const VIDEO = { day: "/recruiter/pagoda-day.mp4", night: "/recruiter/pagoda-night.mp4" } as const;

/** Door 1: the town. Hover plays the loop (desktop only); click zooms the card, then goes. */
export function ExploreDoor() {
  const router = useRouter();
  const card = useRef<HTMLAnchorElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const fade = useRef<HTMLSpanElement>(null);

  // The still overview follows the shared clock: when the time-of-day band changes, the old picture fades out.
  useEffect(() => {
    let last = card.current?.closest<HTMLElement>("[data-time-root]")?.dataset.tod;
    const onTime = (e: Event) => {
      const next = todAt((e as CustomEvent<number>).detail);
      const f = fade.current;
      if (f && last && next !== last && !reduced()) {
        f.style.transition = "none";
        f.dataset.from = last;
        f.style.opacity = "1";
        void f.offsetWidth;
        f.style.transition = "opacity 0.7s ease";
        f.style.opacity = "0";
      }
      last = next;
    };
    window.addEventListener("world-time", onTime);
    return () => window.removeEventListener("world-time", onTime);
  }, []);

  const canPlay = () =>
    window.matchMedia("(min-width: 901px) and (hover: hover)").matches &&
    !reduced() &&
    !(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;

  const enter = () => {
    router.prefetch(WORLD_HREF);
    const v = video.current;
    if (!v || !canPlay()) return;
    const night = card.current?.closest<HTMLElement>("[data-time-root]")?.dataset.theme === "night";
    const src = VIDEO[night ? "night" : "day"];
    if (!v.getAttribute("src")?.endsWith(src)) v.src = src; // loaded on the first hover only
    window.dispatchEvent(new CustomEvent(BOOK_VIDEO_EVENT, { detail: true })); // pause the backdrop: one decoder at a time
    void v.play().catch(() => {});
  };
  const leave = () => {
    video.current?.pause();
    window.dispatchEvent(new CustomEvent(BOOK_VIDEO_EVENT, { detail: false }));
  };
  const go = (e: MouseEvent) => {
    if (!plain(e) || reduced()) return;
    e.preventDefault();
    card.current?.setAttribute("data-go", "true");
    window.setTimeout(() => router.push(WORLD_HREF), 420);
  };

  return (
    <Link
      ref={card}
      href={WORLD_HREF}
      prefetch={false}
      className={`${s.door} ${s.doorWorld}`}
      onPointerEnter={enter}
      onPointerLeave={leave}
      onFocus={() => router.prefetch(WORLD_HREF)}
      onTouchStart={() => router.prefetch(WORLD_HREF)}
      onClick={go}
    >
      <span className={s.preview} role="img" aria-label="Overview of the 3D Bhaktapur town">
        <span ref={fade} className={s.fade} aria-hidden="true" />
        <video aria-hidden="true" ref={video} muted loop playsInline preload="none" tabIndex={-1} />
      </span>
      <span className={s.doorTitle}>Explore my 3D world</span>
      <span className={s.doorMeta}>~3 min · fun</span>
    </Link>
  );
}

/** Door 2: the book. Hover lifts a page corner; click swings the cover open (0.6 s), then goes. */
export function ReadDoor() {
  const router = useRouter();
  const card = useRef<HTMLAnchorElement>(null);
  const go = (e: MouseEvent) => {
    if (!plain(e)) return;
    e.preventDefault();
    const leaveNow = () => {
      try {
        sessionStorage.setItem("book-cover", "1");
      } catch {
        /* private mode: the book simply opens with its own cover */
      }
      router.push(RECRUITER_HREF);
    };
    if (reduced()) return leaveNow();
    card.current?.setAttribute("data-open", "true");
    window.setTimeout(leaveNow, 600);
  };
  return (
    <Link ref={card} href={RECRUITER_HREF} className={`${s.door} ${s.doorBook}`} onPointerEnter={() => router.prefetch(RECRUITER_HREF)} onClick={go}>
      <span className={s.book} aria-hidden="true">
        <span className={s.inside}>
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className={s.cover}>
          <span className={s.coverGlyph}>नमस्ते</span>
        </span>
        <span className={s.lift} />
      </span>
      <span className={s.doorTitle}>Too busy? Read it fast</span>
      <span className={s.doorMeta}>1 min</span>
    </Link>
  );
}
