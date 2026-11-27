"use client";

// The mini-map: a round hand-inked map of the town on lokta paper in a carved-wood ring (corner, under the pill row),
// with a red "you are here" arrow, click-a-zone-to-walk (the "Go to…" golden footprints) and a big map on M.
// The static art is drawn once; the arrow is moved ~10x a second straight on its SVG node (no React renders).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isTypingTarget, useWorld } from "@/store/world";
import { avatarMotion, playerPos } from "../input";
import { FLY_IN_SECS } from "../cameraRig";
import MapArt from "./MapArt";
import { ZONE_TARGETS, type ZoneTarget } from "./mapData";
import { goToSection } from "./goTo";
import { arrowDegrees, hitZone, mapHidden, worldToMap } from "./mapMath";

const TICK_MS = 100; // ~10 fps
const PHONE = "(max-width: 640px)";
const subPhone = (cb: () => void) => {
  const m = window.matchMedia(PHONE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const usePhone = () => useSyncExternalStore(subPhone, () => window.matchMedia(PHONE).matches, () => false);

/** One round map. `big` shows every zone name; the small one shows the hovered / focused name in a caption. */
function MapView({ big, onExpand }: { big: boolean; onExpand?: () => void }) {
  const arrow = useRef<SVGGElement>(null);
  const [named, setNamed] = useState<ZoneTarget | null>(null);
  const isNight = useWorld((s) => s.theme === "night");

  useEffect(() => {
    let last = "";
    const tick = () => {
      if (document.hidden || !arrow.current) return;
      const [x, y] = worldToMap(playerPos.x, playerPos.z);
      const t = `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${arrowDegrees(avatarMotion.heading).toFixed(0)})`;
      if (t === last) return;
      last = t;
      arrow.current.setAttribute("transform", t);
    };
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const svgPoint = (e: React.PointerEvent | React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 200, ((e.clientY - r.top) / r.height) * 200] as const;
  };

  return (
    <div
      className="relative aspect-square w-full select-none overflow-hidden rounded-full"
      style={{
        background: `${isNight ? "#e6d6b2" : "#f6ead0"} url(/textures/ui/lokta-paper.png) repeat`,
        border: `${big ? 8 : 5}px solid #3e2416`,
        boxShadow: `inset 0 0 0 1.5px rgba(229,193,88,0.6), 0 0 0 1.5px #1f120a, 0 6px 16px rgba(0,0,0,0.45)${isNight ? ", 0 0 24px rgba(255,183,77,0.35)" : ""}`,
      }}
      onPointerMove={(e) => {
        const [px, py] = svgPoint(e);
        const h = hitZone(px, py, ZONE_TARGETS, 16);
        setNamed((p) => (p === h ? p : h));
      }}
      onPointerLeave={() => setNamed(null)}
      onClick={(e) => {
        const [px, py] = svgPoint(e);
        const h = hitZone(px, py, ZONE_TARGETS, 14);
        if (h) goToSection(h.section);
      }}
    >
      <MapArt />
      <svg viewBox="0 0 200 200" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" focusable="false">
        <g ref={arrow} transform="translate(100 100)">
          <path d="M0 -9 L6 7 L0 3.5 L-6 7 Z" fill="#c0392b" stroke="#2b1d14" strokeWidth="1.2" strokeLinejoin="round" />
        </g>
      </svg>
      {ZONE_TARGETS.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-label={`Go to ${t.name}`}
          title={t.name}
          onClick={(e) => {
            e.stopPropagation();
            goToSection(t.section);
          }}
          onFocus={() => setNamed(t)}
          onBlur={() => setNamed((p) => (p === t ? null : p))}
          className={`pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c0392b] ${
            named?.id === t.id ? "ring-2 ring-[#c9a227]" : ""
          } ${big ? "h-8 w-8" : "h-[18px] w-[18px] min-[641px]:h-[22px] min-[641px]:w-[22px]"}`}
          style={{ left: `${(t.x / 200) * 100}%`, top: `${(t.y / 200) * 100}%` }}
        >
          {big && (
            <span
              className="pointer-events-none absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-[#f6ead0]/90 px-1.5 text-[13px] font-semibold leading-tight text-[#2b1d14] ring-1 ring-[#3e2416]/50"
              style={{ fontFamily: "Kalam, Mukta, system-ui, cursive" }}
            >
              {t.name}
            </span>
          )}
        </button>
      ))}
      {!big && named && (
        <span className="pointer-events-none absolute inset-x-0 bottom-[10%] mx-auto w-fit max-w-[90%] truncate rounded bg-[#3e2416] px-1.5 text-[11px] leading-tight text-[#fbe9b7]" role="status">
          {named.name}
        </span>
      )}
      {onExpand && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onExpand();
          }}
          aria-label="Open the big map (M)"
          title="Big map (M)"
          className="pointer-events-auto absolute bottom-[6%] right-[6%] flex h-[22px] w-[22px] items-center justify-center rounded-full border border-[#1f120a] bg-[#3e2416] p-0 text-[#f3d98a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
          </svg>
        </button>
      )}
    </div>
  );
}

function BigMap({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("button")?.focus();
    return () => back?.focus?.();
  }, []);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    } else if (e.key === "Tab" && box.current) {
      const items = [...box.current.querySelectorAll<HTMLElement>("button")];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/45" onClick={onClose}>
      <div ref={box} role="dialog" aria-modal="true" aria-label="Map of the town" onKeyDown={onKey} onClick={(e) => e.stopPropagation()} className="relative" style={{ width: "min(70vmin, 94vw)" }}>
        <MapView big />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the map (Esc)"
          title="Close (Esc)"
          className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#c9a227] bg-[#3e2416] text-lg leading-none text-[#fbe9b7] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function MiniMap() {
  const loaded = useWorld((s) => s.loaded);
  const character = useWorld((s) => !!s.character);
  const pickerOpen = useWorld((s) => s.pickerOpen);
  const cinema = useWorld((s) => !!s.cinema);
  const cameraMode = useWorld((s) => s.cameraMode);
  const bookOpen = useWorld((s) => !!s.info);
  const big = useWorld((s) => s.minimapBig);
  const setBig = useWorld((s) => s.setMinimapBig);
  const phone = usePhone();
  const [intro, setIntro] = useState(true);

  // the first-visit fly-in has no store flag: wait it out (plus a beat) after the world loads
  useEffect(() => {
    if (!loaded) return;
    const t = window.setTimeout(() => setIntro(false), (FLY_IN_SECS + 0.6) * 1000);
    return () => window.clearTimeout(t);
  }, [loaded]);

  const hidden = mapHidden({ loaded, character, pickerOpen, cinema, cameraMode, intro, phone, bookOpen });

  const close = useCallback(() => setBig(false), [setBig]);
  useEffect(() => {
    if (hidden && big) close();
  }, [hidden, big, close]);

  // M opens / closes the big map (ignored while typing, in the hidden states, or with a modifier)
  useEffect(() => {
    if (hidden) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyM" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e)) return;
      const w = useWorld.getState();
      w.setMinimapBig(!w.minimapBig);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hidden]);

  if (hidden) return null;
  return (
    <>
      <div className="pointer-events-auto absolute right-4 top-[68px] z-20 w-24 min-[641px]:w-[140px]" data-minimap>
        <MapView big={false} onExpand={() => setBig(true)} />
      </div>
      {big && <BigMap onClose={close} />}
    </>
  );
}
