"use client";

// "Yanish Portfolio Passport": collect a stamp at each of the 8 places (stay ~1.5 s). Presentation only; rules in logic.ts.
import { useEffect, useRef, useState } from "react";
import { movementLocked, useWorld } from "@/store/world";
import { goToSection } from "../minimap/goTo";
import { zoneById, type ZoneId } from "../zones";
import { PLACE_ICON, PLACE_IDS, PLACE_INK, allCollected, countStamps, type PlaceId } from "./logic";
import { startDwellWatcher, usePassport } from "./store";
import s from "./passport.module.css";

const placeName = (id: PlaceId) => zoneById(id)?.label ?? id;
const dateOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** A round ink seal: ring, the place's icon and its English name. `faint` = not stamped yet. */
function Seal({ id, faint, size = 96 }: { id: PlaceId; faint?: boolean; size?: number }) {
  const ink = PLACE_INK[id];
  const name = placeName(id);
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" style={{ color: ink, opacity: faint ? 0.3 : 0.92, width: "100%", maxWidth: size, height: "auto" }} className={faint ? undefined : s.inked}>
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth={faint ? 2 : 3.2} strokeDasharray={faint ? "4 4" : undefined} />
      <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <text x="50" y="49" textAnchor="middle" fontSize="26" dominantBaseline="middle" style={{ filter: faint ? "grayscale(1)" : undefined }}>
        {PLACE_ICON[id]}
      </text>
      <text x="50" y="76" textAnchor="middle" fontSize={name.length > 12 ? 8.5 : 10} fontWeight="700" fill="currentColor" fontFamily="Kalam, system-ui, sans-serif">
        {name.toUpperCase()}
      </text>
    </svg>
  );
}

const PagodaEmblem = () => (
  <svg viewBox="0 0 100 120" width="92" height="110" aria-hidden="true" focusable="false" fill="currentColor">
    <rect x="48.5" y="2" width="3" height="12" />
    <path d="M50 12 L58 22 H42 Z" />
    {[0, 1, 2, 3, 4].map((i) => {
      const y = 22 + i * 17;
      const w = 20 + i * 8;
      return (
        <g key={i}>
          <path d={`M${50 - w} ${y + 6} Q50 ${y - 6} ${50 + w} ${y + 6} L${50 + w - 5} ${y + 9} H${55 - w} Z`} />
          <rect x={50 - w + 8} y={y + 9} width={2 * w - 16} height={8} opacity="0.75" />
        </g>
      );
    })}
    <rect x="12" y="106" width="76" height="6" />
    <rect x="6" y="112" width="88" height="5" />
  </svg>
);

const FLAGS = ["#d12a1a", "#1f6fd1", "#f2f2f2", "#2f9c5a", "#f2c230"];

function Passport() {
  const stamps = usePassport((p) => p.stamps);
  const open = usePassport((p) => p.open);
  const last = usePassport((p) => p.last);
  const setOpen = usePassport((p) => p.setOpen);
  const [mounted, setMounted] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [toast, setToast] = useState<{ id: PlaceId; n: number } | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const n = countStamps(stamps);
  const done = allCollected(stamps);

  useEffect(() => {
    usePassport.getState().load();
    setMounted(true);
    return startDwellWatcher();
  }, []);

  useEffect(() => {
    if (!last) return;
    setToast({ id: last.id as PlaceId, n: last.n });
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [last]);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    sheet.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener.current?.focus?.();
    };
  }, [open, setOpen]);

  // eagle / 360 / cinema close the passport (the HUD steps aside)
  const hudAway = useWorld((w) => !!w.cinema || w.cameraMode === "eagle");
  useEffect(() => {
    if (hudAway && open) setOpen(false);
  }, [hudAway, open, setOpen]);

  const walk = (id: PlaceId) => {
    const w = useWorld.getState();
    if (movementLocked(w)) return;
    setOpen(false);
    goToSection({ id, label: placeName(id), icon: PLACE_ICON[id], zone: id as ZoneId });
  };

  if (!mounted) return null;
  return (
    <>
      {toast && (
        <div className={s.toast} key={toast.n} role="status" aria-live="polite">
          <Seal id={toast.id} size={72} />
          <span className={s.toastText}>
            Stamped! {countStamps(stamps)} / {PLACE_IDS.length}
          </span>
        </div>
      )}
      {open && (
        <div className={s.backdrop} onClick={() => setOpen(false)}>
          <div ref={sheet} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Yanish Portfolio Passport" className={s.sheet} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={s.close} aria-label="Close passport" onClick={() => setOpen(false)}>
              ✕
            </button>
            <div className={s.book} data-open={flipped ? "" : undefined}>
              <div className={s.inside}>
                <h2 className={s.title}>Yanish Portfolio Passport</h2>
                <ul className={s.grid}>
                  {PLACE_IDS.map((id) => {
                    const at = stamps[id];
                    return (
                      <li key={id}>
                        {at ? (
                          <div className={s.cell}>
                            <Seal id={id} />
                            <span className={s.date}>{dateOf(at)}</span>
                          </div>
                        ) : (
                          <button type="button" className={s.cell} onClick={() => walk(id)} aria-label={`Find me near ${placeName(id)}: walk there`}>
                            <Seal id={id} faint />
                            <span className={s.date}>Find me near {placeName(id)}</span>
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className={s.count}>
                  {n} / {PLACE_IDS.length} places visited.
                </p>
                {done && <p className={s.badge}>🏅 Bhaktapur Explorer</p>}
                {done && (
                  <div className={s.confetti} aria-hidden="true">
                    {Array.from({ length: 22 }, (_, i) => (
                      <i key={i} style={{ left: `${(i * 37) % 100}%`, background: FLAGS[i % 5], animationDelay: `${(i % 7) * 0.18}s`, animationDuration: `${2.6 + (i % 5) * 0.4}s` }} />
                    ))}
                  </div>
                )}
              </div>
              <div className={s.cover} aria-hidden={flipped || undefined} inert={flipped || undefined}>
                <div className={s.foil}>
                  <p className={s.cap}>YANISH PORTFOLIO</p>
                  <div className={s.emblem}>
                    <PagodaEmblem />
                  </div>
                  <p className={s.cap}>PASSPORT</p>
                  <p className={s.sub}>Visit all {PLACE_IDS.length} places &amp; get stamped</p>
                  <button type="button" className={s.openBtn} onClick={() => setFlipped(true)}>
                    Open ▸
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Desktop button under the mini-map (phones use the action cluster). */
export function PassportButton() {
  const n = usePassport((p) => countStamps(p.stamps));
  const setOpen = usePassport((p) => p.setOpen);
  const ready = useWorld((w) => w.loaded && !!w.character && !w.pickerOpen && !w.cinema);
  if (!ready) return null;
  return (
    <button type="button" className={`${s.deskBtn} pointer-events-auto`} onClick={() => setOpen(true)} aria-label={`Passport: ${n} of ${PLACE_IDS.length} places stamped`}>
      <span aria-hidden="true">📖</span> {n} / {PLACE_IDS.length}
    </button>
  );
}

/** Phone action-cluster button (same look as its siblings, styled by .ph-actions). */
export function PassportPhoneButton() {
  const n = usePassport((p) => countStamps(p.stamps));
  return (
    <button type="button" onClick={() => usePassport.getState().setOpen(true)} aria-label={`Passport: ${n} of ${PLACE_IDS.length} places stamped`}>
      <span aria-hidden="true">📖</span>
    </button>
  );
}

export default Passport;
