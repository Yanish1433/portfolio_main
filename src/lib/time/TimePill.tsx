"use client";

// A small clock pill + slider for pages without the 3D store. Same look as the town's dial (book kit pill)
// and the same saved "world-time" key. It writes data-theme and --glow on the nearest [data-time-root].
import { useEffect, useRef, useState } from "react";
import { pillClass } from "@/components/book";
import { QUICK_TIMES, formatTime, timeIcon } from "@/components/world/nepal/timeLook";
import { applyClock, readMinutes, saveMinutes } from "./clock";

export default function TimePill({ className }: { className?: string }) {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const host = () => root.current?.closest<HTMLElement>("[data-time-root]") ?? null;

  useEffect(() => {
    const m = readMinutes();
    setMinutes(m);
    applyClock(host(), m);
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

  const set = (m: number, persist: boolean | "now" = false) => {
    setMinutes(m);
    applyClock(host(), m);
    if (persist) saveMinutes(persist === "now" ? null : m);
  };
  const now = () => {
    const d = new Date();
    set(d.getHours() * 60 + d.getMinutes(), "now");
  };
  const m = minutes ?? 720;

  return (
    <div ref={root} className={`relative ${className ?? ""}`} onKeyDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Time of day, ${formatTime(m)}. Change it`}
        title="Time of day"
        className={pillClass("h-10 gap-1.5")}
      >
        <span aria-hidden="true">{timeIcon(m)}</span>
        <span className="tabular-nums" suppressHydrationWarning>
          {minutes === null ? "Time" : formatTime(m)}
        </span>
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
            value={m}
            autoFocus
            aria-label="Time of day in minutes"
            aria-valuetext={formatTime(m)}
            className="w-full accent-[#ffe08a]"
            onChange={(e) => set(Number(e.target.value))}
            onPointerUp={(e) => set(Number((e.target as HTMLInputElement).value), true)}
            onBlur={(e) => set(Number(e.target.value), true)}
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
