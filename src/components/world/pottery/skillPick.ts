// Which skill the next pot is stamped with: never a repeat until every skill has been collected.
export function uniqueSkills(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const k = n.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(n.trim());
  }
  return out;
}

export function allCollected(all: readonly string[], collected: Iterable<string>): boolean {
  const have = new Set([...collected].map((s) => s.trim().toLowerCase()));
  return all.length > 0 && all.every((s) => have.has(s.trim().toLowerCase()));
}

/** A skill not yet collected (random, `rnd` in [0,1)); once all are collected, any skill. null only when there are no skills. */
export function pickSkill(all: readonly string[], collected: Iterable<string>, rnd: () => number = Math.random): string | null {
  if (!all.length) return null;
  const have = new Set([...collected].map((s) => s.trim().toLowerCase()));
  const fresh = all.filter((s) => !have.has(s.trim().toLowerCase()));
  const pool = fresh.length ? fresh : all;
  return pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
}
