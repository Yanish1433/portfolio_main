"use client";

// The mini-map: a round hand-inked map of the town on lokta paper in a carved-wood ring (corner, under the pill row),
// with a red "you are here" arrow, click-a-zone-to-walk (the "Go to…" golden footprints) and a big map on M.
// Every place has an always-visible chip (icon + plain word). The static art is drawn once; the arrow is moved ~10x a second straight on its SVG node (no React renders).
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { isTypingTarget, useWorld } from "@/store/world";
import { avatarMotion, playerPos } from "../input";
import { FLY_IN_SECS, pickZone, type Ring } from "../cameraRig";
import { zones } from "../zones";
import { WORKSHOP_CAM_RING } from "../halls/workshopLayout";
import MapArt, { GLYPH } from "./MapArt";
import { boundsFor, CHIP_BG, LABEL_INK, placeLabels, shortLabel } from "./mapLabels";
import { ZONE_TARGETS } from "./mapData";
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

const PAPER = "#fbf3df";
const CAPTION = "Tap a place to walk there";
const RINGS: Ring[] = [...zones.map((z) => ({ id: z.id, x: z.ring[0], z: z.ring[1] })), ...(WORKSHOP_CAM_RING ? [WORKSHOP_CAM_RING] : [])];
const TARGETS = ZONE_TARGETS.map((t) => ({ id: t.id, x: t.x, y: t.y, text: shortLabel(t.name) }));

function Icon({ id, px }: { id: string; px: number }) {
  return (
    <svg viewBox="-6 -6 12 12" width={px} height={px} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="shrink-0">
      <path d={GLYPH[id] ?? GLYPH.about} />
    </svg>
  );
}

/** One round map with a labelled chip (icon + word) for every place, a red "You" marker and a pin on the walk's goal. */
function MapView({ big }: { big: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const you = useRef<HTMLDivElement>(null);
  const youArrow = useRef<SVGSVGElement>(null);
  const chips = useRef<Record<string, HTMLButtonElement | null>>({});
  const [size, setSize] = useState(big ? 420 : 180);
  const phone = usePhone();
  const isNight = useWorld((s) => s.theme === "night");
  const guide = useWorld((s) => s.guide);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize((p) => (Math.abs(p - el.clientWidth) < 1 ? p : el.clientWidth)));
    ro.observe(el);
    setSize(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const font = big ? 14 : 12;
  const labels = useMemo(() => placeLabels(TARGETS, size, font, boundsFor(size, big ? 0 : phone ? 100 : 40)), [size, font, big, phone]);

  useEffect(() => {
    let last = "";
    let zone: string | null = null;
    const tick = () => {
      if (document.hidden || !you.current || !youArrow.current) return;
      const [x, y] = worldToMap(playerPos.x, playerPos.z);
      zone = pickZone(playerPos.x, playerPos.z, RINGS, zone); // the same pick the camera uses (read-only)
      const t = `${x.toFixed(1)} ${y.toFixed(1)} ${arrowDegrees(avatarMotion.heading).toFixed(0)} ${zone}`;
      if (t === last) return;
      last = t;
      you.current.style.left = `${((x / 200) * 100).toFixed(2)}%`;
      you.current.style.top = `${((y / 200) * 100).toFixed(2)}%`;
      youArrow.current.style.transform = `rotate(${arrowDegrees(avatarMotion.heading).toFixed(0)}deg)`;
      for (const tg of ZONE_TARGETS) {
        const el = chips.current[tg.id];
        if (el) el.dataset.here = String((tg.section.zone ?? tg.section.id) === zone);
      }
    };
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const svgPoint = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 200, ((e.clientY - r.top) / r.height) * 200] as const;
  };
  const dest = guide ? ZONE_TARGETS.find((t) => t.id === guide.id) : undefined;
  const dot = big ? 14 : 10;

  return (
    <div ref={wrap} className="relative aspect-square w-full select-none">
      <div
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{
          background: `${isNight ? "#efe2c0" : PAPER} url(/textures/ui/lokta-paper.png) repeat`,
          border: `${big ? 8 : 5}px solid #3e2416`,
          boxShadow: `inset 0 0 0 1.5px rgba(229,193,88,0.6), 0 0 0 1.5px #1f120a, 0 6px 16px rgba(0,0,0,0.45)${isNight ? ", 0 0 24px rgba(255,183,77,0.35)" : ""}`,
        }}
        onClick={(e) => {
          const [px, py] = svgPoint(e);
          const h = hitZone(px, py, ZONE_TARGETS, 14);
          if (h) goToSection(h.section);
        }}
      >
        <MapArt />
        <div ref={you} className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: "50%", top: "50%" }} data-testid="you-are-here">
          <svg ref={youArrow} viewBox="-12 -12 24 24" width={dot * 2.2} height={dot * 2.2} aria-hidden="true" focusable="false">
            <path d="M0 -11 L7 8 L0 4 L-7 8 Z" fill="#d12a1a" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
            <circle r="3.4" fill="#d12a1a" stroke="#fff" strokeWidth="1.4" />
          </svg>
        </div>
      </div>
      {labels.map((l) => {
        const t = ZONE_TARGETS.find((z) => z.id === l.id)!;
        return (
          <button
            key={l.id}
            ref={(el) => {
              chips.current[l.id] = el;
            }}
            type="button"
            aria-label={`Go to ${t.name}`}
            title={t.name}
            onClick={(e) => {
              e.stopPropagation();
              goToSection(t.section);
            }}
            className="pointer-events-auto absolute z-20 flex items-center justify-center gap-[3px] whitespace-nowrap rounded-full border-[1.5px] border-[#3e2416] p-0 font-semibold leading-none shadow data-[here=true]:border-[#d12a1a] data-[here=true]:bg-[#ffe9a8] data-[here=true]:ring-2 data-[here=true]:ring-[#d12a1a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d12a1a]"
            style={{ left: l.x, top: l.y, width: l.w, height: l.h, fontSize: font, color: LABEL_INK, background: CHIP_BG, fontFamily: "system-ui, sans-serif" }}
          >
            <Icon id={t.id} px={Math.round(font * 1.1)} />
            {l.text}
          </button>
        );
      })}
      <div className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full" style={{ left: `${dest ? (dest.x / 200) * 100 : 0}%`, top: `${dest ? (dest.y / 200) * 100 : 0}%`, display: dest ? "block" : "none" }} data-testid="destination-pin">
        <svg viewBox="0 0 24 32" width={big ? 28 : 20} height={big ? 37 : 27} aria-hidden="true" focusable="false">
          <path d="M12 31 C12 31 2 18 2 11 a10 10 0 0 1 20 0 C22 18 12 31 12 31 Z" fill="#1f6fd1" stroke="#fff" strokeWidth="2" />
          <circle cx="12" cy="11" r="4" fill="#fff" />
        </svg>
      </div>
      <span className="sr-only" role="status">
        {dest ? `Walking to ${dest.name}` : ""}
      </span>
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-3 rounded-lg border-2 border-[#c9a227] bg-[#3e2416] px-3 py-2 text-[13px] leading-snug text-[#fbe9b7]">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full border border-white bg-[#d12a1a]" /> You are here
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-2.5 rounded-t-full border border-white bg-[#1f6fd1]" /> Where you are walking to
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-5 rounded-full border-2 border-[#d12a1a] bg-[#ffe9a8]" /> The place you are in
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block w-5 border-t-2 border-dashed border-[#e0795f]" /> Brick lane
        </li>
      </ul>
      <p className="mt-1 font-semibold">{CAPTION} · M or Esc to close</p>
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
      <div ref={box} role="dialog" aria-modal="true" aria-label="Map of the town" onKeyDown={onKey} onClick={(e) => e.stopPropagation()} className="relative" style={{ width: "min(60vmin, 94vw)" }}>
        <MapView big />
        <Legend />
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
      <div className="ph-minimap pointer-events-auto absolute right-4 top-[96px] z-20 w-[120px] min-[641px]:top-[68px] min-[641px]:w-[180px]" data-minimap>
        <MapView big={false} />
        <p className="ph-map-caption mt-1.5 text-center text-[12px] font-semibold leading-tight text-[#fbe9b7] [text-shadow:0_1px_2px_#000]">{CAPTION}</p>
        <button
          type="button"
          onClick={() => setBig(true)}
          aria-label="Open big map (M)"
          className="ph-map-btn mt-1.5 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border-2 border-[#c9a227] bg-[#3e2416] px-2 text-[12px] font-semibold text-[#fbe9b7] focus:outline-none focus-visible:ring-2 focus-visible:ring-white min-[641px]:min-h-9"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
          </svg>
          <span className="ph-map-btn-label">Open big map</span>
        </button>
      </div>
      {big && <BigMap onClose={close} />}
    </>
  );
}
