"use client";

// The handwritten book kit: every panel and form in the town is a page of one open book (presentation only).
// - BookPanel: dark-wood cover that swings open the first time, then a two-page spread (desktop) or one page
//   (<= 640 px). Pages turn by corner click / drag, swipe or the arrow keys. A ribbon bookmark closes it.
// - Ink: a pen writes each block left to right (once per page per session; any tap or key shows it all).
//   The text is real DOM from the start, only visually masked.
// - Links are ink-underlined words, primary actions are red wax seals, fields are ruled lines (all real
//   <a>/<button>/<input>, only the look changes).
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { HTMLAttributes, InputHTMLAttributes, ReactNode, RefObject, TextareaHTMLAttributes, ButtonHTMLAttributes, PointerEvent as RPointerEvent } from "react";
import { pointerClaim } from "@/components/world/input";
import { isTypingTarget, useWorld } from "@/store/world";
import { inkPlan, nextIndex, pageLabel, pageView, viewStart } from "./paginate";
import s from "./book.module.css";

const cx = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(" ");

export const btnClass = (primary: boolean, extra?: string) => cx(s.btn, primary ? s.primary : s.ghost, extra);
export const chipClass = (extra?: string) => cx(s.chip, extra);
export const pillClass = (extra?: string) => cx(s.pill, extra);
export const fieldClass = (extra?: string) => cx(s.field, extra);
export const wellClass = (extra?: string) => cx(s.well, extra);
export const labelClass = s.label;
export const errClass = s.err;
export const floatClass = s.float;
export const cardClass = (extra?: string) => cx(s.card, s.cardIn, extra);
export const rowClass = (extra?: string) => cx(s.row, extra);
/** The hand-drawn arrow after an outside link. */
export const LINK_ARROW = "➚";

// ---------------------------------------------------------------- session state

const reducedNow = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let coverSeen = false; // the cover swings open only the first time per session
const inkSeen = new Set<string>(); // "book:page" keys already written this session

function readSeen(): boolean {
  if (coverSeen) return true;
  try {
    return sessionStorage.getItem("book-cover") === "1";
  } catch {
    return false;
  }
}
function markCover() {
  coverSeen = true;
  try {
    sessionStorage.setItem("book-cover", "1");
  } catch {
    /* private mode: the module flag still holds */
  }
}

const subWide = (cb: () => void) => {
  const m = window.matchMedia("(min-width: 641px)");
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const useWide = () => useSyncExternalStore(subWide, () => window.matchMedia("(min-width: 641px)").matches, () => false);

// ---------------------------------------------------------------- the pen

const NIB_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M3 21 L5 14 L16 3 L21 8 L10 19 Z" fill="#3a2a1c" stroke="#1f120a" stroke-width="1.2" stroke-linejoin="round"/><path d="M3 21 L7.5 16.5" stroke="#c9a227" stroke-width="2" stroke-linecap="round"/></svg>';
const CLIP_HIDE = "inset(-10px 100% -10px -10px)";
const CLIP_SHOW = "inset(-10px -10px -10px -10px)";

/**
 * Write `blocks` one after another with a clip-path wipe, a small nib riding the wipe's edge.
 * `host` must be position:relative. Returns `finish` (show everything now) and `cancel`.
 */
export function inkWrite(host: HTMLElement, blocks: HTMLElement[], onDone?: () => void): { finish: () => void; cancel: () => void } {
  const live = blocks.filter((b) => b.getBoundingClientRect().height > 0);
  if (!live.length) return { finish: () => {}, cancel: () => {} };
  const plan = inkPlan(live.map((b) => (b.textContent ?? "").trim().length + 12));
  const anims = live.map((b, i) => b.animate([{ clipPath: CLIP_HIDE }, { clipPath: CLIP_SHOW }], { duration: plan[i].duration, delay: plan[i].delay, easing: "linear", fill: "backwards" }));
  const end = plan[plan.length - 1].delay + plan[plan.length - 1].duration;
  const box = host.getBoundingClientRect();
  const nib = document.createElement("span");
  nib.setAttribute("aria-hidden", "true");
  nib.className = s.nib;
  nib.innerHTML = NIB_SVG; // static markup, no user text
  host.appendChild(nib);
  const frames: Keyframe[] = [];
  live.forEach((b, i) => {
    const r = b.getBoundingClientRect();
    const y = r.top - box.top + Math.min(r.height, 26);
    frames.push({ transform: `translate(${r.left - box.left}px, ${y}px)`, offset: plan[i].delay / end });
    frames.push({ transform: `translate(${r.right - box.left}px, ${y}px)`, offset: (plan[i].delay + plan[i].duration) / end });
  });
  const pen = nib.animate(frames, { duration: end, easing: "linear", fill: "backwards" });
  const done = () => nib.remove();
  pen.onfinish = () => {
    done();
    onDone?.();
  };
  pen.oncancel = done;
  return {
    finish: () => {
      anims.forEach((a) => a.finish());
      pen.finish();
      done();
    },
    cancel: () => {
      anims.forEach((a) => a.cancel());
      pen.cancel();
      done();
    },
  };
}

/** Ink for a single element (cards, forms): its direct children are the blocks. Once per `key` per session. */
export function useInk(ref: RefObject<HTMLElement | null>, key: string, on = true) {
  useLayoutEffect(() => {
    const host = ref.current;
    if (!on || !host || reducedNow() || inkSeen.has(key)) return;
    const w = inkWrite(host, Array.from(host.children) as HTMLElement[], () => inkSeen.add(key));
    const skip = () => w.finish();
    host.addEventListener("pointerdown", skip);
    host.addEventListener("keydown", skip);
    return () => {
      host.removeEventListener("pointerdown", skip);
      host.removeEventListener("keydown", skip);
      w.cancel();
    };
  }, [ref, key, on]);
}

// ---------------------------------------------------------------- the book

type PanelProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  night?: boolean;
  /** small line on the cover: Devanagari (real strings only), then English */
  ne?: string;
  kind?: string;
  onClose?: () => void;
  closeLabel?: string;
  /** one node per page; forms must sit whole inside one page */
  pages?: ReactNode[];
  /** a single page (when `pages` is not given) */
  children?: ReactNode;
  /** identifies the book for "written once per session" */
  bookKey?: string;
};

type Turn = { from: number; to: number; dir: 1 | -1 };
const TURN_MS = 520;

export const BookPanel = forwardRef<HTMLDivElement, PanelProps>(function BookPanel(
  { night = false, ne, kind, onClose, closeLabel = "Close (Esc)", pages, children, bookKey, className, ...rest },
  ref,
) {
  const list = pages ?? [children];
  const count = list.length;
  const wide = useWide();
  const perView = wide && count > 1 ? 2 : 1;
  const [reduced] = useState(reducedNow);
  const [at, setAt] = useState(0);
  const idx = viewStart(Math.min(at, count - 1), perView);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [coverGone, setCoverGone] = useState(() => reduced || readSeen());
  const [pulled, setPulled] = useState(false);
  const frame = useRef<HTMLDivElement | null>(null);
  const book = useRef<HTMLDivElement | null>(null);
  const pageEls = useRef<(HTMLElement | null)[]>([]);
  const drag = useRef<{ x: number; y: number; id: number; dragged: boolean } | null>(null);
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      frame.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );
  const key = bookKey ?? kind ?? "book";

  // cover: swings open the first time per session, then stays gone
  useEffect(() => {
    if (coverGone) return;
    const t = window.setTimeout(() => {
      markCover();
      setCoverGone(true);
    }, 3000); // fallback; the cover's animationend ends it
    return () => window.clearTimeout(t);
  }, [coverGone]);

  const focusHeading = useCallback((i: number) => {
    window.requestAnimationFrame(() => {
      const h = pageEls.current[i]?.querySelector<HTMLElement>("h2, h3");
      if (!h) return;
      h.tabIndex = -1;
      h.focus({ preventScroll: true });
    });
  }, []);

  const go = useCallback(
    (dir: 1 | -1) => {
      if (turn) return;
      const to = nextIndex(idx, dir, perView, count);
      if (to === idx) return;
      if (!reduced) {
        setTurn({ from: idx, to, dir });
        window.setTimeout(() => setTurn(null), TURN_MS * 3); // fallback; the leaf's animationend ends the turn
      }
      setAt(to);
      focusHeading(to);
    },
    [turn, idx, perView, count, reduced, focusHeading],
  );

  // ← / → turn the page (and don't walk Lakhey) while the book has more than one page
  useEffect(() => {
    if (count < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e)) return;
      if (useWorld.getState().cinema) return;
      e.preventDefault();
      e.stopPropagation();
      go(e.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [count, go]);

  // tap on the empty world (not a drag) closes the book
  useEffect(() => {
    if (!onClose) return;
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = e.target instanceof HTMLCanvasElement ? { x: e.clientX, y: e.clientY } : null;
    };
    const onUp = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && e.target instanceof HTMLCanvasElement) onClose();
      down = null;
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointerup", onUp, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
    };
  }, [onClose]);

  // the pen: write the visible pages' blocks once per page per session, after the cover is open
  const viewKey = pageView(idx, perView, count).join(",");
  useLayoutEffect(() => {
    const host = book.current;
    if (!host || !coverGone || reduced) return;
    const blocks: HTMLElement[] = [];
    const keys: string[] = [];
    for (const i of pageView(idx, perView, count)) {
      const k = `${key}:${i}`;
      if (inkSeen.has(k)) continue;
      keys.push(k);
      const pg = pageEls.current[i];
      if (pg) blocks.push(...(Array.from(pg.children) as HTMLElement[]));
    }
    if (!blocks.length) return;
    const w = inkWrite(host, blocks, () => keys.forEach((k) => inkSeen.add(k)));
    const skip = () => w.finish();
    const el = frame.current;
    el?.addEventListener("pointerdown", skip);
    el?.addEventListener("keydown", skip);
    return () => {
      el?.removeEventListener("pointerdown", skip);
      el?.removeEventListener("keydown", skip);
      w.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverGone, viewKey, perView, reduced, key]);

  // ---- roles of every page (all stay mounted so a form keeps what was typed)
  const colOf = (role: "left" | "right") => (perView === 2 && role === "right" ? 2 : 1);
  const cur = pageView(idx, perView, count);
  const old = turn ? pageView(turn.from, perView, count) : [];
  const roleOf = (i: number): { role: string; col: number; fresh?: boolean } => {
    const base = cur.includes(i) ? (perView === 2 && i === cur[0] ? "left" : "right") : "hidden";
    if (!turn) return { role: base, col: colOf(base === "left" ? "left" : "right") };
    if (turn.dir === 1) {
      if (cur.includes(i)) return { role: base, col: colOf(base === "left" ? "left" : "right"), fresh: base === "left" };
      if (i === old[old.length - 1]) return { role: "leaf-fwd", col: perView === 2 ? 2 : 1 };
      return { role: "hidden", col: 1 };
    }
    if (perView === 1) {
      if (cur.includes(i)) return { role: "leaf-in", col: 1 };
      if (old.includes(i)) return { role: "right", col: 1 };
      return { role: "hidden", col: 1 };
    }
    if (cur.includes(i)) return { role: base, col: colOf(base === "left" ? "left" : "right"), fresh: base === "right" };
    if (i === old[0]) return { role: "leaf-back", col: 1 };
    return { role: "hidden", col: 1 };
  };

  // ---- pointers: corner drag/click and swipe never reach the camera or the avatar
  const claim = (e: RPointerEvent) => {
    e.stopPropagation();
    pointerClaim.claim(e.pointerId);
  };
  const cornerDown = (e: RPointerEvent<HTMLButtonElement>) => {
    claim(e);
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, dragged: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const cornerMove = (e: RPointerEvent<HTMLButtonElement>, dir: 1 | -1) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const pull = Math.max(0, (e.clientX - d.x) * -dir);
    e.currentTarget.style.setProperty("--pull", String(Math.min(pull, 90)));
    if (Math.abs(e.clientX - d.x) > 6) d.dragged = true;
  };
  const cornerUp = (e: RPointerEvent<HTMLButtonElement>, dir: 1 | -1) => {
    claim(e);
    const d = drag.current;
    drag.current = null;
    e.currentTarget.style.removeProperty("--pull");
    if (d?.dragged) {
      const dx = e.clientX - d.x;
      if (Math.abs(dx) > 28 && Math.sign(dx) === -dir) go(dir);
      else d.dragged = true; // a short drag the wrong way: ignore the click that follows
      suppress.current = true;
    }
  };
  const suppress = useRef(false);
  const cornerClick = (dir: 1 | -1) => {
    if (suppress.current) {
      suppress.current = false;
      return;
    }
    go(dir);
  };
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const bookDown = (e: RPointerEvent) => {
    claim(e);
    swipe.current = e.pointerType === "mouse" ? null : { x: e.clientX, y: e.clientY };
  };
  const bookUp = (e: RPointerEvent) => {
    const st = swipe.current;
    swipe.current = null;
    if (!st) return;
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  };

  const pull = () => {
    if (!onClose) return;
    if (reduced) return onClose();
    setPulled(true);
    window.setTimeout(onClose, 200);
  };

  return (
    <div ref={setRefs} data-night={night} data-spread={perView} className={cx(s.frame, className)} {...rest} onPointerDown={(e) => { claim(e); rest.onPointerDown?.(e); }}>
      <div ref={book} className={s.book} onPointerUp={bookUp} onPointerCancel={() => (swipe.current = null)} onPointerDownCapture={bookDown}>
        {list.map((page, i) => {
          const r = roleOf(i);
          const off = r.role === "hidden" || r.role.startsWith("leaf");
          return (
            <section
              key={i}
              ref={(el) => {
                pageEls.current[i] = el;
              }}
              className={cx(s.page, "info-panel-scroll")}
              data-role={r.role}
              data-col={r.col}
              data-fresh={r.fresh ? "" : undefined}
              aria-hidden={off || undefined}
              inert={off}
              onAnimationEnd={(e) => {
                if (e.target === e.currentTarget && r.role.startsWith("leaf")) setTurn(null);
              }}
              aria-label={count > 1 ? pageLabel(i, count) : undefined}
            >
              {page}
            </section>
          );
        })}
        {!coverGone && (
          <div
            className={s.cover}
            aria-hidden="true"
            onAnimationEnd={() => {
              markCover();
              setCoverGone(true);
            }}
          >
            <i className={s.corner} data-c="tl" />
            <i className={s.corner} data-c="tr" />
            <i className={s.corner} data-c="bl" />
            <i className={s.corner} data-c="br" />
            {ne && <span lang="ne" className={s.coverNe}>{ne}</span>}
            <span className={s.coverTitle}>{kind ?? "Yanish's book"}</span>
          </div>
        )}
        {count > 1 && (
          <>
            <button type="button" aria-label="Previous page" disabled={idx === 0} className={cx(s.corner2, s.cornerL)} onPointerDown={cornerDown} onPointerMove={(e) => cornerMove(e, -1)} onPointerUp={(e) => cornerUp(e, -1)} onClick={() => cornerClick(-1)}>
              <span aria-hidden="true">‹</span>
            </button>
            <button type="button" aria-label="Next page" disabled={idx + perView >= count} className={cx(s.corner2, s.cornerR)} onPointerDown={cornerDown} onPointerMove={(e) => cornerMove(e, 1)} onPointerUp={(e) => cornerUp(e, 1)} onClick={() => cornerClick(1)}>
              <span aria-hidden="true">›</span>
            </button>
            <p className={s.folio} role="status" aria-live="polite">
              {perView === 2 ? `Pages ${idx + 1}${cur.length > 1 ? `–${cur[cur.length - 1] + 1}` : ""} of ${count}` : pageLabel(idx, count)}
            </p>
          </>
        )}
      </div>
      {onClose && (
        <button type="button" onClick={pull} aria-label={closeLabel} title={closeLabel} className={cx(s.ribbon, pulled && s.pulled)}>
          <span className={s.ribbonCloth} aria-hidden="true" />
        </button>
      )}
    </div>
  );
});

// ---------------------------------------------------------------- small parts

export function BookButton({ primary = false, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return <button type="button" {...p} className={btnClass(primary, className)} />;
}
export const BookInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function BookInput({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={fieldClass(className)} />;
});
export function BookTextarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={fieldClass(className)} />;
}
export function BookChip({ className, ...p }: HTMLAttributes<HTMLElement>) {
  return <span {...p} className={chipClass(className)} />;
}

/** The sealed letter: the page folds shut, a red wax seal is pressed on it (the existing success state only). */
export function WaxSeal({ children, fly = false }: { children?: ReactNode; fly?: boolean }) {
  return (
    <div className={s.thanks}>
      <div className={s.letter} aria-hidden="true">
        <span className={s.flap} />
        <span className={cx(s.seal, fly && s.sealFly)}>✦</span>
      </div>
      {children && <div className="mt-2 text-center">{children}</div>}
    </div>
  );
}
