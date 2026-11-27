// The antique cover of the recruiter book: tooled leather, a debossed Newari/Dhaka border, brass corners and clasp,
// a worn gold-leaf name, a gilded page edge. Pure CSS + inline SVG (two tiny tiled WebPs). Decorative: aria-hidden, no heading.
// Opening: the clasp unlatches with a glint, then the cover swings on its hinge. Only transform and opacity move.
import type { CSSProperties } from "react";
import c from "./cover.module.css";

const MOTES = Array.from({ length: 10 }, (_, k) => ({
  "--x": `${8 + ((k * 37) % 84)}%`,
  "--y": `${12 + ((k * 53) % 70)}%`,
  "--d": `${7 + (k % 4) * 2}s`,
  "--w": `${(k * 0.9).toFixed(1)}s`,
  "--s": `${2 + (k % 3)}px`,
})) as CSSProperties[];

const PETAL = "M32 10C40 20 40 28 32 38C24 28 24 20 32 10Z";

/** One brass corner protector (top-left; the others mirror it with CSS). */
function BrassCorner({ at }: { at: "tl" | "tr" | "bl" | "br" }) {
  return (
    <svg className={c.corner} data-c={at} viewBox="0 0 64 64" focusable="false">
      <path d="M0 0H62C48 4 38 11 30 22C22 33 9 42 0 62Z" fill="url(#cvBrass)" stroke="#3a2608" strokeWidth="1.2" />
      <path d="M0 0H50C40 5 33 11 26 20C19 29 9 37 0 50Z" fill="none" stroke="#fff3c4" strokeOpacity="0.5" strokeWidth="0.9" />
      <path d="M8 24C12 16 16 12 24 8" fill="none" stroke="#5b3d0b" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="11" cy="11" r="3.6" fill="url(#cvBrass)" stroke="#3a2608" strokeWidth="0.8" />
      <circle cx="10.2" cy="10.2" r="1" fill="#fff3c4" fillOpacity="0.8" />
    </svg>
  );
}

export function Cover({ name, title, open, onOpen, onDone }: { name: string; title: string; open: boolean; onOpen: () => void; onDone: () => void }) {
  return (
    <div className={c.wrap} data-open={open} aria-hidden="true" onClick={onOpen}>
      <svg className={c.defs} width="0" height="0" focusable="false">
        <defs>
          <linearGradient id="cvBrass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f6dc8e" />
            <stop offset="0.45" stopColor="#c79a3a" />
            <stop offset="0.7" stopColor="#8a6218" />
            <stop offset="1" stopColor="#d9b25a" />
          </linearGradient>
          {/* the Dhaka border: lozenges and dots in a 24 px repeat */}
          <pattern id="cvDhaka" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M12 2L22 12L12 22L2 12Z" fill="none" stroke="#120803" strokeOpacity="0.5" strokeWidth="1.6" />
            <path d="M12 7L17 12L12 17L7 12Z" fill="#120803" fillOpacity="0.33" />
            <circle cx="0" cy="0" r="1.8" fill="#120803" fillOpacity="0.5" />
            <circle cx="24" cy="24" r="1.8" fill="#120803" fillOpacity="0.5" />
            <circle cx="24" cy="0" r="1.8" fill="#120803" fillOpacity="0.5" />
            <circle cx="0" cy="24" r="1.8" fill="#120803" fillOpacity="0.5" />
          </pattern>
          <pattern id="cvDhakaHi" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="translate(1 1)">
            <path d="M12 2L22 12L12 22L2 12Z" fill="none" stroke="#e7b77a" strokeOpacity="0.25" strokeWidth="1.2" />
          </pattern>
        </defs>
      </svg>

      <i className={c.edgeR} />
      <i className={c.edgeB} />
      <i className={c.shade} />

      <div className={c.cover} onAnimationEnd={(e) => e.target === e.currentTarget && onDone()}>
        <i className={c.grain} />
        <i className={c.wear} />
        <i className={c.window} />
        <i className={c.lamp} />

        <i className={c.line} data-k="outer" />
        <i className={c.line} data-k="inner" />
        <svg className={c.border} focusable="false">
          <rect x="0" y="0" width="100%" height="100%" fill="none" stroke="url(#cvDhakaHi)" strokeWidth="24" />
          <rect x="0" y="0" width="100%" height="100%" fill="none" stroke="url(#cvDhaka)" strokeWidth="24" />
        </svg>

        <i className={c.spineStrip} />

        <BrassCorner at="tl" />
        <BrassCorner at="tr" />
        <BrassCorner at="bl" />
        <BrassCorner at="br" />

        <div className={c.plate}>
          <svg className={c.lotus} viewBox="0 0 64 64" focusable="false">
            <g fill="none" stroke="url(#cvBrass)" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="32" cy="32" r="28" />
              <circle cx="32" cy="32" r="22" strokeDasharray="2 4" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                <path key={a} d={PETAL} transform={`rotate(${a} 32 32)`} />
              ))}
            </g>
            <circle cx="32" cy="32" r="4" fill="url(#cvBrass)" />
          </svg>
          <span className={c.name}>{name}</span>
          <svg className={c.rule} viewBox="0 0 220 14" focusable="false">
            <path d="M2 7H92M128 7H218M110 1L116 7L110 13L104 7Z" fill="none" stroke="url(#cvBrass)" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span className={c.sub}>{title}</span>
        </div>

        <div className={c.clasp}>
          <svg viewBox="0 0 56 120" focusable="false">
            <g className={c.tongue}>
              <path d="M16 0H40V70Q40 86 28 96Q16 86 16 70Z" fill="url(#cvBrass)" stroke="#3a2608" strokeWidth="1.2" />
              <path d="M21 6H35V68Q35 80 28 88Q21 80 21 68Z" fill="none" stroke="#fff3c4" strokeOpacity="0.5" strokeWidth="0.9" />
              <circle cx="28" cy="70" r="5" fill="#2a1604" stroke="#3a2608" />
            </g>
            <rect x="8" y="92" width="40" height="26" rx="6" fill="url(#cvBrass)" stroke="#3a2608" strokeWidth="1.2" />
            <path d="M26 98h4v10h-4z" fill="#2a1604" />
            <circle cx="14" cy="105" r="2.2" fill="#5b3d0b" />
            <circle cx="42" cy="105" r="2.2" fill="#5b3d0b" />
          </svg>
          <i className={c.glint} />
        </div>

        <i className={c.sheen} />
        <span className={c.hint}>Tap to open</span>
      </div>

      <div className={c.motes}>
        {MOTES.map((m, k) => (
          <i key={k} style={m} />
        ))}
      </div>
    </div>
  );
}
