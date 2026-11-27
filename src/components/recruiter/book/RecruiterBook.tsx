"use client";

// Recruiter Mode as one open handwritten book (presentation only; every chapter is real DOM text from the server).
// - Pages turn as a real 3D flip around the spine (CSS perspective + rotateY, one gradient overlay for the curl
//   shadow and a lighter back side). One leaf angle drives both halves: the front rises to 90 deg, the back lands from 90 to 0.
//   Each page is mounted once; the front and the back are two different pages, so forms and videos keep their state.
// - Turns come from the arrow keys, a click on a page corner, a drag (follows the pointer, past halfway completes,
//   otherwise it springs back) or a swipe. A ribbon / Contents / #hash jump riffles the pages in between (~0.6 s).
// - Only transform and opacity move. Reduced motion: an instant switch with a short fade.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { PointerEvent as RPointerEvent, ReactNode } from "react";
import { inkWrite } from "@/components/book";
import { isTypingTarget } from "@/store/world";
import { PageActive } from "./active";
import { RIBBONS, chapterOfView, dragProgress, easeTurn, hashForPage, hashToPage, leafAngle, riffleCount, shouldComplete, viewStart } from "./nav";
import type { PageMeta } from "./nav";
import s from "./recruiterBook.module.css";

export type PageDef = { meta: PageMeta; node: ReactNode };

type Turn = { dir: 1 | -1; from: number; to: number; riffle: number; wide: boolean };
type Role = { role: string; col: 1 | 2; origin: "left" | "right" };

const cx = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(" ");
const reducedNow = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const inkSeen = new Set<string>(); // "page index" keys already written this session
const TURN_MS = 700;
const RIFFLE_MS = 600;
const COVER_WAIT_MS = 900;
const NO_DRAG = "a,button:not([data-corner]),input,textarea,select,video,summary,label,[data-nodrag]";

const subWide = (cb: () => void) => {
  const m = window.matchMedia("(min-width: 641px)");
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
// The server renders the spread (what CSS shows on a desktop); on phones CSS hides the right page until JS settles.
const useWide = () => useSyncExternalStore(subWide, () => window.matchMedia("(min-width: 641px)").matches, () => true);

function markCover() {
  try {
    sessionStorage.setItem("book-cover", "1");
  } catch {
    /* private mode: the page flag still holds */
  }
}

export function RecruiterBook({ pages, name, title }: { pages: PageDef[]; name: string; title: string }) {
  const count = pages.length;
  const metas = useMemo(() => pages.map((p) => p.meta), [pages]);
  const wide = useWide();
  const perView = wide ? 2 : 1;
  const [at, setAt] = useState(0);
  const idx = Math.min(viewStart(at, perView), viewStart(count - 1, perView));
  const [turn, setTurn] = useState<Turn | null>(null);
  const [coverGone, setCoverGone] = useState(false);
  const [opening, setOpening] = useState(false);
  const [ready, setReady] = useState(false);
  const [fresh, setFresh] = useState(0);
  const [focusPage, setFocusPage] = useState(0);

  const frame = useRef<HTMLDivElement>(null);
  const book = useRef<HTMLDivElement>(null);
  const pageEls = useRef<(HTMLElement | null)[]>([]);
  const leafEls = useRef<(HTMLElement | null)[]>([]);
  const turnRef = useRef<Turn | null>(null);
  const pRef = useRef(0);
  const raf = useRef(0);
  const auto = useRef<number | null>(null); // ms of a programmatic turn waiting to start
  const pending = useRef<number | null>(null);
  const nav = useRef<{ page: number; moveFocus: boolean } | null>(null);
  const focusRef = useRef(0);
  const suppress = useRef(false);
  const drag = useRef<{ id: number; x: number; y: number; t: number; lx: number; lt: number; v: number; forced: 0 | 1 | -1; started: boolean; dir: 1 | -1; to: number } | null>(null);

  // ---- which role each page plays right now (all pages stay mounted)
  const roleOf = (i: number): Role => {
    const hidden: Role = { role: "hidden", col: 1, origin: "left" };
    if (!turn) {
      if (i === idx) return { role: wide ? "left" : "solo", col: 1, origin: "right" };
      if (wide && i === idx + 1) return { role: "right", col: 2, origin: "left" };
      return hidden;
    }
    const { dir, from: a, to: b } = turn;
    if (turn.wide) {
      if (dir === 1) {
        if (i === a) return { role: "under", col: 1, origin: "right" };
        if (i === a + 1) return { role: "front", col: 2, origin: "left" };
        if (i === b) return { role: "back", col: 1, origin: "right" };
        if (i === b + 1) return { role: "under", col: 2, origin: "left" };
      } else {
        if (i === b) return { role: "under", col: 1, origin: "right" };
        if (i === a) return { role: "front", col: 1, origin: "right" };
        if (i === b + 1) return { role: "back", col: 2, origin: "left" };
        if (i === a + 1) return { role: "under", col: 2, origin: "left" };
      }
      return hidden;
    }
    if (dir === 1) {
      if (i === a) return { role: "front", col: 1, origin: "left" };
      if (i === b) return { role: "under", col: 1, origin: "left" };
    } else {
      if (i === b) return { role: "back", col: 1, origin: "left" };
      if (i === a) return { role: "under", col: 1, origin: "left" };
    }
    return hidden;
  };

  // ---- drawing one frame of a turn: transform + opacity (+ the overlay's opacity) only
  const clearStyles = useCallback(() => {
    for (const el of [...pageEls.current, ...leafEls.current]) {
      if (!el) continue;
      el.style.removeProperty("transform");
      el.style.removeProperty("opacity");
      el.style.removeProperty("--shade");
    }
  }, []);

  const apply = useCallback((p: number) => {
    const t = turnRef.current;
    if (!t) return;
    pRef.current = p;
    const { face, deg, theta } = leafAngle(p);
    const cast = Math.sin((theta * Math.PI) / 180) * 0.5;
    const draw = (i: number, rot: number, visible: boolean, shade: number) => {
      const el = pageEls.current[i];
      if (!el) return;
      el.style.transform = `rotateY(${rot.toFixed(2)}deg)`;
      el.style.opacity = visible ? "1" : "0";
      el.style.setProperty("--shade", shade.toFixed(3));
    };
    const under = (i: number) => {
      const el = pageEls.current[i];
      if (el) el.style.setProperty("--shade", cast.toFixed(3));
    };
    if (t.wide) {
      const sign = t.dir === 1 ? -1 : 1; // front swings about its spine edge
      const frontI = t.dir === 1 ? t.from + 1 : t.from;
      const backI = t.dir === 1 ? t.to : t.to + 1;
      draw(frontI, sign * deg, face === "front", theta / 90);
      draw(backI, -sign * deg, face === "back", (180 - theta) / 90);
      under(t.dir === 1 ? t.from : t.to);
      under(t.dir === 1 ? t.to + 1 : t.from + 1);
    } else if (t.dir === 1) {
      draw(t.from, -100 * p, p < 0.999, p * 0.9);
      under(t.to);
    } else {
      draw(t.to, -100 * (1 - p), p > 0.001, (1 - p) * 0.9);
      under(t.from);
    }
    const w = 0.45;
    for (let k = 0; k < t.riffle; k++) {
      const el = leafEls.current[k];
      if (!el) continue;
      const q = Math.min(Math.max((p - ((k + 1) / (t.riffle + 1)) * (1 - w)) / w, 0), 1);
      el.style.transform = `rotateY(${((t.dir === 1 ? -1 : 1) * easeTurn(q) * 180).toFixed(2)}deg)`;
      el.style.opacity = q > 0 && q < 1 ? "1" : "0";
    }
  }, []);

  const animateTo = useCallback(
    (target: 0 | 1, ms: number, done: () => void) => {
      window.cancelAnimationFrame(raf.current);
      const p0 = pRef.current;
      const t0 = performance.now();
      const dur = Math.max(ms * Math.abs(target - p0), 70);
      const tick = (now: number) => {
        const k = Math.min((now - t0) / dur, 1);
        apply(p0 + (target - p0) * easeTurn(k));
        if (k < 1) raf.current = window.requestAnimationFrame(tick);
        else done();
      };
      raf.current = window.requestAnimationFrame(tick);
    },
    [apply],
  );

  const goToRef = useRef<(page: number, instant?: boolean) => void>(() => {});

  const finish = useCallback((commit: boolean) => {
    const t = turnRef.current;
    turnRef.current = null;
    if (commit && t) setAt(t.to);
    setTurn(null);
    const next = pending.current;
    pending.current = null;
    if (next !== null) window.setTimeout(() => goToRef.current(next), 0);
  }, []);

  useLayoutEffect(() => {
    if (turn) {
      apply(pRef.current);
      if (auto.current !== null) {
        const ms = auto.current;
        auto.current = null;
        animateTo(1, ms, () => finish(true));
      }
    } else clearStyles();
  }, [turn, apply, animateTo, finish, clearStyles]);

  useEffect(() => () => window.cancelAnimationFrame(raf.current), []);

  // ---- going to a page
  const goTo = useCallback(
    (page: number, instant = false) => {
      const target = Math.min(Math.max(page, 0), count - 1);
      if (turnRef.current) {
        pending.current = target;
        return;
      }
      const to = viewStart(target, perView);
      focusRef.current = target;
      setFocusPage(target);
      nav.current = { page: target, moveFocus: !instant };
      if (to === idx) {
        setFresh((f) => f + 1); // nothing to turn: still refresh focus and the hash
        return;
      }
      if (instant || reducedNow()) {
        setAt(to);
        setFresh((f) => f + 1);
        return;
      }
      const riffle = riffleCount(idx, to, perView);
      const t: Turn = { dir: to > idx ? 1 : -1, from: idx, to, riffle, wide };
      turnRef.current = t;
      pRef.current = 0;
      auto.current = riffle > 0 ? RIFFLE_MS : TURN_MS;
      setTurn(t);
    },
    [count, perView, idx, wide],
  );
  useEffect(() => {
    goToRef.current = goTo;
  }, [goTo]);

  const step = useCallback(
    (dir: 1 | -1) => {
      const to = idx + dir * perView;
      if (to < 0 || to >= count) return;
      goTo(to);
    },
    [idx, perView, count, goTo],
  );

  // ---- after a view settles: focus the new heading, name the page in the URL (replaceState: no history spam)
  useEffect(() => {
    if (turn || !nav.current) return;
    const n = nav.current;
    nav.current = null;
    const h = hashForPage(metas[n.page]);
    if (window.location.hash !== h) {
      try {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${h}`);
      } catch {
        /* sandboxed frame: the book still works */
      }
    }
    if (!n.moveFocus) return;
    window.requestAnimationFrame(() => {
      const el = pageEls.current[n.page]?.querySelector<HTMLElement>("h1, h2");
      if (!el) return;
      el.tabIndex = -1;
      el.focus({ preventScroll: true });
    });
  }, [turn, at, fresh, metas]);

  // ---- start: deep link, cover, "JS is on"
  useLayoutEffect(() => {
    setReady(true);
    const t = hashToPage(window.location.hash, metas);
    const root = frame.current?.closest<HTMLElement>("[data-time-root]");
    const seen = root?.dataset.cover === "seen";
    if (t !== null) {
      setAt(viewStart(t, window.matchMedia("(min-width: 641px)").matches ? 2 : 1));
      setFocusPage(t);
      focusRef.current = t;
    }
    if (seen || t !== null || reducedNow()) {
      if (reducedNow() && !seen) markCover();
      setCoverGone(true);
    }
  }, [metas]);

  useEffect(() => {
    if (coverGone || opening) return;
    const id = window.setTimeout(() => setOpening(true), COVER_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [coverGone, opening]);

  useEffect(() => {
    const onHash = () => {
      const t = hashToPage(window.location.hash, metas);
      if (t === null || t === focusRef.current) return;
      if (!coverGone) {
        markCover();
        setCoverGone(true);
      }
      goToRef.current(t);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [metas, coverGone]);

  // ---- keys: ← / → turn the page (not while typing); any key opens a closed cover
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e)) return;
      if (!coverGone) {
        if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpening(true);
        }
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      e.stopPropagation();
      if (!turnRef.current) step(e.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [coverGone, step]);

  // ---- pointers: a drag follows the pointer; mouse drags start on the page corners so text stays selectable
  const idxRef = useRef(idx);
  const perViewRef = useRef(perView);
  useEffect(() => {
    idxRef.current = idx;
    perViewRef.current = perView;
  }, [idx, perView]);

  const dragApi = useMemo(() => {
    const end = () => {
      drag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    function move(e: PointerEvent) {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      const now = performance.now();
      if (now - d.lt > 16) {
        d.v = Math.abs(e.clientX - d.lx) / (now - d.lt);
        d.lx = e.clientX;
        d.lt = now;
      }
      if (!d.started) {
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        const dir: 1 | -1 = dx < 0 ? 1 : -1;
        if (d.forced && d.forced !== dir) return;
        const to = idxRef.current + dir * perViewRef.current;
        if (to < 0 || to >= count) {
          end();
          return;
        }
        d.started = true;
        d.dir = dir;
        d.to = to;
        suppress.current = true;
        const t: Turn = { dir, from: idxRef.current, to, riffle: 0, wide: perViewRef.current === 2 };
        turnRef.current = t;
        pRef.current = 0;
        auto.current = null;
        setTurn(t);
      }
      apply(dragProgress(dx, (book.current?.clientWidth ?? 600) / perViewRef.current));
    }
    function up(e: PointerEvent) {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      end();
      if (!d.started) return;
      if (e.type !== "pointercancel" && shouldComplete(pRef.current, d.v)) {
        focusRef.current = d.to;
        setFocusPage(d.to);
        nav.current = { page: d.to, moveFocus: false };
        animateTo(1, TURN_MS, () => finish(true));
      } else animateTo(0, 500, () => finish(false));
    }
    return { move, up, end };
  }, [count, apply, animateTo, finish]);
  useEffect(() => dragApi.end, [dragApi]);

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    e.stopPropagation(); // the book never lets a turn reach anything behind it (the pointerClaim rule)
    if (!coverGone || turnRef.current || e.button > 0) return;
    const el = e.target as HTMLElement;
    const corner = el.closest<HTMLElement>("[data-corner]");
    if (e.pointerType === "mouse" && !corner) return;
    if (!corner && el.closest(NO_DRAG)) return;
    const forced = corner ? (corner.dataset.corner === "next" ? 1 : -1) : 0;
    const now = performance.now();
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: now, lx: e.clientX, lt: now, v: 0, forced, started: false, dir: 1, to: 0 };
    window.addEventListener("pointermove", dragApi.move);
    window.addEventListener("pointerup", dragApi.up);
    window.addEventListener("pointercancel", dragApi.up);
  };

  const cornerClick = (dir: 1 | -1) => {
    if (suppress.current) {
      suppress.current = false;
      return;
    }
    if (!turnRef.current) step(dir);
  };

  // ---- the pen: each page is written once per session after it settles; a tap shows everything
  const settled = !turn;
  useLayoutEffect(() => {
    const host = book.current;
    if (!host || !coverGone || !settled || reducedNow()) return;
    const blocks: HTMLElement[] = [];
    const keys: string[] = [];
    for (const i of [idx, ...(wide ? [idx + 1] : [])]) {
      if (i >= count || inkSeen.has(`r:${i}`)) continue;
      keys.push(`r:${i}`);
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
  }, [coverGone, settled, idx, wide, count]);

  const view = [idx, ...(wide && idx + 1 < count ? [idx + 1] : [])];
  const chapter = chapterOfView(metas, focusPage);
  const folio = wide ? `Pages ${idx + 1}${view.length > 1 ? `–${view[view.length - 1] + 1}` : ""} of ${count}` : `Page ${idx + 1} of ${count}`;
  const leaves = turn ? turn.riffle : 0;

  return (
    <div className={s.stage}>
      <div ref={frame} className={s.frame} data-wide={wide} data-js={ready} data-turning={!!turn}>
        <div ref={book} className={s.book} onPointerDown={onPointerDown}>
          {pages.map((pg, i) => {
            const r = roleOf(i);
            const off = r.role === "hidden" || (ready && !coverGone);
            const resting = !turn && (r.role === "left" || r.role === "right" || r.role === "solo");
            const active = coverGone && resting;
            return (
              <section
                key={pg.meta.id}
                ref={(el) => {
                  pageEls.current[i] = el;
                }}
                className={s.page}
                data-role={r.role}
                data-col={r.col}
                data-origin={r.origin}
                data-kind={pg.meta.chapter}
                data-active={active}
                data-fresh={resting && fresh > 0 ? (fresh % 2 ? "a" : "b") : undefined}
                aria-hidden={off || r.role === "front" || r.role === "back" || r.role === "under" ? true : undefined}
                inert={off || r.role === "front" || r.role === "back" || r.role === "under"}
                aria-label={`${pg.meta.title}, page ${i + 1} of ${count}`}
                id={`page-${pg.meta.id}`}
              >
                <PageActive.Provider value={active}>{pg.node}</PageActive.Provider>
              </section>
            );
          })}
          {Array.from({ length: leaves }, (_, k) => (
            <i
              key={k}
              ref={(el) => {
                leafEls.current[k] = el;
              }}
              className={s.leaf}
              data-dir={turn?.dir}
              data-wide={turn?.wide}
              aria-hidden="true"
            />
          ))}
          <i className={s.spine} aria-hidden="true" />
          {coverGone && (
            <>
              <button type="button" data-corner="prev" aria-label="Previous page" disabled={idx === 0} className={cx(s.corner, s.cornerL)} onClick={() => cornerClick(-1)}>
                <span aria-hidden="true">‹</span>
              </button>
              <button type="button" data-corner="next" aria-label="Next page" disabled={idx + perView >= count} className={cx(s.corner, s.cornerR)} onClick={() => cornerClick(1)}>
                <span aria-hidden="true">›</span>
              </button>
              <p className={s.folio} role="status" aria-live="polite">
                {folio}
              </p>
            </>
          )}
          {!coverGone && (
            <div
              className={s.cover}
              data-open={opening}
              aria-hidden="true"
              onClick={() => setOpening(true)}
              onAnimationEnd={() => {
                markCover();
                setCoverGone(true);
              }}
            >
              <i className={s.coverCorner} data-c="tl" />
              <i className={s.coverCorner} data-c="tr" />
              <i className={s.coverCorner} data-c="bl" />
              <i className={s.coverCorner} data-c="br" />
              <span className={s.coverName}>{name}</span>
              <span className={s.coverTitle}>{title}</span>
            </div>
          )}
        </div>

        <nav className={s.ribbons} aria-label="Chapters">
          {RIBBONS.map((r, k) => (
            <a
              key={r.chapter}
              href={`#${r.chapter}`}
              className={s.tab}
              data-k={k}
              aria-current={chapter === r.chapter ? "page" : undefined}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                const t = hashToPage(`#${r.chapter}`, metas);
                if (t === null) return;
                if (!coverGone) {
                  markCover();
                  setCoverGone(true);
                }
                goTo(t);
              }}
            >
              {r.label}
            </a>
          ))}
        </nav>

        <div className={s.sparks} aria-hidden="true">
          {[8, 22, 37, 55, 71, 88].map((x, k) => (
            <i key={x} style={{ left: `${x}%`, animationDelay: `${k * 0.9}s`, animationDuration: `${5 + (k % 3)}s` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
