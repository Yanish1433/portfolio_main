"use client";

// Cinema mode, the HTML half: the full-screen demo video of a project, shown once the camera has
// flown into the stand's screen (CinemaCamera.tsx) or at once for a quick-open (no flight).
// - Close: the X button, Esc, or the phone/browser Back button. Opening pushes one history
//   entry; X and Esc call history.back(), and the popstate handler is the one close path.
// - The player itself is ProjectVideo.tsx (shared with Recruiter Mode).
// - HallQuickOpen: a small card with one "Open <project>" button per featured project, shown while
//   the avatar is in the Project Hall (same hysteresis as the camera framing), so nobody has to
//   zoom in on each stand.
import { useEffect, useMemo, useState } from "react";
import { leadFirst } from "@/content/showcase";
import type { Project } from "@/content/profile";
import { isTypingTarget, useWorld } from "@/store/world";
import { pickZone, type Ring } from "../cameraRig";
import { zones } from "../zones";
import { accentAt, HALL, LEAD_ID } from "./content";
import { posterUrl, videoUrl, type MediaFiles } from "./showcaseView";
import ProjectVideo, { type VideoProject } from "./ProjectVideo";

// ---------------------------------------------------------------- history: one close path

/** True while our history entry for the open video is on the stack. */
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

// ---------------------------------------------------------------- the video overlay

export function toVideoProject(p: Project, index: number, files: MediaFiles): VideoProject {
  return {
    id: p.id,
    name: p.name,
    tagline: p.pitch ?? p.tagline,
    disclaimer: p.disclaimer,
    video: videoUrl(p),
    poster: posterUrl(p, files),
    screenshots: p.media?.screenshots ?? [],
    liveUrl: p.liveUrl,
    repoUrl: p.repoUrl,
    accent: accentAt(index),
  };
}

function VideoLayer({ files }: { files: MediaFiles }) {
  const id = useWorld((s) => s.cinema);
  const ready = useWorld((s) => s.cinemaReady);
  const project = useMemo(() => {
    const index = HALL.projects.findIndex((p) => p.id === id);
    return index >= 0 ? toVideoProject(HALL.projects[index], index, files) : null;
  }, [id, files]);
  // an unknown id would leave the world locked: let go at once
  useEffect(() => {
    if (id && !project) useWorld.getState().closeCinema();
  }, [id, project]);
  if (!id || !ready || !project) return null;
  return <ProjectVideo key={project.id} project={project} onClose={requestCloseCinema} />;
}

// ---------------------------------------------------------------- hall quick-open card

const RINGS: Ring[] = zones.map((z) => ({ id: z.id, x: z.ring[0], z: z.ring[1] }));

/** True while the avatar is in the Project Hall (cameraRig's enter / exit radii, so it never flickers). */
function useInHall(): boolean {
  const [inHall, setInHall] = useState(false);
  useEffect(() => {
    let zone: string | null = null;
    const check = (pos: [number, number]) => {
      zone = pickZone(pos[0], pos[1], RINGS, zone);
      setInHall(zone === "project-hall");
    };
    check(useWorld.getState().position);
    return useWorld.subscribe((s, prev) => {
      if (s.position !== prev.position) check(s.position);
    });
  }, []);
  return inHall;
}

function HallQuickOpen() {
  const inHall = useInHall();
  const hidden = useWorld((s) => !!s.cinema || s.pickerOpen || !s.character || !s.loaded);
  const night = useWorld((s) => s.theme === "night");
  const list = useMemo(() => {
    const featured = HALL.projects.filter((p) => p.featured);
    return leadFirst(featured.length ? featured : HALL.projects, LEAD_ID);
  }, []);
  if (!inHall || hidden || !list.length) return null;
  const palette = night ? "border-[#c9a227] bg-[#2a1c22]/90 text-[#f8e9cc]" : "border-[#9c3b22] bg-[#fff8ec]/95 text-[#3a2419]";
  return (
    <nav
      aria-label="Project videos"
      className={`pointer-events-auto absolute left-3 right-3 top-[4.25rem] z-20 flex flex-col gap-1.5 rounded-2xl border-2 p-2 shadow-lg backdrop-blur sm:left-4 sm:right-auto sm:top-20 sm:max-w-[16rem] sm:p-3 ${palette}`}
      style={{ fontFamily: "Mukta, system-ui, sans-serif" }}
    >
      <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">Project Hall · watch a demo</p>
      <div className="flex flex-wrap gap-1.5 sm:flex-col">
        {list.map((p) => (
          <button
            key={p.id}
            type="button"
            data-open-project={p.id}
            onClick={() => {
              const w = useWorld.getState();
              w.interrupt();
              w.openCinema(p.id, false);
            }}
            className={`rounded-full px-3.5 py-1.5 text-left text-sm font-semibold transition focus:outline-none focus-visible:ring-2 ${
              night ? "bg-[#c9a227] text-[#2a1c22] hover:bg-[#e0b83a] focus-visible:ring-[#f3d98a]" : "bg-[#9c3b22] text-white hover:bg-[#b5482c] focus-visible:ring-[#c9a227]"
            }`}
          >
            Open {p.name}
          </button>
        ))}
      </div>
    </nav>
  );
}

/** Always mounted (Overlay): owns the history entry, the quick-open card and the video overlay. */
export default function CinemaMode({ files }: { files: MediaFiles }) {
  useCinemaHistory();
  // Esc closing is ProjectVideo's job; this keeps typing in the chat from being hijacked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isTypingTarget(e) && useWorld.getState().cinema && !useWorld.getState().cinemaReady) requestCloseCinema();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <HallQuickOpen />
      <VideoLayer files={files} />
    </>
  );
}
