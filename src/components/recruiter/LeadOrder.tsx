"use client";

import { Children, useEffect, useState, type ReactNode } from "react";
import { resolveLeadId } from "@/content/lead";

/**
 * Puts this session's lead project first. The server (and the first client render) show the
 * default order, so hydration always matches; right after mount the session's lead moves to the
 * front. Cards are the same size, so nothing else on the page shifts. Each child needs a `key`
 * equal to its project id.
 */
export function LeadOrder({ children }: { children: ReactNode }) {
  const [leadId, setLeadId] = useState<string | undefined>(undefined);
  useEffect(() => {
    // after hydration: read the session's lead (sessionStorage) and apply it
    setLeadId(resolveLeadId());
  }, []);
  const items = Children.toArray(children);
  if (!leadId) return <>{items}</>;
  const isLead = (c: ReactNode) => typeof c === "object" && c !== null && "key" in c && String((c as { key: unknown }).key).endsWith(`$${leadId}`);
  const i = items.findIndex(isLead);
  if (i <= 0) return <>{items}</>;
  return <>{[items[i], ...items.slice(0, i), ...items.slice(i + 1)]}</>;
}
