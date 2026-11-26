import type { CSSProperties, ReactNode } from "react";
import s from "./scene.module.css";
import { pagoda, ridge, shikhara, snowCap, stars, stupa, type Pt } from "./art";

const W = 1440;
const H = 640;

const FAR: Pt[] = [[0, 430], [80, 350], [150, 390], [250, 260], [330, 340], [410, 300], [520, 185], [560, 250], [610, 300], [700, 205], [722, 238], [748, 195], [800, 330], [880, 270], [960, 150], [1030, 290], [1110, 235], [1200, 340], [1290, 265], [1370, 345], [1440, 310]];
const FAR_CAPS: [number, number][] = [[3, 62], [6, 78], [9, 56], [11, 56], [14, 88], [16, 56], [18, 50]];
const MID: Pt[] = [[0, 500], [100, 430], [190, 470], [300, 390], [400, 460], [500, 420], [600, 480], [720, 400], [820, 470], [930, 410], [1040, 480], [1140, 420], [1250, 475], [1340, 430], [1440, 470]];
const MID_CAPS: [number, number][] = [[3, 46], [7, 46], [9, 40], [11, 36]];

const farPath = ridge(FAR, H, 11, 6);
const farCaps = FAR_CAPS.map(([i, d]) => snowCap(FAR, i, d)).join(" ");
const midPath = ridge(MID, H, 29, 5);
const midCaps = MID_CAPS.map(([i, d]) => snowCap(MID, i, d)).join(" ");
const hills = `M0,${H} L0,525 C180,488 300,548 480,520 S800,478 960,526 S1290,506 1440,494 L1440,${H} Z`;
const hill = stupa(236, 516, 54);
const skyStars = stars(46, W, 300, 7);

// The town skyline: pagoda roofs, a shikhara and Newari houses with lit carved windows.
const TH = 240;
const towers = [
  pagoda(150, TH, 92, 3, 34),
  pagoda(420, TH, 124, 5, 36),
  shikhara(640, TH, 92, 175),
  pagoda(905, TH, 112, 4, 36),
  pagoda(1180, TH, 84, 2, 34),
  pagoda(1352, TH, 72, 3, 30),
];
const houseSpecs: [number, number, number][] = [
  [8, 66, 78], [84, 58, 64], [258, 64, 72], [300, 54, 58], [538, 62, 70], [734, 66, 80], [800, 56, 62], [1030, 64, 74], [1090, 52, 60], [1258, 62, 70], [1404, 40, 66],
];
const houses = houseSpecs.map(([x, w, h]) => {
  const top = TH - h;
  return {
    d: `M${x - 3},${TH} L${x - 3},${top + 8} L${x - 8},${top + 12} L${x + w / 2},${top - 14} L${x + w + 8},${top + 12} L${x + w + 3},${top + 8} L${x + w + 3},${TH} Z`,
    // carved windows: one centred on each of up to two floors
    wins: [top + 20, top + 46].filter((y) => y + 20 < TH - 6).map((y) => ({ x: x + w / 2 - 7, y })),
  };
});

function Window({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path className={s.lit} d={`M${x},${y + 20} L${x},${y + 6} Q${x + 7},${y - 5} ${x + 14},${y + 6} L${x + 14},${y + 20} Z`} />
      <path className={s.lattice} d={`M${x + 4.7},${y + 2} V${y + 20} M${x + 9.3},${y + 2} V${y + 20} M${x},${y + 11} H${x + 14}`} />
    </g>
  );
}

function Layer({ depth, className, children }: { depth: number; className?: string; children: ReactNode }) {
  return (
    <div className={`${s.layer} ${className ?? ""}`} style={{ "--d": depth } as CSSProperties}>
      {children}
    </div>
  );
}

/**
 * Layered Himalaya scenery in pure SVG. Colours come from CSS variables, so one drawing serves
 * both the sunrise (light) and twilight (dark) themes. `full` is the landing hero (parallax-ready,
 * with the pagoda skyline); `band` is the quiet strip at the top of Recruiter Mode.
 * Parallax: a client component sets --mx (-1..1) and --sy (scroll px) on an ancestor.
 */
export function Himalaya({ variant = "full" }: { variant?: "full" | "band" }) {
  const full = variant === "full";
  return (
    <div className={`${s.scene} ${full ? s.full : s.band}`} aria-hidden="true" data-scene>
      <div className={s.orb} />
      <svg className={s.stars} viewBox={`0 0 ${W} 300`} preserveAspectRatio="xMidYMin slice" focusable="false">
        {skyStars.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={p.r} />
        ))}
      </svg>
      <div className={s.cloud} data-c="1" />
      <div className={s.cloud} data-c="2" />
      <Layer depth={0.05}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" focusable="false">
          <path className={s.far} d={farPath} />
          <path className={s.farCap} d={farCaps} />
        </svg>
      </Layer>
      <div className={s.mist} />
      <Layer depth={0.12}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" focusable="false">
          <path className={s.mid} d={midPath} />
          <path className={s.midCap} d={midCaps} />
        </svg>
      </Layer>
      <Layer depth={0.22}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" focusable="false">
          <path className={s.town} d={hill.body} />
          <path className={s.gold} d={hill.gold} />
          <path className={s.near} d={hills} />
        </svg>
      </Layer>
      {full && (
        <Layer depth={0.34} className={s.townLayer}>
          <svg viewBox={`0 0 ${W} ${TH}`} preserveAspectRatio="xMidYMax slice" focusable="false">
            {towers.map((t, i) => (
              <g key={i}>
                <path className={s.townFar} d={t.body} />
                <path className={s.gold} d={t.gold} />
              </g>
            ))}
            {houses.map((h, i) => (
              <g key={i}>
                <path className={s.town} d={h.d} />
                {h.wins.map((w, j) => (
                  <Window key={j} x={w.x} y={w.y} />
                ))}
              </g>
            ))}
            <rect className={s.town} x="0" y={TH - 10} width={W} height="12" />
          </svg>
        </Layer>
      )}
    </div>
  );
}
