"use client";

import { Children, useEffect, useState, type ReactNode } from "react";

// Same session key and rules as resolveLeadId() in src/content/lead.ts. That file imports the whole
// profile, which would weigh down this page's JavaScript, so the (tiny) rule is repeated here with
// the flagship ids passed in from the server.
const LEAD_KEY = "lead-project";

function pickLead(ids: string[]): string | undefined {
  if (ids.length < 2) return ids[0];
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has("debug") || process.env.NODE_ENV !== "production") {
      const want = q.get("lead")?.trim().toLowerCase();
      const hit = want ? ids.find((id) => id.toLowerCase().includes(want)) : undefined;
      if (hit) return hit;
    }
  } catch {
    /* ignore */
  }
  try {
    const saved = window.sessionStorage.getItem(LEAD_KEY);
    if (saved && ids.includes(saved)) return saved;
    const pick = ids[Math.min(ids.length - 1, Math.floor(Math.random() * ids.length))];
    window.sessionStorage.setItem(LEAD_KEY, pick);
    return pick;
  } catch {
    return ids[0];
  }
}

/**
 * Puts this session's lead project first. The server and the first client render use the default
 * order (so hydration matches); right after mount the lead moves to the front. The cards are the
 * same size, so nothing else shifts. Each child needs key = project id.
 */
export function LeadSwap({ ids, children }: { ids: string[]; children: ReactNode }) {
  const [lead, setLead] = useState<string | undefined>();
  useEffect(() => {
    // after hydration: read the session's lead (sessionStorage) and apply it
    setLead(pickLead(ids));
  }, [ids]);
  const items = Children.toArray(children);
  if (!lead) return <>{items}</>;
  const i = items.findIndex((c) => typeof c === "object" && c !== null && "key" in c && String((c as { key: unknown }).key).endsWith(`$${lead}`));
  if (i <= 0) return <>{items}</>;
  return <>{[items[i], ...items.slice(0, i), ...items.slice(i + 1)]}</>;
}
