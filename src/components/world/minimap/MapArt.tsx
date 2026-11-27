// The static ink drawing of the town (SVG, rendered once and memoised). Every shape comes from zones.ts / the wheel
// layout: the island, the wall with its 4 gates, the pagoda, palace, school, Ghar, houses, shrines, pond and wheels.
import { memo } from "react";
import { GATE_ANGLES, GHAR, ISLAND_RADIUS, PALACE, PAGODA, POND, SCHOOL, TIMELINE_PATH, WALL } from "../zones";
import { CENTER, MAP_R, SCALE, worldToMap } from "./mapMath";
import { ZONE_TARGETS } from "./mapData";

const INK = "#2b1d14";
const f = (n: number) => Math.round(n * 10) / 10;

/** A rectangle given in metres (centre, size). Quarter turns swap its sides (same rule as the collision boxes). */
function Box({ x, z, w, d, rot = 0, fill = "rgba(120,80,45,0.18)", sw = 0.8 }: { x: number; z: number; w: number; d: number; rot?: number; fill?: string; sw?: number }) {
  const quarter = Math.abs(Math.sin(rot)) > 0.5;
  const [cx, cy] = worldToMap(x, z, 0, false);
  const W = (quarter ? d : w) * SCALE;
  const D = (quarter ? w : d) * SCALE;
  return <rect x={f(cx - W / 2)} y={f(cy - D / 2)} width={f(W)} height={f(D)} fill={fill} stroke={INK} strokeWidth={sw} strokeLinejoin="round" />;
}

/** Wall: four arcs between the gates (south, east, north, west). */
function wallPath(): string {
  const rMid = (WALL.inner + WALL.outer) / 2;
  const g = WALL.gateHalf / rMid;
  const at = (a: number) => worldToMap(rMid * Math.sin(a), rMid * Math.cos(a), 0, false).map(f).join(" ");
  const r = f(rMid * SCALE);
  return GATE_ANGLES.map((a, i) => {
    const next = i === GATE_ANGLES.length - 1 ? Math.PI * 1.5 : GATE_ANGLES[i + 1];
    return `M${at(a + g)} A${r} ${r} 0 0 0 ${at(next - g)}`;
  }).join(" ");
}

/** Small line icons (drawn in a -6..6 box): house, film screen, wheel, book, path, envelope, tool. Shared with the chips. */
export const GLYPH: Record<string, string> = {
  about: "M-5 0.5 L0 -4.5 L5 0.5 M-3.5 -0.5 V4.5 H3.5 V-0.5",
  projects: "M-5 -3.5 H5 V3.5 H-5 Z M-1.5 -1.8 L2.2 0 L-1.5 1.8 Z",
  skills: "M0 -5 V5 M-5 0 H5 M-3.5 -3.5 L3.5 3.5 M3.5 -3.5 L-3.5 3.5 M-1.6 0 a1.6 1.6 0 1 0 3.2 0 a1.6 1.6 0 1 0 -3.2 0",
  education: "M-5 -3.5 H-0.4 V4 H-5 Z M0.4 -3.5 H5 V4 H0.4 Z",
  journey: "M-5 4 Q-1 3 0 0 T5 -4",
  contact: "M-5 -3.5 H5 V3.5 H-5 Z M-5 -3.5 L0 0.6 L5 -3.5",
  workshop: "M-4 4 L2 -2 M0 -4 H4 V0 L2 -2 Z",
};

// Simple on purpose: island, wall, the brick lane, the big buildings and the pond. No trees, houses or tiny wheels.
function Art() {
  const [pcx, pcy] = worldToMap(PAGODA.x, PAGODA.z, 0, false);
  const lane = TIMELINE_PATH.map(([x, z]) => worldToMap(x, z, 0, false).map(f).join(",")).join(" ");
  const iR = ISLAND_RADIUS * SCALE;
  const pb = PAGODA.base * SCALE;
  return (
    <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="mm-clip">
          <circle cx={CENTER} cy={CENTER} r={MAP_R} />
        </clipPath>
      </defs>
      <g clipPath="url(#mm-clip)">
        <circle cx={CENTER} cy={CENTER} r={f(iR)} fill="rgba(160,120,70,0.2)" stroke={INK} strokeWidth="1.2" />
        <path d={wallPath()} fill="none" stroke="#7a4a2a" strokeWidth={f((WALL.outer - WALL.inner) * SCALE + 1)} strokeLinecap="butt" />
        <polyline points={lane} fill="none" stroke="#8f3320" strokeWidth="2" strokeDasharray="3 2.5" strokeLinecap="round" />
        <Box x={POND.x} z={POND.z} w={POND.w} d={POND.d} fill="rgba(70,130,150,0.5)" sw={1} />
        <Box x={PALACE.x} z={PALACE.z} w={PALACE.w} d={PALACE.d} fill="rgba(201,162,39,0.4)" sw={1.2} />
        <Box x={SCHOOL.x} z={SCHOOL.z} w={SCHOOL.d} d={SCHOOL.w} fill="rgba(143,51,32,0.25)" sw={1.2} />
        <Box x={GHAR.x} z={GHAR.z} w={GHAR.w} d={GHAR.d} fill="#e9b62e" sw={1.2} />
        <rect x={f(pcx - pb / 2)} y={f(pcy - pb / 2)} width={f(pb)} height={f(pb)} fill="rgba(143,51,32,0.25)" stroke={INK} strokeWidth="1.2" />
        <rect x={f(pcx - pb / 6)} y={f(pcy - pb / 6)} width={f(pb / 3)} height={f(pb / 3)} fill="#c9a227" stroke={INK} strokeWidth="0.8" />
        {ZONE_TARGETS.map((t) => (
          <circle key={t.id} cx={f(t.x)} cy={f(t.y)} r="3.2" fill={INK} />
        ))}
      </g>
    </svg>
  );
}

export default memo(Art);
