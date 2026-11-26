"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useProgress } from "@react-three/drei";
import { profile } from "@/content/profile";
import { ABOUT_INFO, isTypingTarget, useWorld } from "@/store/world";
import { AboutLogic, GharHint } from "./about/AboutLogic";
import { ctaState } from "./about/aboutView";
import { runAction } from "./robot/actions";
import { eduLine, NEXT_MILESTONE_TEXT } from "@/lib/robot/journey";
import { JOURNEY } from "./journey";
import { zoneById } from "./zones";
import { LABELS } from "./nepal/labels";
import { NAVIGATE_EVENT } from "./nepal/navigate";
import { characterById, type CharacterId } from "./characters";
import CharacterPicker from "./CharacterPicker";
import RobotChat, { Toast } from "./robot/RobotChat";
import Joystick from "./Joystick";
import InfoPanel from "./halls/InfoPanel";
import CinemaMode from "./halls/CinemaMode";
import { DALAN } from "./halls/layout";
import { HALL } from "./halls/content";
import { courseInfo, defaultInfo, projectInfo, visitByVisitor } from "./halls/visit";
import { EASELS, SCROLL } from "./halls/layout";
import type { InfoRef } from "@/store/world";
import { PotCard, SkillFilterBar, SquareHint } from "./skills/PotUi";

const RECRUITER_HREF = "/recruiter";

/**
 * Card content, all sourced from src/content/profile.ts. In the Project Hall and the pathshala
 * each line is a button that walks to that stand / plaque / easel / book and opens its panel.
 */
function zoneContent(id: string): { blurb: string; lines: string[]; ids?: string[]; refs?: (InfoRef | null)[] } {
  switch (id) {
    case "plaza":
      return { blurb: profile.tagline, lines: [profile.name + " · " + profile.title, profile.location] };
    case "project-hall":
      return {
        blurb: `${HALL.projects.length} ${HALL.projects.length === 1 ? "project stands" : "projects stand"} along the dalan. Walk up to one, or pick it here.`,
        lines: HALL.projects.map((p) => `${p.name}: ${p.tagline}`),
        ids: HALL.projects.map((p) => p.id),
        refs: HALL.projects.map((p) => projectInfo(p.id)),
      };
    case "education":
      return {
        blurb: `Where I studied and keep learning. Walk up to the scroll${HALL.certificates.length ? ", a certificate" : ""}${HALL.courses.length ? " or the bookshelf" : ""}, and tap a row for details.`,
        lines: [
          ...HALL.education.map((e) => eduLine(e)),
          ...HALL.certificates.map((c) => `Certificate: ${c.name}`),
          ...HALL.courses.map((c) => `Course: ${c.name}`),
        ],
        refs: [...(SCROLL?.rows ?? []).map((r) => defaultInfo(r.spot)), ...EASELS.map((e) => defaultInfo(e.spot)), ...HALL.courses.map((c) => courseInfo(c.id))],
      };
    case "skills-lab":
      return {
        blurb: "Tools I reach for.",
        lines: profile.skills.map((g) => `${g.label}: ${g.skills.map((s) => s.name).join(", ")}`),
      };
    case "timeline":
      return {
        blurb: profile.experience.length ? "Experience, step by step." : "No jobs yet, so the stones show the journey so far. Run along the path to light them up.",
        lines: JOURNEY.map((m) => (m.kind === "next" ? NEXT_MILESTONE_TEXT : `${m.head}: ${m.lines.join(", ")}${m.impact ? `. ${m.impact}` : ""}`)),
      };
    case "about":
      return { blurb: `Meet ${profile.name}: the story, what I love building and how to get in touch.`, lines: [] };
    case "mailbox":
      return {
        blurb: "Say hello.",
        // only real links (placeholders are "#"; no email on the site)
        lines: [
          ...(ctaState(profile.links.github).kind === "link" ? [`GitHub: ${profile.links.github}`] : []),
          ...(ctaState(profile.links.linkedin).kind === "link" ? [`LinkedIn: ${profile.links.linkedin}`] : []),
        ],
      };
    case "kiosk":
      return { blurb: "Prefer a fast, no-walking summary? Open Recruiter mode.", lines: [] };
    default:
      return { blurb: "", lines: [] };
  }
}

function LoadingScreen() {
  const loaded = useWorld((s) => s.loaded);
  const { progress } = useProgress();
  const pct = loaded ? 100 : Math.round(progress);

  return (
    <div
      className={`absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-[#f3d9b8] px-6 text-center text-[#5a3d33] transition-opacity duration-700 ${
        loaded ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      aria-hidden={loaded}
    >
      <div>
        <p className="text-4xl font-semibold sm:text-5xl" style={{ fontFamily: "Mukta, sans-serif" }}>
          {LABELS.welcome.title}
        </p>
        <p className="mt-1 text-lg opacity-80" lang="ne" style={{ fontFamily: "Mukta, sans-serif" }}>
          {LABELS.welcome.ne}
        </p>
      </div>
      <h1 className="text-2xl font-semibold sm:text-3xl">I&rsquo;m {profile.name}</h1>
      <p className="text-sm opacity-80">Lighting the diyos&hellip; {pct}%</p>
      <div className="h-2 w-64 max-w-full overflow-hidden rounded-full bg-[#5a3d33]/15" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={`h-full rounded-full bg-[#c9a227] transition-[width] duration-300 ${pct === 0 ? "animate-pulse" : ""}`}
          style={{ width: `${Math.max(pct, 6)}%` }}
        />
      </div>
      <Link
        href={RECRUITER_HREF}
        className="rounded-full border border-[#5a3d33]/40 bg-white/60 px-5 py-2 text-sm font-medium transition hover:bg-white"
      >
        Recruiter mode
      </Link>
    </div>
  );
}

function ZoneCard() {
  const router = useRouter();
  const activeZone = useWorld((s) => s.activeZone);
  const panelOpen = useWorld((s) => s.panelOpen);
  const setPanelOpen = useWorld((s) => s.setPanelOpen);
  const focusProject = useWorld((s) => s.focusProject);
  const infoOpen = useWorld((s) => !!s.info);
  // the pot card (hover / walk-up / chosen) takes the zone card's place
  const potCard = useWorld((s) => s.potHover !== null || s.potNear !== null || s.potSelected !== null);
  const zone = zoneById(activeZone);

  // Press E to enter the active zone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyE" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e)) return;
      const { activeZone: id, panelOpen: open, setPanelOpen: set } = useWorld.getState();
      if (!id) return;
      if (id === "kiosk") router.push(RECRUITER_HREF);
      else if (id === "about") {
        const st = useWorld.getState();
        if (st.info?.kind === "about") st.closeInfo(true);
        else {
          st.clearInfoDismissed();
          st.openInfo(ABOUT_INFO);
        }
      } else set(!open);
    };
    const onNav = (e: Event) => router.push((e as CustomEvent<string>).detail || RECRUITER_HREF);
    window.addEventListener("keydown", onKey);
    window.addEventListener(NAVIGATE_EVENT, onNav);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(NAVIGATE_EVENT, onNav);
    };
  }, [router]);

  // The info panel replaces the card while it's open.
  if (!zone || infoOpen || potCard) return null;
  const content = zoneContent(zone.id);
  const isKiosk = zone.id === "kiosk";
  const isAbout = zone.id === "about";
  const button =
    "pointer-events-auto rounded-full px-5 py-2 text-sm font-semibold text-white shadow transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white";

  return (
    <div className="pointer-events-none flex w-full justify-center">
      <div
        className="pointer-events-auto box-border w-full max-w-[min(28rem,calc(100vw-32px))] min-w-0 [overflow-wrap:anywhere] rounded-2xl border border-white/60 bg-[#fff8ec]/95 p-4 text-[#4a3228] shadow-xl backdrop-blur"
        role="dialog"
        aria-label={zone.label}
      >
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: zone.color }} />
          <h2 className="min-w-0 text-lg font-semibold">
            {zone.label}
            <span className="ml-2 font-medium opacity-70" lang="ne" style={{ fontFamily: "Mukta, sans-serif" }}>
              {LABELS.zones[zone.id].ne}
            </span>
          </h2>
        </div>
        <p className="mt-1 text-sm opacity-80">{content.blurb}</p>
        {zone.id === "timeline" && (
          <button
            type="button"
            data-next-milestone
            className="pointer-events-auto mt-3 w-full rounded-xl bg-[#9c3b22] px-3 py-2 text-left text-sm font-semibold text-white shadow transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]"
            onClick={() => runAction({ type: "walkTo", zone: "mailbox" })}
          >
            {NEXT_MILESTONE_TEXT}
            <span className="block text-xs font-normal opacity-85">Tap to walk to the mailbox and say hello</span>
          </button>
        )}
        {panelOpen && content.lines.length > 0 && (
          <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-sm">
            {content.lines.map((l, i) => {
              const focused = !!focusProject && content.ids?.[i] === focusProject;
              const ref = content.refs?.[i];
              const look = `rounded px-2 py-1 ${focused ? "bg-[#c9a227]/30 font-semibold ring-2 ring-[#c9a227]" : "bg-black/5"}`;
              return ref ? (
                <li key={i}>
                  <button
                    type="button"
                    className={`${look} w-full text-left transition hover:bg-[#c9a227]/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9c3b22]`}
                    aria-current={focused ? "true" : undefined}
                    onClick={() => visitByVisitor(ref)}
                  >
                    {l}
                  </button>
                </li>
              ) : (
                <li key={i} className={look} aria-current={focused ? "true" : undefined}>
                  {l}
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs opacity-70">{zone.prompt}</span>
          {isKiosk ? (
            <Link href={RECRUITER_HREF} className={button} style={{ background: "#2f8f7a" }}>
              Open Recruiter mode
            </Link>
          ) : isAbout ? (
            <button type="button" className={button} style={{ background: "#d9775b" }} onClick={() => { useWorld.getState().clearInfoDismissed(); useWorld.getState().openInfo(ABOUT_INFO); }}>
              Meet {profile.name.split(" ")[0]}
            </button>
          ) : content.lines.length > 0 ? (
            <button type="button" className={button} style={{ background: "#d9775b" }} onClick={() => setPanelOpen(!panelOpen)}>
              {panelOpen ? "Close" : "Enter"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Hint() {
  const moved = useWorld((s) => s.moved);
  const loaded = useWorld((s) => s.loaded);
  const gharHint = useWorld((s) => s.gharHint);
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-4 transition-opacity duration-500 sm:top-4 ${
        loaded && !moved && !gharHint ? "opacity-100" : "opacity-0"
      }`}
    >
      <p className="rounded-full bg-[#5a3d33]/80 px-4 py-2 text-sm text-white shadow">
        Click anywhere to walk
        <span className="hidden [@media(pointer:coarse)]:inline"> · or use the joystick</span>
        <span className="[@media(pointer:coarse)]:hidden"> · WASD / arrows to run, Shift to walk</span>
      </p>
    </div>
  );
}

/** Is a ground point in the Project Dalan (the gallery in front of the stands)? */
// the whole frontage counts, including the gate between the two wings
const inDalan = ([x, z]: [number, number]) =>
  z < DALAN.z1 + 3.2 && z > DALAN.z0 - 0.5 && x > DALAN.wings[0][0] - 0.6 && x < DALAN.wings[DALAN.wings.length - 1][1] + 0.6;
const HALL_HINT_MS = 9000;

/** First time the avatar reaches the Project Hall: one short line on what to do there. */
function HallHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let done = false;
    let timer = 0;
    const unsub = useWorld.subscribe((s) => {
      if (done || !s.character || s.pickerOpen) return;
      if (s.activeZone !== "project-hall" && !inDalan(s.position)) return;
      done = true;
      setShow(true);
      timer = window.setTimeout(() => setShow(false), HALL_HINT_MS);
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, []);
  const hidden = useWorld((s) => !!s.cinema);
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-4 transition-opacity duration-500 sm:top-4 ${show && !hidden ? "opacity-100" : "opacity-0"}`}
      aria-hidden={!show || hidden}
    >
      <p className="max-w-[min(34rem,calc(100vw-32px))] rounded-2xl bg-[#5a3d33]/85 px-4 py-2 text-center text-sm text-white shadow" role="status">
        Walk up to a screen to see a project. Tap <strong className="font-semibold text-[#ffe08a]">Open case study</strong> for the full story.
      </p>
    </div>
  );
}

/** Sun/moon toggle (also the N key). The scene blends over ~2 s. */
function ThemeToggle() {
  const theme = useWorld((s) => s.theme);
  const toggle = useWorld((s) => s.toggleTheme);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyN" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e)) return;
      useWorld.getState().toggleTheme();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const night = theme === "night";
  const label = night ? LABELS.ui.toDay : LABELS.ui.toNight;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`${label} (N)`}
      title={`${label} (N)`}
      className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-[#4a3228] shadow backdrop-blur transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]"
    >
      {night ? (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        </svg>
      )}
    </button>
  );
}

const pill =
  "pointer-events-auto flex h-10 items-center gap-2 rounded-full bg-white/80 px-3 text-sm font-medium text-[#4a3228] shadow backdrop-blur transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]";

/** "Change character" + Dance emote (also the G key). */
function AvatarControls() {
  const character = useWorld((s) => s.character);
  const pickerOpen = useWorld((s) => s.pickerOpen);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyG" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e)) return;
      const st = useWorld.getState();
      if (st.character && !st.pickerOpen) st.dance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!character || pickerOpen) return null;
  const c = characterById(character);
  return (
    <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
      <button type="button" className={`${pill} pl-1`} onClick={() => useWorld.getState().setPickerOpen(true)} title={LABELS.ui.changeCharacter}>
        {c && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.preview} alt="" width={32} height={32} className="h-8 w-8 rounded-full bg-[#b5643f] object-cover object-top" />
        )}
        <span className="hidden sm:inline">{LABELS.ui.changeCharacter}</span>
        <span className="sr-only sm:hidden">{LABELS.ui.changeCharacter}</span>
      </button>
      <button
        type="button"
        className={pill}
        onClick={() => useWorld.getState().dance()}
        aria-label={`${LABELS.ui.dance} (G)`}
        title={`${LABELS.ui.dance} (G)`}
      >
        <span aria-hidden="true">💃</span>
        <span className="hidden sm:inline">{LABELS.ui.dance}</span>
        <kbd className="hidden rounded bg-black/10 px-1.5 text-xs sm:inline [@media(pointer:coarse)]:hidden">G</kbd>
      </button>
    </div>
  );
}

export default function Overlay({ characters, thumbs = [], posters = [], aboutPhoto = null }: { characters: CharacterId[]; thumbs?: string[]; posters?: string[]; aboutPhoto?: string | null }) {
  const files = useMemo(() => ({ thumbs: new Set(thumbs), showcasePosters: new Set(posters) }), [thumbs, posters]);
  const cinema = useWorld((s) => !!s.cinema);
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* The world HUD steps aside while a case study is open: invisible (so out of the tab order
          and the accessibility tree) but still mounted, so focus can return to "Open case study". */}
      <div className={cinema ? "invisible contents" : "contents"} aria-hidden={cinema || undefined}>
      <Hint />
      <HallHint />
      <GharHint />
      <AboutLogic />
      <SquareHint />
      <SkillFilterBar />
      <AvatarControls />
      <Toast />
      {/* Bottom dock: zone card above the robot chat; on touch screens it sits above the joystick. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 p-4 pb-5 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] [@media(pointer:coarse)]:pb-[calc(168px+env(safe-area-inset-bottom))]">
        <ZoneCard />
        <InfoPanel aboutPhoto={aboutPhoto} />
        <PotCard />
        <RobotChat />
      </div>
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        <ThemeToggle />
        <Link
          href={RECRUITER_HREF}
          className="pointer-events-auto rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-[#4a3228] shadow backdrop-blur transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]"
        >
          Recruiter mode
        </Link>
      </div>
      {!cinema && <Joystick />}
      </div>
      <CinemaMode files={files} />
      <LoadingScreen />
      <CharacterPicker available={characters} />
    </div>
  );
}
