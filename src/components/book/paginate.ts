// Pure helper: split About paragraphs into short pages (presentation only; all text stays reachable).
export function paginate(paras: readonly string[], maxChars = 260): string[][] {
  const pages: string[][] = [];
  let cur: string[] = [];
  let len = 0;
  for (const p of paras) {
    if (cur.length && len + p.length > maxChars) {
      pages.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(p);
    len += p.length;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

export const pageLabel = (i: number, total: number) => `Page ${i + 1} of ${total}`;

/** First page of the spread that holds page `i` (spreads start on even pages, single view on every page). */
export const viewStart = (i: number, perView: number) => i - (i % perView);

/** The page indexes shown together for a view starting at `idx`. */
export function pageView(idx: number, perView: number, count: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < perView; k++) if (idx + k < count) out.push(idx + k);
  return out;
}

/** The view start after turning `dir` (+1 forward, -1 back); stays put at either end. */
export function nextIndex(idx: number, dir: 1 | -1, perView: number, count: number): number {
  const to = viewStart(idx, perView) + dir * perView;
  return to < 0 || to >= count ? viewStart(idx, perView) : to;
}

/**
 * The pen's schedule: each block gets a share of `totalMs` by text weight (never shorter than
 * `minMs`), written one after another. Pure, so the timing is testable.
 */
export function inkPlan(weights: readonly number[], totalMs = 1800, minMs = 140): { delay: number; duration: number }[] {
  const sum = weights.reduce((a, w) => a + Math.max(w, 1), 0) || 1;
  let at = 0;
  return weights.map((w) => {
    const duration = Math.max(minMs, Math.round((totalMs * Math.max(w, 1)) / sum));
    const step = { delay: at, duration };
    at += duration;
    return step;
  });
}
