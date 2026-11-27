"use client";

// The one panel for a project stand, a degree plaque, a certificate easel and a book.
// For a project it is a compact teaser (pitch, one number, "Watch demo"); the video
// is cinema mode (CinemaMode.tsx).
// Non-modal dialog: focus moves in when it opens (unless the visitor is typing), returns
// when it closes, Escape closes it, walking away closes it (halls/Halls.tsx). Desktop: a
// side panel on the right; phones / touch: a bottom sheet above the chat bar and joystick.
import { useEffect, useId, useRef } from "react";
import { isTypingTarget, useWorld, type InfoRef } from "@/store/world";
import { accentAt, HALL, realUrl } from "./content";
import { taglineOf } from "@/content/showcase";
import { STANDS } from "./layout";
import { eduRow } from "@/lib/robot/journey";
import { aboutPages } from "../about/AboutBody";
import { ContactForm } from "@/components/recruiter/ContactForm";
import { profile } from "@/content/profile";
import { ctaState } from "../about/aboutView";
import { WORKSHOP } from "./workshopLayout";
import { LABELS } from "../nepal/labels";
import { btnClass, chipClass, BookPanel, LINK_ARROW, wellClass } from "../ui/book";

function useClose() {
  return () => useWorld.getState().closeInfo(true);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">{title}</h3>
      <div className="mt-1 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden="true" className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rotate-45 bg-current opacity-60" />
          <span className="min-w-0">{t}</span>
        </li>
      ))}
    </ul>
  );
}

type Theme = { night: boolean };
const linkBtn = (_theme: Theme, primary: boolean) => btnClass(primary);

function ExtLink({ href, label, primary, theme }: { href: string | null | undefined; label: string; primary?: boolean; theme: Theme }) {
  if (!realUrl(href)) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkBtn(theme, !!primary)}>
      {label}
      <span aria-hidden="true">{LINK_ARROW}</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function Body({ info, theme, headingId }: { info: InfoRef; theme: Theme; headingId: string }) {
  const heading = (t: string) => (
    <h2 id={headingId} className="pr-9 text-xl font-semibold leading-tight">
      {t}
    </h2>
  );
  switch (info.kind) {
    case "about":
      return null; // the About book has its own pages (see InfoPanel below)
    case "workshop": {
      const w = WORKSHOP.find((x) => x.id === info.id);
      const others = WORKSHOP.filter((x) => x.id !== info.id);
      return (
        <>
          {heading(w ? w.name : "Workshop")}
          <p className="mt-0.5 text-sm opacity-80">{w ? "GitHub only · code, not deployed" : `${WORKSHOP.length} more projects on GitHub. Pick one:`}</p>
          {w && (
            <>
              <p className="mt-3 text-base leading-relaxed">{w.blurb}</p>
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Tech used">
                {w.stack.map((t) => (
                  <li key={t} className={chipClass()}>
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <ExtLink href={w.repoUrl} label="View code on GitHub" primary theme={theme} />
              </div>
            </>
          )}
          {others.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Other Workshop projects">
              {others.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className={chipClass()}
                    onClick={() => useWorld.getState().openInfo({ kind: "workshop", id: o.id, spot: "workshop" })}
                  >
                    {o.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      );
    }
    case "contact": {
      const links = [
        ["GitHub", profile.links.github],
        ["LinkedIn", profile.links.linkedin],
      ].filter(([, href]) => ctaState(href).kind === "link");
      return (
        <>
          {heading("Say hello")}
          <p className="mt-0.5 text-sm opacity-80">Your company could be my first. Send a note and I will reply.</p>
          <div className="mt-3">
            <ContactForm variant="panel" night={theme.night} githubUrl={ctaState(profile.links.github).kind === "link" ? profile.links.github : undefined} />
          </div>
          {links.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {links.map(([label, href]) => (
                <ExtLink key={label} href={href} label={label} theme={theme} />
              ))}
            </div>
          )}
        </>
      );
    }
    case "project": {
      // The teaser: plain-words pitch, one big number and the way into the demo video.
      const i = HALL.projects.findIndex((p) => p.id === info.id);
      const p = HALL.projects[i];
      if (!p) return heading("Project not found");
      const accent = accentAt(i);
      const top = p.metrics?.[0];
      return (
        <>
          <div className="flex items-start gap-2">
            <span className="mt-2 h-2.5 w-2.5 shrink-0 rotate-45" style={{ background: accent }} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              {heading(p.name)}
              <p className="mt-0.5 text-sm opacity-80">
                {taglineOf(p)} <span className="whitespace-nowrap opacity-80">· {p.year}</span>
              </p>
              {p.disclaimer && (
                <p className={wellClass("mt-1 inline-block !px-2 !py-0.5 text-xs font-semibold")} data-disclaimer>
                  {p.disclaimer}
                </p>
              )}
            </div>
          </div>
          <p className="mt-3 text-base leading-relaxed">{p.pitch ?? p.description}</p>
          {!top && p.highlights.length > 0 && (
            <ul className={wellClass("mt-3 space-y-1.5 text-sm leading-snug")} aria-label="Highlights">
              {p.highlights.slice(0, 2).map((h) => (
                <li key={h} className="flex gap-2">
                  <span aria-hidden="true" className="mt-[0.5em] h-1.5 w-1.5 shrink-0 rotate-45" style={{ background: accent }} />
                  <span className="min-w-0">{h}</span>
                </li>
              ))}
            </ul>
          )}
          {top && (
            <div className={wellClass("mt-3 flex items-baseline gap-3")}>
              <span className="min-w-[3ch] shrink-0 whitespace-nowrap text-3xl font-semibold leading-none tabular-nums" style={{ color: "#8f3320" }}>
                {top.value}
              </span>
              <span className="min-w-0 text-sm leading-snug">
                <span className="font-semibold">{top.label}</span>
                {top.plain && <span className="opacity-80">: {top.plain}</span>}
              </span>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" data-open-video={p.id} className={linkBtn(theme, true)} onClick={() => useWorld.getState().openCinema(p.id)}>
              Watch demo
              <span aria-hidden="true">→</span>
            </button>
            <ExtLink href={p.liveUrl} label="Live demo" theme={theme} />
          </div>
          <p className="mt-2 text-xs opacity-65">A short demo video, full screen.</p>
        </>
      );
    }
    case "more": {
      const stand = (STANDS.find((s) => s.spot.key === info.spot)?.projects ?? []).map((k) => HALL.projects[k]);
      return (
        <>
          {heading("More projects")}
          <p className="mt-0.5 text-sm opacity-80">This stand holds {stand.length} more projects. Pick one:</p>
          <ul className="mt-3 space-y-1.5">
            {stand.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={chipClass("w-full !rounded-lg !px-3 !py-2 text-left !text-sm !font-normal")}
                  onClick={() => useWorld.getState().openInfo({ kind: "project", id: p.id, spot: info.spot })}
                >
                  <span className="font-semibold">{p.name}</span>
                  <span className="opacity-75">: {p.tagline}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      );
    }
    case "education": {
      const e = HALL.education.find((x) => x.id === info.id);
      if (!e) return heading("Not found");
      const { title, meta } = eduRow(e);
      // the plain line first; grade and highlights only when there are any (no empty rows)
      return (
        <>
          {heading(title)}
          {meta && <p className="mt-0.5 text-sm opacity-80">{meta}</p>}
          {e.grade && (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="opacity-70">Grade</dt>
              <dd>{e.grade}</dd>
            </dl>
          )}
          {e.highlights.length > 0 && (
            <Section title="Highlights">
              <Bullets items={e.highlights} />
            </Section>
          )}
        </>
      );
    }
    case "certificate": {
      const c = HALL.certificates.find((x) => x.id === info.id);
      if (!c) return heading("Not found");
      return (
        <>
          {heading(c.name)}
          <p className="mt-0.5 text-sm opacity-80">
            {c.issuer} · {c.year}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ExtLink href={c.url} label="View certificate" primary theme={theme} />
          </div>
        </>
      );
    }
    case "course": {
      const c = HALL.courses.find((x) => x.id === info.id);
      if (!c) return heading("Not found");
      return (
        <>
          {heading(c.name)}
          <p className="mt-0.5 text-sm opacity-80">{c.provider}</p>
          {c.learned.length > 0 && (
            <Section title="What I learned">
              <Bullets items={c.learned} />
            </Section>
          )}
        </>
      );
    }
  }
}

const KIND_LABEL: Record<InfoRef["kind"], string> = {
  project: "Project",
  more: "Project Hall",
  education: "Education",
  certificate: "Certificate",
  course: "Course",
  about: "About me · Yanish's Ghar",
  contact: "Mailbox · Contact",
  workshop: "Workshop · Project Hall",
};

const KIND_NE: Record<InfoRef["kind"], string> = {
  project: LABELS.zones["project-hall"].ne,
  more: LABELS.zones["project-hall"].ne,
  education: LABELS.zones.education.ne,
  certificate: LABELS.zones.education.ne,
  course: LABELS.zones.education.ne,
  about: LABELS.zones.about.ne,
  contact: LABELS.zones.mailbox.ne,
  workshop: LABELS.zones["project-hall"].ne,
};

export default function InfoPanel({ aboutPhoto = null }: { aboutPhoto?: string | null }) {
  const info = useWorld((s) => s.info);
  const night = useWorld((s) => s.theme === "night");
  const close = useClose();
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const headingId = useId();
  const key = info ? `${info.kind}:${info.id}` : null;

  // Focus in on open (not while the visitor is typing in the chat), back out on close.
  useEffect(() => {
    if (!key) return;
    const node = panel.current;
    const active = document.activeElement as HTMLElement | null;
    const typing = !!active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
    if (!node?.contains(active)) returnTo.current = active && active !== document.body ? active : null;
    if (!typing) node?.focus({ preventScroll: true });
    return () => {
      const el = returnTo.current;
      // only hand focus back if it was inside the panel (don't yank it from wherever the visitor went)
      if (el && el.isConnected && (!document.activeElement || document.activeElement === document.body || node?.contains(document.activeElement))) {
        el.focus({ preventScroll: true });
      }
    };
  }, [key]);

  useEffect(() => {
    if (!key) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || isTypingTarget(e)) return;
      // Esc belongs to the video while it's open (it closes that, not this teaser)
      if (useWorld.getState().cinema) return;
      e.preventDefault();
      useWorld.getState().closeInfo(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key]);

  if (!info) return null;
  const theme = { night };
  return (
    <BookPanel
      ref={panel}
      key={key}
      bookKey={key ?? undefined}
      pages={info.kind === "about" ? aboutPages({ photo: aboutPhoto, headingId, linkBtn: (primary) => linkBtn(theme, primary) }) : undefined}
      night={night}
      ne={KIND_NE[info.kind]}
      kind={KIND_LABEL[info.kind]}
      onClose={close}
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      tabIndex={-1}
      className="info-panel pointer-events-auto min-w-0"
    >
      {info.kind === "about" ? null : <Body info={info} theme={theme} headingId={headingId} />}
    </BookPanel>
  );
}
