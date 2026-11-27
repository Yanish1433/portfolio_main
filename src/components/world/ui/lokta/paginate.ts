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
