import type { ReactNode } from "react";
import o from "./ornaments.module.css";

/** A small three-tier pagoda roof with a gold finial: the mark above every section heading. Takes its colour from `color`. */
export function PagodaRoof({ className }: { className?: string }) {
  return (
    <svg className={`${o.roof} ${className ?? ""}`} viewBox="0 0 72 34" width="54" height="26" aria-hidden="true" focusable="false">
      <path className={o.roofGold} d="M36 0 L37.6 7 H34.4 Z M33 7 H39 L38 10 H34 Z" />
      <path fill="currentColor" d="M22 18 Q26 14 28 12 Q34 10 36 10 Q38 10 44 12 Q46 14 50 18 Q46 17 44 17 H28 Q26 17 22 18 Z" />
      <path fill="currentColor" d="M14 26 Q20 24 23 20 Q36 17 49 20 Q52 24 58 26 Q52 25 49 25 H23 Q20 25 14 26 Z" />
      <path fill="currentColor" d="M4 33 Q12 32 17 28 Q36 24 55 28 Q60 32 68 33 Q60 32 55 32 H17 Q12 32 4 33 Z" />
    </svg>
  );
}

/** A band of Dhaka-topi pattern. The host sets --dhaka (a CSS url()) on a wrapper. */
export function DhakaBand({ className }: { className?: string }) {
  return <div className={`${o.dhaka} ${className ?? ""}`} aria-hidden="true" />;
}

function Rosette() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <g className={o.gold}>
        <ellipse cx="12" cy="5" rx="2.6" ry="4.6" />
        <ellipse cx="12" cy="19" rx="2.6" ry="4.6" />
        <ellipse cx="5" cy="12" rx="4.6" ry="2.6" />
        <ellipse cx="19" cy="12" rx="4.6" ry="2.6" />
      </g>
      <circle cx="12" cy="12" r="3.2" className={o.wood} />
      <circle cx="12" cy="12" r="1.5" className={o.gold} />
    </svg>
  );
}

/**
 * A Newari carved-wood window frame around a photo: wood grain, gold inlay, rosettes in the
 * corners, a pagoda roof on top and a Dhaka-pattern sill underneath.
 */
export function CarvedFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`${o.frame} ${className ?? ""}`}>
      <PagodaRoof className={o.frameRoof} />
      <div className={o.pane}>{children}</div>
      <div className={o.sill} aria-hidden="true" />
      <span className={`${o.corner} ${o.tl}`} aria-hidden="true"><Rosette /></span>
      <span className={`${o.corner} ${o.tr}`} aria-hidden="true"><Rosette /></span>
      <span className={`${o.corner} ${o.bl}`} aria-hidden="true"><Rosette /></span>
      <span className={`${o.corner} ${o.br}`} aria-hidden="true"><Rosette /></span>
    </div>
  );
}

function CarvedWindow({ x }: { x: number }) {
  const bars: number[] = [];
  for (let i = 1; i < 5; i++) bars.push(i);
  return (
    <g transform={`translate(${x} 0)`}>
      <rect x="0" y="14" width="64" height="104" rx="4" className={o.wWood} />
      <path d="M8 40 Q32 8 56 40 Z" className={o.wLit} />
      <rect x="8" y="40" width="48" height="66" className={o.wLit} />
      {bars.map((i) => (
        <path key={i} d={`M${8 + i * 9.6} 22 V106`} className={o.wBar} />
      ))}
      {[52, 64, 76, 88].map((y) => (
        <path key={y} d={`M8 ${y} H56`} className={o.wBar} />
      ))}
      <path d="M32 18 V40 M20 24 L26 40 M44 24 L38 40" className={o.wBar} />
      <rect x="3" y="106" width="58" height="9" rx="2" className={o.wGold} />
      <circle cx="32" cy="12" r="5" className={o.wGold} />
    </g>
  );
}

/** The footer: a Bhaktapur brick wall with a row of carved windows, glowing like evening. */
export function NewariBand() {
  const xs = [0, 1, 2, 3, 4, 5, 6].map((i) => 20 + i * 150);
  return (
    <div className={o.band} aria-hidden="true">
      <svg viewBox="0 0 1080 130" preserveAspectRatio="xMidYMid slice" focusable="false">
        {xs.map((x) => (
          <CarvedWindow key={x} x={x} />
        ))}
      </svg>
    </div>
  );
}
