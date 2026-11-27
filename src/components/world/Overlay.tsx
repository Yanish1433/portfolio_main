"use client";

import { useEffect, useMemo, useState } from "react";
import { worldControl } from "./input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useProgress } from "@react-three/drei";
import { profile } from "@/content/profile";
import { ABOUT_INFO, CONTACT_INFO, isTypingTarget, useWorld } from "@/store/world";
import { AboutLogic, GharHint } from "./about/AboutLogic";
import { ContactLogic } from "./ContactLogic";
import { ctaState } from "./about/aboutView";
import { runAction } from "./robot/actions";
import { eduLine, NEXT_MILESTONE_TEXT } from "@/lib/robot/journey";
import { JOURNEY } from "./journey";
import { zoneById } from "./zones";
import { LABELS } from "./nepal/labels";
import { NAVIGATE_EVENT } from "./nepal/navigate";
import type { CharacterId } from "./characters";
import CharacterInit from "./CharacterInit";
import RobotChat, { Toast } from "./robot/RobotChat";
import Joystick from "./Joystick";
import InfoPanel from "./halls/InfoPanel";
import CinemaMode from "./halls/CinemaMode";
import { DALAN } from "./halls/layout";
import { HALL } from "./halls/content";
import { courseInfo, defaultInfo, projectInfo, visitByVisitor } from "./halls/visit";
import { EASELS, SCROLL } from "./halls/layout";
import type { InfoRef } from "@/store/world";
import GuideMenu from "./guide/GuideMenu";
import GuestbookButton from "./guestbook/GuestbookUi";
import { btnClass, cardClass, pillClass, rowClass } from "./ui/lokta";
import { WheelCard, SkillFilterBar, WheelHint } from "./wheels/WheelUi";

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
  // the wheel card (hover / walk-up / chosen) takes the zone card's place
  const wheelCard = useWorld((s) => s.wheelHover !== null || s.wheelNear !== null || s.wheelSelected !== null);
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
      } else if (id === "mailbox") {
        const st = useWorld.getState();
        if (st.info?.kind === "contact") st.closeInfo(true);
        else {
          st.clearInfoDismissed();
          st.openInfo(CONTACT_INFO);
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
  if (!zone || infoOpen || wheelCard) return null;
  const content = zoneContent(zone.id);
  const isKiosk = zone.id === "kiosk";
  const isAbout = zone.id === "about";
  const button =
    btnClass(true, "pointer-events-auto");

  return (
    <div className="pointer-events-none flex w-full justify-center">
      <div
        className={cardClass("pointer-events-auto box-border w-full max-w-[min(28rem,calc(100vw-32px))] min-w-0 [overflow-wrap:anywhere] p-4")}
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
            className={btnClass(true, "pointer-events-auto mt-3 w-full !justify-start !text-left")}
            onClick={() => runAction({ type: "walkTo", zone: "mailbox" })}
          >
            {NEXT_MILESTONE_TEXT}
            <span className="block text-xs font-normal opacity-85">Tap to walk to the mailbox and send a message</span>
          </button>
        )}
        {panelOpen && content.lines.length > 0 && (
          <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-sm">
            {content.lines.map((l, i) => {
              const focused = !!focusProject && content.ids?.[i] === focusProject;
              const ref = content.refs?.[i];
              const look = rowClass(focused ? "!bg-[#c9a227]/30 font-semibold ring-2 ring-[#c9a227]" : "");
              return ref ? (
                <li key={i}>
                  <button
                    type="button"
                    className={`${look} w-full text-left transition`}
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
            <Link href={RECRUITER_HREF} className={button}>
              Open Recruiter mode
            </Link>
          ) : isAbout ? (
            <button type="button" className={button} onClick={() => { useWorld.getState().clearInfoDismissed(); useWorld.getState().openInfo(ABOUT_INFO); }}>
              Meet {profile.name.split(" ")[0]}
            </button>
          ) : content.lines.length > 0 ? (
            <button type="button" className={button} onClick={() => setPanelOpen(!panelOpen)}>
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
      <p className="rounded-lg border-2 border-[#c9a227] bg-[#3e2416] px-4 py-2 text-sm text-[#fbe9b7] shadow">
        Click anywhere to walk
        <span className="hidden [@media(pointer:coarse)]:inline"> · or use the joystick</span>
        <span className="[@media(pointer:coarse)]:hidden"> · WASD / arrows to run, Shift to walk</span>
      </p>
    </div>
  );
}

const CAM_HINT_KEY = "world-cam-hint";
const CAM_HINT_MS = 6000;

/** Once per session, a few seconds after the visitor can play: how to look around. */
function CameraHint() {
  const [show, setShow] = useState(false);
  const ready = useWorld((s) => s.loaded && !!s.character && !s.pickerOpen && !s.cinema);
  useEffect(() => {
    if (!ready) return;
    try {
      if (window.sessionStorage.getItem(CAM_HINT_KEY)) return;
      window.sessionStorage.setItem(CAM_HINT_KEY, "1");
    } catch {
      /* storage blocked: it just shows again next load */
    }
    let hide = 0;
    const start = window.setTimeout(() => {
      setShow(true);
      hide = window.setTimeout(() => setShow(false), CAM_HINT_MS);
    }, 2500);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(hide);
    };
  }, [ready]);
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-[7.5rem] z-10 flex justify-center px-4 transition-opacity duration-700 sm:top-16 ${show ? "opacity-100" : "opacity-0"}`}
      aria-hidden={!show}
    >
      <p className="rounded-lg border-2 border-[#c9a227] bg-[#3e2416] px-4 py-2 text-sm text-[#fbe9b7] shadow" role="status">
        <span className="hidden [@media(pointer:coarse)]:inline">Two fingers to turn and zoom</span>
        <span className="[@media(pointer:coarse)]:hidden">Drag to look around · scroll to zoom</span>
      </p>
    </div>
  );
}

/** Back to the default wide view (also the R key). Only shown while the camera is somewhere else. */
function ResetViewButton() {
  const custom = useWorld((s) => s.viewCustom);
  const eagle = useWorld((s) => s.cameraMode === "eagle");
  if (!custom && !eagle) return null;
  return (
    <button
      type="button"
      onClick={() => worldControl.resetView?.()}
      aria-label="Reset view (R)"
      title="Reset view (R)"
      className={pillClass("h-10")}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 12a8 8 0 1 0 2.5-5.8" />
        <path d="M4 4v4.5h4.5" />
      </svg>
      <span className="hidden sm:inline">Reset view</span>
    </button>
  );
}

/** Sky view of the whole island (also the V key); click again to come back down. */
function EagleViewButton() {
  const eagle = useWorld((s) => s.cameraMode === "eagle");
  const toggle = useWorld((s) => s.toggleEagle);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Eagle view (V)"
      aria-pressed={eagle}
      title="Eagle view (V)"
      className={pillClass(`h-11 min-w-11 justify-center sm:h-10 ${eagle ? "!brightness-150" : ""}`)}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 9c3-1 6 0 10 5 4-5 7-6 10-5-1 5-4 8-10 9-6-1-9-4-10-9z" />
      </svg>
      <span className="hidden sm:inline">Eagle view</span>
    </button>
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
      <p className="max-w-[min(34rem,calc(100vw-32px))] rounded-lg border-2 border-[#c9a227] bg-[#3e2416] px-4 py-2 text-center text-sm text-[#fbe9b7] shadow" role="status">
        Walk up to a screen to see a project. Tap <strong className="font-semibold text-[#ffe08a]">Watch demo</strong> to see it full screen.
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
      className={pillClass("h-10 w-10 !px-0 justify-center")}
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
  pillClass("h-10");

/** Dance emote (also the G key). */
function AvatarControls() {
  const character = useWorld((s) => s.character);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyG" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e)) return;
      const st = useWorld.getState();
      if (st.character && !st.pickerOpen) st.dance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!character) return null;
  return (
    <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
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
      <GuideMenu />
      <GuestbookButton />
    </div>
  );
}

export default function Overlay({ characters, thumbs = [], posters = [], aboutPhoto = null }: { characters: CharacterId[]; thumbs?: string[]; posters?: string[]; aboutPhoto?: string | null }) {
  const files = useMemo(() => ({ thumbs: new Set(thumbs), showcasePosters: new Set(posters) }), [thumbs, posters]);
  const cinema = useWorld((s) => !!s.cinema);
  const eagleMode = useWorld((s) => s.cameraMode === "eagle");
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* The world HUD steps aside while a project video is open: invisible (so out of the tab order
          and the accessibility tree) but still mounted, so focus can return to "Watch demo". */}
      <div className={cinema ? "invisible contents" : "contents"} aria-hidden={cinema || undefined}>
      <Hint />
      <HallHint />
      <CameraHint />
      <GharHint />
      <AboutLogic />
      <ContactLogic />
      <WheelHint />
      <SkillFilterBar />
      <AvatarControls />
      <Toast />
      {/* Bottom dock: zone card above the robot chat; on touch screens it sits above the joystick. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 p-4 pb-5 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] [@media(pointer:coarse)]:pb-[calc(168px+env(safe-area-inset-bottom))]">
        <ZoneCard />
        <InfoPanel aboutPhoto={aboutPhoto} />
        <WheelCard />
        <RobotChat />
      </div>
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        <EagleViewButton />
        <ResetViewButton />
        <ThemeToggle />
        <Link
          href={RECRUITER_HREF}
          className={pillClass()}
        >
          Recruiter mode
        </Link>
      </div>
      {!cinema && !eagleMode && <Joystick />}
      </div>
      <CinemaMode files={files} />
      <LoadingScreen />
      <CharacterInit available={characters} />
    </div>
  );
}
