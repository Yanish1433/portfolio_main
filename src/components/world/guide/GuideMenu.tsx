"use client";

// Top-bar "Go to…" menu (golden footprints), the "Quick tour" button and the little "Walk me there" chip.
import { useEffect, useRef, useState } from "react";
import { useWorld } from "@/store/world";
import { playerPos, worldControl } from "../input";
import { startQuickTour } from "../robot/actions";
import { arrivedAt } from "./footprints";
import { cardClass, pillClass } from "../ui/lokta";
import { SECTIONS, sectionTarget, type Section } from "./sections";

const pill = pillClass("h-11 min-w-11 justify-center sm:h-10");

export default function GuideMenu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const guide = useWorld((s) => s.guide);
  const tourActive = useWorld((s) => s.tourActive);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
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

  const pick = (s: Section) => {
    setOpen(false);
    const t = sectionTarget(s);
    const w = useWorld.getState();
    if (!t) return;
    if (arrivedAt(playerPos.x, playerPos.z, t.to, t.radius)) {
      w.showToast(`You're already at ${s.label}`);
      return;
    }
    w.interrupt(); // choosing is visitor input: it ends a tour
    w.setGuide({ id: s.id, label: s.label, to: t.to, radius: t.radius });
  };

  const walk = () => {
    const w = useWorld.getState();
    if (!w.guide) return;
    w.interrupt();
    if (!worldControl.walkTo?.(w.guide.to[0], w.guide.to[1])) w.showToast("Can't walk from this view: leave Eagle view first");
  };

  return (
    <div ref={box} className="relative flex items-center gap-2">
      <button
        type="button"
        className={pill}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Go to a section"
        title="Go to a section"
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">👣</span>
        <span className="hidden sm:inline">Go to…</span>
      </button>
      {tourActive ? (
        <button type="button" className={`${pill} !bg-none !bg-[#8f3320]`} onClick={() => useWorld.getState().interrupt()} aria-label="Stop tour">
          <span aria-hidden="true">■</span>
          <span className="hidden sm:inline">Stop tour</span>
        </button>
      ) : (
        <button type="button" className={pill} onClick={startQuickTour} aria-label="Quick tour, about one minute" title="Quick tour (about 1 minute)">
          <span aria-hidden="true">🧭</span>
          <span className="hidden sm:inline">Quick tour</span>
        </button>
      )}
      {open && (
        <ul role="menu" aria-label="Go to" className={cardClass("pointer-events-auto absolute left-0 top-12 z-30 min-w-44 !border-4 p-1 text-sm")}>
          {SECTIONS.filter((s) => sectionTarget(s)).map((s) => (
            <li key={s.id} role="none">
              <button type="button" role="menuitem" onClick={() => pick(s)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition hover:bg-[#c9a227]/30">
                <span aria-hidden="true">{s.icon}</span>
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {guide && !open && (
        <div role="status" className="pointer-events-auto absolute left-0 top-12 flex items-center gap-1.5 whitespace-nowrap rounded-lg border-2 border-[#c9a227] bg-[#3e2416] py-1 pl-3 pr-1 text-sm text-[#fbe9b7] shadow">
          <span>Path to {guide.label}</span>
          <button type="button" onClick={walk} className="rounded-full bg-[#c9a227] px-3 py-1 text-xs font-semibold text-[#3a2419] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
            Walk me there
          </button>
          <button type="button" onClick={() => useWorld.getState().setGuide(null)} aria-label="Hide the path" className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
