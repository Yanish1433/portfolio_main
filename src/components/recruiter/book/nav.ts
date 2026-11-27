// Pure page maths for the recruiter book (no React): where a chapter or a #hash lives, which pages make a view,
// how a turn is drawn from a progress number. Tested in nav.test.ts.

export type Chapter = "contents" | "about" | "projects" | "skills" | "journey" | "contact" | "back";

/** What the book needs to know about a page (the node itself is separate). */
export type PageMeta = { id: string; chapter: Chapter; title: string };

/** The five ribbon tabs, in order. */
export const RIBBONS: { chapter: Chapter; label: string }[] = [
  { chapter: "about", label: "About" },
  { chapter: "projects", label: "Projects" },
  { chapter: "skills", label: "Skills" },
  { chapter: "journey", label: "Journey" },
  { chapter: "contact", label: "Contact" },
];

/** Index of the first page of a chapter, or -1. */
export function chapterIndex(pages: readonly PageMeta[], chapter: Chapter): number {
  return pages.findIndex((p) => p.chapter === chapter);
}

/** "#about" / "#projects" / "#<page id>" (a project id) -> page index, or null when the hash names nothing. */
export function hashToPage(hash: string, pages: readonly PageMeta[]): number | null {
  let raw = (hash ?? "").replace(/^#/, "");
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* keep the raw text */
  }
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  const byId = pages.findIndex((p) => p.id.toLowerCase() === key);
  if (byId >= 0) return byId;
  const byChapter = pages.findIndex((p) => p.chapter === key);
  return byChapter >= 0 ? byChapter : null;
}

/** The hash that names a page: a project page by its id, any other page by its chapter. */
export function hashForPage(meta: PageMeta): string {
  return `#${meta.chapter === "projects" ? meta.id : meta.chapter}`;
}

/** The chapter a view belongs to (for the active ribbon): the first page of the view. */
export function chapterOfView(pages: readonly PageMeta[], at: number): Chapter {
  return pages[Math.min(Math.max(at, 0), pages.length - 1)]?.chapter ?? "contents";
}

/** First page of the view that holds page `i` (spreads start on even pages, one page on phones). */
export const viewStart = (i: number, perView: number) => i - (i % perView);

/** How many whole spreads lie between two views (0 = same view). */
export const spreadsBetween = (from: number, to: number, perView: number) => Math.abs(viewStart(to, perView) - viewStart(from, perView)) / perView;

/** Leaves that riffle past between two views: the ones strictly in between, at most `max` so it stays quick. */
export const riffleCount = (from: number, to: number, perView: number, max = 5) => Math.min(Math.max(spreadsBetween(from, to, perView) - 1, 0), max);

/**
 * One leaf angle from progress p (0..1): the front of the leaf rises to 90 deg, then the back lands from 90 to 0.
 * Returns which face is visible and its rotateY magnitude in degrees.
 */
export function leafAngle(p: number): { face: "front" | "back"; deg: number; theta: number } {
  const theta = Math.min(Math.max(p, 0), 1) * 180;
  return theta <= 90 ? { face: "front", deg: theta, theta } : { face: "back", deg: 180 - theta, theta };
}

/** A drag distance as progress: dragging 0.9 of a page width is a whole turn. */
export const dragProgress = (dx: number, pageWidth: number) => Math.min(Math.max(Math.abs(dx) / Math.max(pageWidth * 0.9, 1), 0), 1);

/** Let go at progress p with a flick velocity (px/ms): finish the turn past halfway or on a fast flick. */
export const shouldComplete = (p: number, velocity = 0) => p > 0.5 || (p > 0.08 && velocity > 0.6);

/** Easing for programmatic turns (ease in-out). */
export const easeTurn = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
