"use client";

// The prayer-wheel gallery's HTML (not drei <Html>: 0 draw calls): the wheel card, the filter chips and the
// first-visit hint. The card shows what you point at (mouse hover), what you stand next to, or the wheel you
// chose; a chosen wheel lists the group's skills with plain levels and the projects that used any of them,
// each a button that walks to that stand.
import { useEffect, useState } from "react";
import { useWorld } from "@/store/world";
import { GALLERY } from "../zones";
import { projectInfo, visitByVisitor } from "../halls/visit";
import { chooseWheel } from "./choose";
import { WHEEL_PROJECTS, WHEELS } from "./wheelData";
import { FILTERS, plainGroupName, strengthWord, wheelSummary } from "./wheelLayout";
import { NO_PROJECT_LINE, WHEEL_HINT } from "./wheelCopy";
import { THREAD_SECONDS } from "./threads";
import { btnClass, cardClass, chipClass, rowClass } from "../ui/lokta";

/** The avatar is "in the skills zone" within this distance of the gallery's middle. */
const ZONE_R = 9;
const HINT_R = 8.5;
const HINT_MS = 9000;

const inGallery = (p: [number, number], r: number) => Math.hypot(p[0] - GALLERY.x, p[1] - (GALLERY.z + 1.6)) < r;

const STRENGTH_STYLE: Record<string, string> = {
  Strong: "bg-[#2f8f5a] text-white",
  Good: "bg-[#c9a227] text-[#3a2a10]",
  Learning: "bg-[#8aa7c9] text-[#1d2e45]",
};

const button = btnClass(true, "pointer-events-auto !min-h-9 !px-4 !py-1");

export function WheelCard() {
  const night = useWorld((s) => s.theme === "night");
  const hover = useWorld((s) => s.wheelHover);
  const near = useWorld((s) => s.wheelNear);
  const selected = useWorld((s) => s.wheelSelected);
  const selectedAt = useWorld((s) => s.wheelSelectedAt);
  const hidden = useWorld((s) => !!s.info || !!s.cinema || s.pickerOpen);
  // the threads fade after THREAD_SECONDS; the card offers to draw them again
  const [threadsOn, setThreadsOn] = useState(true);
  useEffect(() => {
    setThreadsOn(true);
    const t = window.setTimeout(() => setThreadsOn(false), THREAD_SECONDS * 1000);
    return () => window.clearTimeout(t);
  }, [selected, selectedAt]);

  // pointing at a wheel wins over the chosen one; standing next to one comes last
  const shown = hover ?? selected ?? near;
  if (hidden || shown === null || !WHEELS[shown]) return null;
  const wheel = WHEELS[shown];
  const projects = WHEEL_PROJECTS[shown];
  const chosen = shown === selected && hover === null;
  const pointing = hover !== null;
  const name = plainGroupName(wheel.category, wheel.groupLabel);

  return (
    <div className="pointer-events-none flex w-full justify-center">
      <div
        className={cardClass("pointer-events-auto box-border max-h-[58vh] w-full max-w-[min(26rem,calc(100vw-32px))] min-w-0 overflow-y-auto [overflow-wrap:anywhere] p-4")}
        data-night={night}
        role="region"
        aria-label={`Skills: ${name}`}
        data-wheel-card={chosen ? "chosen" : pointing ? "hover" : "near"}
      >
        <div className="flex items-start gap-3">
          <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-white" style={{ background: wheel.colour }} />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold leading-snug text-[#8f3320]">{name}</p>
            <p className="mt-1 text-xs opacity-75">{wheelSummary(wheel.skills.length, projects.length)}</p>
          </div>
          {chosen && (
            <button
              type="button"
              className="pointer-events-auto -mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg leading-none opacity-70 transition hover:bg-black/5 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9c3b22]"
              onClick={() => chooseWheel(null)}
              aria-label="Close skills card"
            >
              ✕
            </button>
          )}
        </div>

        {chosen ? (
          <div className="mt-3">
            <ul className="space-y-1" aria-label="Skills in this group">
              {wheel.skills.map((s) => {
                const strength = strengthWord(s.level);
                return (
                  <li key={s.name} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 font-semibold">{s.display ?? s.name}</span>
                    {s.years !== undefined && s.years > 0 && <span className="text-xs opacity-70">{s.years === 1 ? "1 year" : `${s.years} years`}</span>}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STRENGTH_STYLE[strength]}`}>{strength}</span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 border-t border-black/10 pt-3">
              {projects.length === 0 ? (
                <p className="text-sm opacity-85">{NO_PROJECT_LINE}</p>
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Where I used them</p>
                  <ul className="mt-1.5 space-y-1">
                    {projects.map((p) => {
                      const ref = projectInfo(p.id);
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            disabled={!ref}
                            className={rowClass("pointer-events-auto w-full text-left text-sm disabled:opacity-60")}
                            onClick={() => ref && visitByVisitor(ref)}
                          >
                            <span className="font-semibold">{p.name}</span>
                            <span className="opacity-75">: {p.tagline}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {!threadsOn && (
                    <button type="button" className={`${button} mt-2`} onClick={() => chooseWheel(shown)}>
                      Show the threads again
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ) : pointing ? (
          <p className="mt-2 text-xs opacity-75">Click to spin it and see the skills.</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className={button} onClick={() => chooseWheel(shown)}>
              Spin it
            </button>
            <span className="text-xs opacity-70 [@media(pointer:coarse)]:hidden">
              or press <kbd className="rounded bg-black/10 px-1.5">E</kbd>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** All / Frontend / Backend / ...: dims the other wheels. Shown while the avatar is in the skills zone. */
export function SkillFilterBar() {
  const filter = useWorld((s) => s.skillFilter);
  const set = useWorld((s) => s.setSkillFilter);
  const here = useWorld((s) => !!s.character && !s.pickerOpen && inGallery(s.position, ZONE_R));
  const present = new Set(WHEELS.map((w) => w.category));
  const chips = FILTERS.filter((f) => f.id === "all" || present.has(f.id));
  if (!WHEELS.length || chips.length < 3) return null;
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-32 z-10 flex justify-center px-4 transition-opacity duration-300 sm:top-[5.5rem] ${here ? "opacity-100" : "opacity-0"}`}
      aria-hidden={!here}
    >
      <div role="group" aria-label="Show a group of skills" className="flex max-w-[min(34rem,calc(100vw-32px))] flex-wrap justify-center gap-1.5">
        {chips.map((f) => {
          const on = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              tabIndex={here ? 0 : -1}
              aria-pressed={on}
              onClick={() => set(f.id)}
              className={chipClass(`${here ? "pointer-events-auto" : ""} cursor-pointer shadow ${on ? "!bg-[#3e2416] !text-[#fbe9b7] !border-[#c9a227]" : ""}`)}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** First time the avatar reaches the gallery: one short line on how the wheels work. */
export function WheelHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let done = false;
    let timer = 0;
    const unsub = useWorld.subscribe((s) => {
      if (done || !s.character || s.pickerOpen || !inGallery(s.position, HINT_R)) return;
      done = true;
      setShow(true);
      timer = window.setTimeout(() => setShow(false), HINT_MS);
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
        {WHEEL_HINT}
      </p>
    </div>
  );
}
