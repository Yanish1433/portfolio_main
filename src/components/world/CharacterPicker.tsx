"use client";

import { useEffect, useRef, useState } from "react";
import { CHARACTERS, type CharacterId } from "./characters";
import { LABELS } from "./nepal/labels";
import { savedCharacter, useWorld } from "@/store/world";

/**
 * Character picker: a radiogroup of three cards (arrows move, Enter/Space or click
 * picks). Opens after the loading screen on a first visit, or from "Change character".
 */
export default function CharacterPicker({ available }: { available: CharacterId[] }) {
  const loaded = useWorld((s) => s.loaded);
  const open = useWorld((s) => s.pickerOpen);
  const current = useWorld((s) => s.character);
  const theme = useWorld((s) => s.theme);
  const list = CHARACTERS.filter((c) => available.includes(c.id));
  const [focus, setFocus] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);

  // First visit: restore a saved choice, else open the picker once the loading screen has faded.
  useEffect(() => {
    if (!loaded) return;
    const st = useWorld.getState();
    if (st.character) return;
    const saved = savedCharacter(available);
    if (saved) {
      st.setCharacter(saved, false);
      return;
    }
    if (list.length === 0) return;
    const t = window.setTimeout(() => useWorld.getState().setPickerOpen(true), 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Move focus into the group when it opens (on the current choice, if any).
  useEffect(() => {
    if (!open) return;
    setLeaving(false);
    const i = Math.max(0, list.findIndex((c) => c.id === current));
    setFocus(i);
    requestAnimationFrame(() => cards.current[i]?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || list.length === 0) return null;
  const night = theme === "night";
  const reopen = current !== null;

  const choose = (id: CharacterId) => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => useWorld.getState().setCharacter(id), 280);
  };
  const close = () => useWorld.getState().setPickerOpen(false);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Keep arrows/Enter away from the world's movement keys.
    e.stopPropagation();
    const n = list.length;
    let next = focus;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (focus + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (focus - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape" && reopen) {
      e.preventDefault();
      close();
      return;
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(list[focus].id);
      return;
    } else return;
    e.preventDefault();
    setFocus(next);
    cards.current[next]?.focus();
  };

  return (
    <div
      className={`pointer-events-auto absolute inset-0 z-40 flex items-center justify-center overflow-y-auto p-4 transition-opacity duration-300 ${
        leaving ? "opacity-0" : "opacity-100"
      } ${night ? "bg-[#120c14]/70" : "bg-[#3a2016]/45"}`}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <div
        className={`picker-in my-auto w-full max-w-4xl rounded-3xl border-2 p-5 shadow-2xl sm:p-7 ${
          night ? "border-[#c9a227]/70 bg-[#2a1c22]/95 text-[#f8e9cc]" : "border-[#9c3b22]/60 bg-[#fff4e2]/95 text-[#3a2419]"
        }`}
        style={{
          backgroundImage: night
            ? "repeating-linear-gradient(45deg, rgba(201,162,39,0.06) 0 2px, transparent 2px 14px), repeating-linear-gradient(-45deg, rgba(201,162,39,0.06) 0 2px, transparent 2px 14px)"
            : "repeating-linear-gradient(45deg, rgba(156,59,34,0.06) 0 2px, transparent 2px 14px), repeating-linear-gradient(-45deg, rgba(156,59,34,0.06) 0 2px, transparent 2px 14px)",
        }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="picker-title" className="text-2xl font-semibold sm:text-3xl" style={{ fontFamily: "Mukta, sans-serif" }}>
              {LABELS.picker.title}
            </h2>
            <p lang="ne" className="text-base opacity-80" style={{ fontFamily: "Mukta, sans-serif" }}>
              {LABELS.picker.ne}
            </p>
          </div>
          {reopen && (
            <button
              type="button"
              onClick={close}
              aria-label="Close (Escape)"
              className={`rounded-full px-3 py-1 text-sm font-medium transition focus:outline-none focus-visible:ring-2 ${
                night ? "bg-white/10 hover:bg-white/20 focus-visible:ring-[#c9a227]" : "bg-[#9c3b22]/10 hover:bg-[#9c3b22]/20 focus-visible:ring-[#9c3b22]"
              }`}
            >
              ✕
            </button>
          )}
        </div>
        <div
          role="radiogroup"
          aria-labelledby="picker-title"
          className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible"
        >
          {list.map((c, i) => {
            const selected = c.id === current;
            return (
              <button
                key={c.id}
                ref={(el) => {
                  cards.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={i === focus ? 0 : -1}
                onFocus={() => setFocus(i)}
                onClick={() => choose(c.id)}
                className={`group flex w-[72vw] max-w-[260px] shrink-0 snap-center flex-col overflow-hidden rounded-2xl border-2 text-left transition duration-200 ease-out hover:scale-[1.04] focus:outline-none focus-visible:scale-[1.04] sm:w-auto sm:max-w-none motion-reduce:transition-none motion-reduce:hover:scale-100 ${
                  night
                    ? `bg-[#1d141a] ${selected ? "border-[#e5c158]" : "border-[#c9a227]/30"} hover:border-[#e5c158] focus-visible:border-[#e5c158] focus-visible:ring-4 focus-visible:ring-[#c9a227]/40`
                    : `bg-[#fffaf1] ${selected ? "border-[#c9a227]" : "border-[#9c3b22]/25"} hover:border-[#c9a227] focus-visible:border-[#c9a227] focus-visible:ring-4 focus-visible:ring-[#c9a227]/40`
                }`}
              >
                <span
                  className="relative block aspect-square w-full"
                  style={{ background: night ? "radial-gradient(circle at 50% 40%, #4a3036, #1a1216)" : "radial-gradient(circle at 50% 40%, #f6d9b0, #b5643f)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.preview} alt="" width={384} height={384} className="h-full w-full object-cover" loading="eager" decoding="async" />
                  {selected && (
                    <span className="absolute right-2 top-2 rounded-full bg-[#c9a227] px-2 py-0.5 text-xs font-semibold text-[#2a1c22]">
                      Current
                    </span>
                  )}
                </span>
                <span className="block p-3">
                  <span className="block text-lg font-semibold leading-tight" style={{ fontFamily: "Mukta, sans-serif" }}>
                    {c.title} <span className="opacity-60">·</span>{" "}
                    <span lang="ne" className={night ? "text-[#e5c158]" : "text-[#9c3b22]"}>
                      {c.labelNe}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm opacity-80">{c.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs opacity-70">
          <span className="[@media(pointer:coarse)]:hidden">Arrow keys to browse, Enter to choose. </span>You can change this any time.
        </p>
      </div>
    </div>
  );
}
