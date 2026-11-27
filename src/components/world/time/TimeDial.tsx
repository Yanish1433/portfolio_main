"use client";

// Time-of-day control: a pill showing the time; click it for a minute slider + quick chips.
// Dragging updates the world live (themeState.minutes is read per frame); the choice is saved on release.
import { useEffect, useRef, useState } from "react";
import { isTypingTarget, useWorld } from "@/store/world";
import { QUICK_TIMES, formatTime, timeIcon } from "../nepal/timeLook";
import { pillClass } from "@/components/book";

const STEP = 15;

export default function TimeDial() {
  const minutes = useWorld((s) => s.minutes);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // N still flips day/night
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyN" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e)) return;
      useWorld.getState().toggleTheme();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const set = (m: number, persist: boolean | "now" = false) => useWorld.getState().setMinutes(m, persist);
  const now = () => {
    const d = new Date();
    set(d.getHours() * 60 + d.getMinutes(), "now");
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Time of day, ${formatTime(minutes)}. Change it (N: day or night)`}
        title="Time of day (N)"
        className={pillClass("h-10 gap-1.5")}
      >
        <span aria-hidden="true">{timeIcon(minutes)}</span>
        <span className="tabular-nums">{formatTime(minutes)}</span>
      </button>
      {open && (
        <div
          role="group"
          aria-label="Time of day"
          className="absolute right-0 top-12 z-30 w-[min(18rem,calc(100vw-32px))] rounded-lg border-2 border-[#c9a227] bg-[#3e2416] p-3 text-[#fbe9b7] shadow-lg"
        >
          <input
            type="range"
            min={0}
            max={1439}
            step={1}
            value={minutes}
            autoFocus
            aria-label="Time of day in minutes"
            aria-valuetext={formatTime(minutes)}
            className="w-full accent-[#ffe08a]"
            onChange={(e) => set(Number(e.target.value))}
            onPointerUp={(e) => set(Number((e.target as HTMLInputElement).value), true)}
            onBlur={(e) => set(Number(e.target.value), true)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
              e.preventDefault();
              e.stopPropagation(); // the avatar must not walk
              const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : -1;
              set(useWorld.getState().minutes + dir * STEP, true);
            }}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK_TIMES.map((q) => (
              <button key={q.id} type="button" className={pillClass("h-8 text-xs")} onClick={() => set(q.minutes, true)}>
                {q.label}
              </button>
            ))}
            <button type="button" className={pillClass("h-8 text-xs")} onClick={now}>
              Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
