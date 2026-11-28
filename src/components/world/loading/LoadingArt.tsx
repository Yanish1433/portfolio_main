import type { CSSProperties } from "react";
import s from "./loading.module.css";
import { TIME_SCRIPT } from "@/lib/time/timeScript";
import type { Tod } from "@/lib/time/clock";

/** The loading screen: the town overview picture (same art as the landing's Explore card) + a slim bar. `pct` null = unknown (static route fallback).
 *  The picture is a CSS background per [data-tod] on the card, set before first paint by the inline time script (server fallback)
 *  or passed as `tod` by the client overlay, so only the matching image downloads. `tip` is kept for API compat. */
export function LoadingArt({ pct = null, fading = false, tod }: { pct?: number | null; tip?: string; fading?: boolean; tod?: Tod }) {
  return (
    <div className={`${s.card} ${fading ? s.fade : ""}`} role="status" aria-live="polite" data-tod={tod} suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: TIME_SCRIPT }} />
      <div className={s.pic} aria-hidden="true" />
      <div className={s.text}>
        <p className={s.title}>Building Bhaktapur…</p>
        <div
          className={`${s.track} ${pct === null ? s.indet : ""}`}
          role="progressbar"
          aria-label="Loading the town"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct ?? undefined}
        >
          <div className={s.fill} style={pct === null ? undefined : ({ "--pct": `${pct}%` } as CSSProperties)} />
        </div>
        <p className={s.pct}>{pct === null ? "\u00a0" : `${pct}%`}</p>
      </div>
    </div>
  );
}
