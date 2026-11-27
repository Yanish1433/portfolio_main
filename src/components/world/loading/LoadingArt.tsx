import type { CSSProperties } from "react";
import s from "./loading.module.css";

const FLAGS = ["#2a6fd1", "#f4f1ea", "#d3262e", "#2f9e5b", "#f2b705"];

/** Inline art: warm sky, hills, a five-tier temple silhouette and a string of prayer flags. Server-safe. */
function Scene() {
  const flags = Array.from({ length: 18 }, (_, i) => {
    const t = (i + 0.5) / 18;
    const x = Math.round(t * 400);
    const y = Math.round(18 + 14 * Math.sin(Math.PI * t));
    return <path key={i} d={`M${x - 6} ${y} h12 l-6 13 z`} fill={FLAGS[i % 5]} opacity={0.92} />;
  });
  return (
    <svg className={s.art} viewBox="0 0 400 240" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <path d="M0 18 Q200 46 400 18" fill="none" stroke="#3a2418" strokeWidth="1" />
      {flags}
      <path d="M0 190 L70 140 L110 168 L170 120 L240 172 L300 130 L400 186 V240 H0Z" fill="#7a4a52" opacity="0.55" />
      <g fill="#2a1722" transform="translate(0 24)">
        <rect x="170" y="196" width="60" height="8" />
        <rect x="176" y="188" width="48" height="8" />
        <path d="M156 188 H244 L228 172 H172Z" />
        <path d="M164 172 H236 L222 156 H178Z" />
        <path d="M172 156 H228 L217 141 H183Z" />
        <path d="M180 141 H220 L211 128 H189Z" />
        <path d="M188 128 H212 L200 108Z" />
        <rect x="199" y="98" width="2" height="12" />
      </g>
      <path d="M0 204 Q200 190 400 204 V240 H0Z" fill="#2a1722" />
    </svg>
  );
}

/** The loading screen. `pct` null = unknown (static route fallback): a sliding bar instead of a fill. */
export function LoadingArt({ pct = null, tip, fading = false }: { pct?: number | null; tip: string; fading?: boolean }) {
  return (
    <div className={`${s.card} ${fading ? s.fade : ""}`} role="status" aria-live="polite">
      <Scene />
      <div className={s.text}>
        <p className={s.ne} lang="ne">
          यानिश गुरुङ
        </p>
        <h1 className={s.title}>Loading the town…</h1>
        <div
          className={`${s.track} ${pct === null ? s.indet : ""}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct ?? undefined}
        >
          <div className={s.fill} style={pct === null ? undefined : ({ "--pct": `${pct}%` } as CSSProperties)} />
        </div>
        {pct !== null && <p className={s.pct}>{pct}%</p>}
        <p className={s.tip}>{tip}</p>
      </div>
    </div>
  );
}
