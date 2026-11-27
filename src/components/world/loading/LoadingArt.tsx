import type { CSSProperties } from "react";
import s from "./loading.module.css";

/** The loading screen: the town's big pagoda (Blender poster) + a slim bar. `pct` null = unknown (static route fallback).
 *  Day/night is picked in CSS from html[data-theme] (set pre-paint), so it is server-safe. `tip` is kept for API compat. */
export function LoadingArt({ pct = null, fading = false }: { pct?: number | null; tip?: string; fading?: boolean }) {
  return (
    <div className={`${s.card} ${fading ? s.fade : ""}`} role="status" aria-live="polite">
      <div className={s.stage}>
        <div className={s.glow} aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={`${s.pagoda} ${s.day}`} src="/recruiter/poster-day.webp" alt="" fetchPriority="high" decoding="async" width={960} height={540} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={`${s.pagoda} ${s.night}`} src="/recruiter/poster-night.webp" alt="" fetchPriority="high" decoding="async" width={960} height={540} />
      </div>
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
