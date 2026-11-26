"use client";

// Cinema mode, the HTML half: the full-screen case study that "grows" out of a stand's screen
// once the camera has flown into it (CinemaCamera.tsx).
// - Hero (screenshots / demo clip carousel, else the poster), title line, count-up metrics,
//   tabs (Overview, How it works, Tech, Results), Live demo / GitHub / Case study links.
// - Close: the X button, Esc, or the phone/browser Back button. Opening pushes one history
//   entry; X and Esc call history.back(), and the popstate handler is the one close path.
// - role="dialog" + aria-modal, focus trap, focus returns to what opened it.
// - Phones: a full-screen sheet; the tabs become a row of chips; everything scrolls.
import { useEffect, useId, useRef, useState } from "react";
import gsap from "gsap";
import { plainArchitecture, taglineOf } from "@/content/showcase";
import type { Project } from "@/content/profile";
import { isTypingTarget, useWorld } from "@/store/world";
import { accentAt, HALL, realUrl } from "./content";
import ArchDiagram from "./ArchDiagram";
import { flowSentence, formatMetric, groupStack, parseMetric, posterUrl, videoUrl, type MediaFiles } from "./showcaseView";

// ---------------------------------------------------------------- history: one close path

/** True while our history entry for the open case study is on the stack. */
let pushed = false;

/** X / Esc: step back through history; the popstate handler closes (only one way out). */
export function requestCloseCinema() {
  if (!useWorld.getState().cinema) return;
  if (pushed) window.history.back();
  else useWorld.getState().closeCinema();
}

function useCinemaHistory() {
  useEffect(() => {
    const unsub = useWorld.subscribe((s, prev) => {
      if (s.cinema && !prev.cinema && !pushed) {
        // Next's patched pushState copies its router state into ours, so Back stays in the app
        window.history.pushState({ cinema: s.cinema }, "");
        pushed = true;
      } else if (!s.cinema && prev.cinema && pushed) {
        // closed some other way (e.g. a new page state): drop our entry too
        pushed = false;
        window.history.back();
      }
    });
    const onPop = () => {
      if (!pushed) return;
      pushed = false;
      useWorld.getState().closeCinema();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      unsub();
      window.removeEventListener("popstate", onPop);
    };
  }, []);
}

// ---------------------------------------------------------------- pieces

type Theme = { night: boolean; accent: string };

function Metric({ value, label, plain, reducedMotion, big = true }: { value: string; label: string; plain?: string; reducedMotion: boolean; big?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    const parts = parseMetric(value);
    if (!el) return;
    if (!parts || reducedMotion) {
      el.textContent = value;
      return;
    }
    const o = { n: 0 };
    el.textContent = formatMetric(parts, 0);
    const tw = gsap.to(o, {
      n: parts.num,
      duration: 1.3,
      delay: 0.15,
      ease: "power2.out",
      onUpdate: () => {
        el.textContent = formatMetric(parts, o.n);
      },
      onComplete: () => {
        el.textContent = value;
      },
    });
    return () => {
      tw.kill();
    };
  }, [value, reducedMotion]);
  return (
    <div className="min-w-0">
      <span ref={ref} className={`block font-semibold leading-none tabular-nums ${big ? "text-4xl sm:text-5xl" : "text-3xl"}`} aria-hidden="true">
        {value}
      </span>
      <span className="sr-only">{value}</span>
      <span className="mt-1 block text-sm font-semibold">{label}</span>
      {plain && <span className="mt-0.5 block text-sm leading-snug opacity-75">{plain}</span>}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden="true" className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rotate-45 bg-current opacity-60" />
          <span className="min-w-0">{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] opacity-70">{title}</h3>
      <div className="mt-1.5 text-base leading-relaxed">{children}</div>
    </section>
  );
}

const linkBtn = ({ night }: Theme, primary: boolean) =>
  `inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold shadow-sm transition focus:outline-none focus-visible:ring-2 ${
    primary
      ? night
        ? "bg-[#c9a227] text-[#2a1c22] hover:bg-[#e0b83a] focus-visible:ring-[#f3d98a]"
        : "bg-[#9c3b22] text-white hover:bg-[#b5482c] focus-visible:ring-[#c9a227]"
      : night
        ? "border border-[#c9a227]/60 text-[#f8e9cc] hover:bg-white/10 focus-visible:ring-[#e5c158]"
        : "border border-[#9c3b22]/40 text-[#5a2a18] hover:bg-[#9c3b22]/10 focus-visible:ring-[#9c3b22]"
  }`;

function ExtLink({ href, label, primary, theme }: { href: string | null | undefined; label: string; primary?: boolean; theme: Theme }) {
  if (!realUrl(href)) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkBtn(theme, !!primary)}>
      {label}
      <span aria-hidden="true">↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** The poster drawn in HTML (same look as the stand's generated poster) when there's no image. */
function GeneratedPoster({ p, accent }: { p: Project; accent: string }) {
  return (
    <div
      className="relative flex h-full w-full flex-col justify-between overflow-hidden p-[5%] text-[#fff4dc]"
      style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 45%, #1a0f0a) 0%, #120b08 100%)` }}
    >
      <div
        aria-hidden="true"
        className="h-3 w-full opacity-80"
        style={{ background: `repeating-linear-gradient(45deg, ${accent} 0 2px, transparent 2px 9px), repeating-linear-gradient(-45deg, ${accent} 0 2px, transparent 2px 9px)` }}
      />
      <div>
        <span className="mb-3 block h-1 w-16" style={{ background: accent }} />
        <p className="text-3xl font-semibold sm:text-5xl">{p.name}</p>
        <p className="mt-2 max-w-xl text-base opacity-85 sm:text-lg">{p.tagline}</p>
      </div>
      <ul className="flex flex-wrap gap-2">
        {p.stack.map((t) => (
          <li key={t} className="rounded-full border-2 px-3 py-0.5 text-sm font-semibold" style={{ borderColor: accent }}>
            {t}
          </li>
        ))}
      </ul>
      <span aria-hidden="true" className="pointer-events-none absolute inset-[1.5%] border-2 border-[#c9a227]/80" />
    </div>
  );
}

type Slide = { kind: "video"; src: string; poster: string | null } | { kind: "image"; src: string } | { kind: "generated" };

function Hero({ p, accent, files, reducedMotion }: { p: Project; accent: string; files: MediaFiles; reducedMotion: boolean }) {
  const poster = posterUrl(p, files);
  const video = videoUrl(p);
  const slides: Slide[] = [
    ...(video ? [{ kind: "video" as const, src: video, poster }] : []),
    ...(p.media?.screenshots ?? []).filter((s) => s && s.trim()).map((src) => ({ kind: "image" as const, src })),
  ];
  if (!slides.length) slides.push(poster ? { kind: "image", src: poster } : { kind: "generated" });
  const [i, setI] = useState(0);
  const cur = slides[Math.min(i, slides.length - 1)];
  const many = slides.length > 1;
  const go = (d: number) => setI((k) => (k + d + slides.length) % slides.length);
  return (
    <div className="relative">
      <div className="aspect-video max-h-[52vh] w-full overflow-hidden rounded-xl bg-black/50 shadow-lg ring-1 ring-black/10" aria-roledescription={many ? "carousel" : undefined} aria-label={many ? `${p.name} media` : undefined}>
        {cur.kind === "video" ? (
          <video
            key={cur.src}
            src={cur.src}
            poster={cur.poster ?? undefined}
            muted
            playsInline
            loop
            controls
            autoPlay={!reducedMotion}
            preload="metadata"
            aria-label={`${p.name} demo video`}
            className="h-full w-full object-contain"
          />
        ) : cur.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={cur.src} src={cur.src} alt={`${p.name} screenshot${many ? ` ${i + 1} of ${slides.length}` : ""}`} className="h-full w-full object-contain" />
        ) : (
          <GeneratedPoster p={p} accent={accent} />
        )}
      </div>
      {many && (
        <div className="mt-2 flex items-center justify-center gap-3">
          <button type="button" onClick={() => go(-1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/10 text-lg transition hover:bg-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]" aria-label="Previous">
            <span aria-hidden="true">‹</span>
          </button>
          <span className="flex gap-1.5" aria-hidden="true">
            {slides.map((_, k) => (
              <span key={k} className={`h-2 rounded-full transition-all ${k === i ? "w-5" : "w-2 opacity-40"}`} style={{ background: accent }} />
            ))}
          </span>
          <span className="sr-only" aria-live="polite">
            {i + 1} of {slides.length}
          </span>
          <button type="button" onClick={() => go(1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/10 text-lg transition hover:bg-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]" aria-label="Next">
            <span aria-hidden="true">›</span>
          </button>
        </div>
      )}
    </div>
  );
}

const ALL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "how", label: "How it works" },
  { id: "tech", label: "Tech" },
  { id: "results", label: "Results" },
] as const;
type TabId = (typeof ALL_TABS)[number]["id"];

function TabBody({ tab, p, theme, reducedMotion }: { tab: TabId; p: Project; theme: Theme; reducedMotion: boolean }) {
  switch (tab) {
    case "overview":
      return (
        <>
          {p.pitch && <p className="mb-4 text-lg leading-relaxed">{p.pitch}</p>}
          <Block title="The problem">{p.problem}</Block>
          <Block title="What it does">{p.description}</Block>
          {p.highlights.length > 0 && p.metrics?.length ? (
            <Block title="Highlights">
              <Bullets items={p.highlights} />
            </Block>
          ) : null}
        </>
      );
    case "how": {
      const layers = plainArchitecture(p);
      if (!layers.length) return <p>The diagram for this project is coming soon.</p>;
      return (
        <>
          <p className="mb-4 text-lg leading-relaxed">{flowSentence(layers)}</p>
          <ArchDiagram layers={layers} accent={theme.accent} reducedMotion={reducedMotion} night={theme.night} />
          <p className="mt-3 text-sm opacity-70">Each box is one part of the project. The plain name is on top; the technology it uses is underneath.</p>
        </>
      );
    }
    case "tech":
      return (
        <div className="space-y-4">
          {groupStack(p.stack).map((g) => (
            <section key={g.group}>
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] opacity-70">{g.group}</h3>
              <ul className="mt-1.5 flex flex-wrap gap-2">
                {g.items.map((t) => (
                  <li key={t} className={`rounded-full border px-3 py-1 text-sm font-medium ${theme.night ? "border-[#c9a227]/50 bg-[#3a2a2e]" : "border-[#9c3b22]/30 bg-[#fbe6cc]"}`}>
                    {t}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      );
    case "results":
      return p.metrics?.length ? (
        <ul className="grid gap-5 sm:grid-cols-2">
          {p.metrics.map((m) => (
            <li key={m.label} className={`rounded-xl p-4 ${theme.night ? "bg-white/5" : "bg-[#9c3b22]/5"}`}>
              <Metric value={m.value} label={m.label} plain={m.plain} reducedMotion={reducedMotion} big={false} />
            </li>
          ))}
        </ul>
      ) : (
        <p>Real numbers for this project are coming soon.</p>
      );
  }
}

// ---------------------------------------------------------------- the dialog

const FOCUSABLE = 'a[href], button:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';

function CaseStudy({ p, index, files, reducedMotion }: { p: Project; index: number; files: MediaFiles; reducedMotion: boolean }) {
  const night = useWorld((s) => s.theme === "night");
  const accent = accentAt(index);
  const theme: Theme = { night, accent };
  const [tab, setTab] = useState<TabId>("overview");
  // no numbers yet: no empty "Results" tab (the highlights are shown up top instead)
  const TABS = p.metrics?.length ? ALL_TABS : ALL_TABS.filter((t) => t.id !== "results");
  const root = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const tabsId = useId();

  // Focus in on open; Tab / Shift+Tab stay inside; Esc closes.
  useEffect(() => {
    // open at the top, hero first
    if (root.current) root.current.scrollTop = 0;
    root.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isTypingTarget(e)) {
        e.preventDefault();
        requestCloseCinema();
        return;
      }
      if (e.key !== "Tab" || !root.current) return;
      const list = Array.from(root.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = !!active && root.current.contains(active);
      if (e.shiftKey && (!inside || active === first || active === root.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const onTabKey = (e: React.KeyboardEvent) => {
    const k = TABS.findIndex((t) => t.id === tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (k + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (k - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next].id);
    document.getElementById(`${tabsId}-${TABS[next].id}`)?.focus({ preventScroll: true });
  };

  const palette = night ? "bg-[#1f1418] text-[#f8e9cc]" : "bg-[#fff8ec] text-[#3a2419]";
  const top = p.metrics?.slice(0, 3) ?? [];
  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      tabIndex={-1}
      data-cinema={p.id}
      className={`cinema-in pointer-events-auto fixed inset-0 z-40 overflow-y-auto overscroll-contain focus:outline-none ${palette}`}
      style={{ fontFamily: "Mukta, system-ui, sans-serif" }}
    >
      {/* brick + gold lattice band (same motif as the teaser) */}
      <div
        aria-hidden="true"
        className="sticky top-0 z-10 h-2 w-full"
        style={{
          background: night
            ? "repeating-linear-gradient(45deg,#c9a227 0 3px,transparent 3px 8px),repeating-linear-gradient(-45deg,#c9a227 0 3px,#3a2418 3px 8px)"
            : "repeating-linear-gradient(45deg,#c9a227 0 3px,transparent 3px 8px),repeating-linear-gradient(-45deg,#c9a227 0 3px,#9c3b22 3px 8px)",
        }}
      />
      <div className="mx-auto box-border w-full max-w-5xl px-4 pb-16 pt-4 sm:px-8 sm:pt-6 [overflow-wrap:anywhere]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
            Case study <span className="opacity-70">· Project Hall</span>
          </p>
          <button
            type="button"
            onClick={requestCloseCinema}
            aria-label="Close case study (Esc)"
            title="Close (Esc)"
            className={`flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 ${
              night ? "bg-white/10 hover:bg-white/20 focus-visible:ring-[#e5c158]" : "bg-[#9c3b22]/10 hover:bg-[#9c3b22]/20 focus-visible:ring-[#9c3b22]"
            }`}
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ✕
            </span>
            <span>Back to the hall</span>
          </button>
        </div>

        <div className="mt-4">
          <Hero p={p} accent={accent} files={files} reducedMotion={reducedMotion} />
        </div>

        <header className="mt-6">
          <div className="flex items-start gap-3">
            <span className="mt-3 h-3 w-3 shrink-0 rotate-45" style={{ background: accent }} aria-hidden="true" />
            <div className="min-w-0">
              <h2 id={headingId} className="text-3xl font-semibold leading-tight sm:text-4xl">
                {p.name}
              </h2>
              {p.disclaimer && (
                <p className={`mt-1.5 inline-block rounded-md px-2.5 py-0.5 text-sm font-semibold ${night ? "bg-white/10 text-[#f1d98a]" : "bg-[#9c3b22]/10 text-[#7a2d18]"}`} data-disclaimer>
                  {p.disclaimer}
                </p>
              )}
              <p className="mt-1 text-lg leading-snug opacity-90">{p.pitch ?? taglineOf(p)}</p>
              <p className="mt-1 text-sm opacity-70">
                {p.audience && (
                  <>
                    <span className="font-semibold">Made for:</span> {p.audience} ·{" "}
                  </>
                )}
                {p.year}
              </p>
            </div>
          </div>
        </header>

        {top.length > 0 && (
          <div className={`mt-6 grid gap-5 rounded-2xl p-5 ${night ? "bg-white/5" : "bg-[#9c3b22]/[0.06]"}`} style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 11rem), 1fr))` }}>
            {top.map((m) => (
              <Metric key={m.label} value={m.value} label={m.label} plain={m.plain} reducedMotion={reducedMotion} />
            ))}
          </div>
        )}

        {top.length === 0 && p.highlights.length > 0 && (
          <ul
            aria-label="Highlights"
            className={`mt-6 grid gap-3 rounded-2xl p-4 sm:grid-cols-2 ${night ? "bg-white/5" : "bg-[#9c3b22]/[0.06]"}`}
          >
            {p.highlights.map((h) => (
              <li key={h} className="flex gap-2.5 text-base leading-snug">
                <span aria-hidden="true" className="mt-[0.5em] h-2 w-2 shrink-0 rotate-45" style={{ background: accent }} />
                <span className="min-w-0">{h}</span>
              </li>
            ))}
          </ul>
        )}

        <div role="tablist" aria-label="Case study sections" className="-mx-4 mt-7 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" onKeyDown={onTabKey}>
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <button
                key={t.id}
                id={`${tabsId}-${t.id}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={`${tabsId}-panel`}
                tabIndex={on ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227] ${
                  on ? (night ? "bg-[#c9a227] text-[#2a1c22]" : "bg-[#9c3b22] text-white") : night ? "bg-white/10 hover:bg-white/15" : "bg-[#9c3b22]/10 hover:bg-[#9c3b22]/15"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}`} tabIndex={0} className="mt-5 min-h-[22rem] focus:outline-none [overflow-anchor:none]">
          <TabBody tab={tab} p={p} theme={theme} reducedMotion={reducedMotion} />
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          <ExtLink href={p.liveUrl} label="Live demo" primary theme={theme} />
          <ExtLink href={p.repoUrl} label="GitHub" theme={theme} />
          <ExtLink href={p.caseStudyUrl} label="Case study" theme={theme} />
        </div>
      </div>
    </div>
  );
}

/** Always mounted (Overlay): owns the history entry; shows the case study once the camera has arrived. */
export default function CinemaMode({ files }: { files: MediaFiles }) {
  useCinemaHistory();
  const id = useWorld((s) => s.cinema);
  const ready = useWorld((s) => s.cinemaReady);
  const [reducedMotion] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const returnTo = useRef<HTMLElement | null>(null);

  // Remember what opened it; hand focus back once it closes.
  useEffect(
    () =>
      useWorld.subscribe((s, prev) => {
        if (s.cinema && !prev.cinema) {
          const a = document.activeElement as HTMLElement | null;
          returnTo.current = a && a !== document.body ? a : null;
        } else if (!s.cinema && prev.cinema) {
          const el = returnTo.current;
          returnTo.current = null;
          // after React has removed the dialog
          requestAnimationFrame(() => {
            if (el && el.isConnected) el.focus({ preventScroll: true });
          });
        }
      }),
    [],
  );

  if (!id || !ready) return null;
  const index = HALL.projects.findIndex((p) => p.id === id);
  const p = HALL.projects[index];
  if (!p) return null;
  return <CaseStudy key={p.id} p={p} index={index} files={files} reducedMotion={reducedMotion} />;
}
