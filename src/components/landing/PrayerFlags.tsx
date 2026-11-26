import type { CSSProperties } from "react";
import s from "./flags.module.css";

// The five traditional lung-ta colours, in order: blue (sky), white (air), red (fire), green (water), yellow (earth).
const COLOURS = ["#2a6fd1", "#f4f1ea", "#d3262e", "#2f9e5b", "#f2b705"];
const W = 1200;

type String_ = { from: [number, number]; ctrl: [number, number]; to: [number, number]; count: number; size: number };

const STRINGS: String_[] = [
  { from: [-30, 4], ctrl: [560, 116], to: [1230, 34], count: 34, size: 1 },
  { from: [-30, 44], ctrl: [640, 124], to: [1230, 8], count: 30, size: 0.85 },
];

function flagsOn(str: String_, offset: number) {
  const { from, ctrl, to, count } = str;
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 0.5) / count;
    const x = (1 - t) * (1 - t) * from[0] + 2 * (1 - t) * t * ctrl[0] + t * t * to[0];
    const y = (1 - t) * (1 - t) * from[1] + 2 * (1 - t) * t * ctrl[1] + t * t * to[1];
    const dx = 2 * (1 - t) * (ctrl[0] - from[0]) + 2 * t * (to[0] - ctrl[0]);
    const dy = 2 * (1 - t) * (ctrl[1] - from[1]) + 2 * t * (to[1] - ctrl[1]);
    return { x, y, a: (Math.atan2(dy, dx) * 180) / Math.PI, c: COLOURS[(i + offset) % 5], d: (i * 0.37) % 2.6 };
  });
}

/** Prayer-flag strings across the top, five colours, fluttering in CSS (switched off under reduced motion). */
export function PrayerFlags() {
  return (
    <svg className={s.flags} viewBox={`0 0 ${W} 150`} preserveAspectRatio="xMidYMin slice" aria-hidden="true" focusable="false">
      {STRINGS.map((str, k) => (
        <g key={k}>
          <path
            className={s.string}
            d={`M${str.from[0]},${str.from[1]} Q${str.ctrl[0]},${str.ctrl[1]} ${str.to[0]},${str.to[1]}`}
          />
          {flagsOn(str, k * 2).map((f, i) => (
            <g key={i} transform={`translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) rotate(${f.a.toFixed(1)})`}>
              <rect
                className={s.flag}
                x={-8 * str.size}
                y="0.5"
                width={16 * str.size}
                height={21 * str.size}
                fill={f.c}
                style={{ animationDelay: `-${f.d.toFixed(2)}s` } as CSSProperties}
              />
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}
