"use client";

// The one full-screen project player, shared by the 3D town (CinemaMode.tsx) and Recruiter Mode.
// - Plays the project's demo.mp4 (muted autoplay + controls, poster first). No video: the poster /
//   screenshots as a small carousel instead.
// - Name + one line, "Live site" / "Code" (real links only), the project's disclaimer.
// - role="dialog" + aria-modal, focus trap, Esc / the close button call onClose, focus returns to
//   whatever opened it. Any other <video> on the page is paused while it is open.
// Pure: no store, no content imports (so Recruiter Mode loads it lazily without the 3D bundle).
import { useEffect, useId, useRef, useState } from "react";
import { btnClass, cardClass, pillClass, wellClass } from "../ui/lokta";
import { isRealLink } from "@/components/recruiter/links";

export type VideoProject = {
  id: string;
  name: string;
  tagline: string;
  disclaimer?: string | null;
  video: string | null;
  poster: string | null;
  screenshots: string[];
  liveUrl: string | null;
  repoUrl: string | null;
  accent: string;
};

const FOCUSABLE = 'a[href], button:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';

const btn = (primary: boolean) => (primary ? btnClass(true) : pillClass("!min-h-10 !px-5 !py-2.5 !text-[15px]"));

function ExtLink({ href, label, primary }: { href: string | null; label: string; primary?: boolean }) {
  if (!href || !isRealLink(href)) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={btn(!!primary)}>
      {label}
      <span aria-hidden="true">↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function Stills({ p }: { p: VideoProject }) {
  const slides = [...(p.poster ? [p.poster] : []), ...p.screenshots.filter((s) => s && s.trim())];
  const [i, setI] = useState(0);
  const many = slides.length > 1;
  const go = (d: number) => setI((k) => (k + d + slides.length) % slides.length);
  if (!slides.length) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center text-[#fff4dc]" style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${p.accent} 45%, #1a0f0a), #120b08)` }}>
        <p className="text-3xl font-semibold sm:text-5xl">{p.name}</p>
        <p className="max-w-xl opacity-85">{p.tagline}</p>
      </div>
    );
  }
  return (
    <div className="relative h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={slides[i]} src={slides[i]} alt={`${p.name} screenshot${many ? ` ${i + 1} of ${slides.length}` : ""}`} className="h-full w-full object-contain" />
      {many && (
        <>
          <button type="button" onClick={() => go(-1)} aria-label="Previous" className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-xl text-white transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]">
            <span aria-hidden="true">‹</span>
          </button>
          <button type="button" onClick={() => go(1)} aria-label="Next" className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-xl text-white transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]">
            <span aria-hidden="true">›</span>
          </button>
        </>
      )}
    </div>
  );
}

export default function ProjectVideo({ project: p, onClose }: { project: VideoProject; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const headingId = useId();
  const [failed, setFailed] = useState(false);
  const [reducedMotion] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const showVideo = !!p.video && !failed;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const node = root.current;
    node?.focus({ preventScroll: true });
    // one video at a time: pause every other <video> on the page
    document.querySelectorAll("video").forEach((v) => {
      if (!node?.contains(v)) v.pause();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const list = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = !!active && node.contains(active);
      if (e.shiftKey && (!inside || active === first || active === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      // after React has removed the dialog
      requestAnimationFrame(() => {
        if (opener && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true });
      });
    };
  }, []);

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      tabIndex={-1}
      data-project-video={p.id}
      className="cinema-in pointer-events-auto fixed inset-0 z-[100] flex flex-col overflow-y-auto overscroll-contain bg-[#120b08] text-[#f8e9cc] focus:outline-none"
      style={{ fontFamily: "Mukta, system-ui, sans-serif" }}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">Demo</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close video (Esc)"
          title="Close (Esc)"
          className={pillClass("shrink-0")}
        >
          <span aria-hidden="true" className="text-lg leading-none">✕</span>
          <span>Close</span>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-2 py-3 sm:px-8">
        <div className="aspect-video max-h-[calc(100dvh-13rem)] w-full max-w-[min(100%,calc((100dvh-13rem)*16/9))] overflow-hidden rounded-xl bg-black shadow-2xl ring-1 ring-white/10">
          {showVideo ? (
            <video
              key={p.video}
              src={p.video!}
              poster={p.poster ?? undefined}
              muted
              playsInline
              controls
              autoPlay={!reducedMotion}
              preload="none"
              onError={() => setFailed(true)}
              aria-label={`${p.name} demo video`}
              className="h-full w-full object-contain"
            />
          ) : (
            <Stills p={p} />
          )}
        </div>
      </div>

      <div className="mx-auto mb-6 w-full max-w-4xl shrink-0 [overflow-wrap:anywhere] sm:px-0">
        <div className={cardClass("flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 py-3")}>
          <div className="min-w-0">
            <h2 id={headingId} className="flex items-center gap-2.5 text-2xl font-semibold leading-tight text-[#8f3320] sm:text-3xl">
              <span className="h-2.5 w-2.5 shrink-0 rotate-45" style={{ background: p.accent }} aria-hidden="true" />
              {p.name}
            </h2>
            <p className="mt-1 text-base leading-snug">{p.tagline}</p>
            {p.disclaimer && (
              <p className={wellClass("mt-1.5 inline-block !px-2.5 !py-0.5 text-sm font-semibold")} data-disclaimer>
                {p.disclaimer}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <ExtLink href={p.liveUrl} label="Live site" primary />
            <ExtLink href={p.repoUrl} label="Code" />
          </div>
        </div>
      </div>
    </div>
  );
}
