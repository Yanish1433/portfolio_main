// The static ink drawing of the town (SVG, rendered once and memoised). Every shape comes from zones.ts / the wheel
// layout: the island, the wall with its 4 gates, the pagoda, palace, school, Ghar, houses, shrines, pond and wheels.
import { memo } from "react";
import { COURTYARD, GALLERY, GATE_ANGLES, GHAR, HOUSES, ISLAND_RADIUS, PALACE, PAGODA, POND, SCHOOL, SHRINES, TEA_STALL, TIMELINE_PATH, TREES, WALL } from "../zones";
import { WHEELS } from "../wheels/wheelData";
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

const GLYPH: Record<string, string> = {
  about: "M-4 1 L0 -4 L4 1 M-3 1 V4.5 H3 V1",
  projects: "M-4.5 -3 H4.5 V3 H-4.5 Z M-1.5 -1.5 L2 0 L-1.5 1.5 Z",
  skills: "M0 -4.5 V4.5 M-4.5 0 H4.5 M-3.2 -3.2 L3.2 3.2 M3.2 -3.2 L-3.2 3.2",
  education: "M-5 -1 L0 -4 L5 -1 L0 2 Z M-3 1 V3.5 Q0 5 3 3.5 V1",
  journey: "M-5 4 Q-1 3 0 0 T5 -4 M-5 4 L-5 4.1",
  contact: "M-5 -3 H5 V3 H-5 Z M-5 -3 L0 1 L5 -3",
  workshop: "M-4 4 L2 -2 M0 -4 H4 V0 L2 -2 Z",
};

function Art() {
  const [pcx, pcy] = worldToMap(PAGODA.x, PAGODA.z, 0, false);
  const [gx, gy] = worldToMap(GHAR.x, GHAR.z, 0, false);
  const lane = TIMELINE_PATH.map(([x, z]) => worldToMap(x, z, 0, false).map(f).join(",")).join(" ");
  const iR = ISLAND_RADIUS * SCALE;
  return (
    <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="mm-clip">
          <circle cx={CENTER} cy={CENTER} r={MAP_R} />
        </clipPath>
      </defs>
      <g clipPath="url(#mm-clip)">
        <circle cx={CENTER} cy={CENTER} r={f(iR)} fill="rgba(160,120,70,0.22)" stroke={INK} strokeWidth="1.2" strokeDasharray="3 2" />
        <path d={wallPath()} fill="none" stroke="#7a4a2a" strokeWidth={f((WALL.outer - WALL.inner) * SCALE + 1)} strokeLinecap="butt" />
        <path d={wallPath()} fill="none" stroke={INK} strokeWidth="0.7" strokeLinecap="butt" opacity="0.6" />
        <polyline points={lane} fill="none" stroke="#8f3320" strokeWidth="1.6" strokeDasharray="2 2" strokeLinecap="round" />
        {HOUSES.map((h, i) => (!h.ghar && h.x !== SCHOOL.x ? <Box key={i} x={h.x} z={h.z} w={h.w} d={h.d} rot={h.rot} /> : null))}
        <Box x={PALACE.x} z={PALACE.z} w={PALACE.w} d={PALACE.d} fill="rgba(201,162,39,0.38)" sw={1} />
        <Box x={PALACE.gateX} z={PALACE.z + PALACE.d / 2} w={3.6} d={0.9} fill="#c9a227" sw={0.6} />
        <Box x={SCHOOL.x} z={SCHOOL.z} w={SCHOOL.d} d={SCHOOL.w} fill="rgba(143,51,32,0.25)" sw={1} />
        <Box x={(COURTYARD.x0 + COURTYARD.x1) / 2} z={(COURTYARD.z0 + COURTYARD.z1) / 2} w={COURTYARD.x1 - COURTYARD.x0} d={COURTYARD.z1 - COURTYARD.z0} fill="none" sw={0.6} />
        <Box x={GALLERY.x} z={GALLERY.z} w={GALLERY.maxSpan} d={GALLERY.d} fill="rgba(232,146,90,0.3)" sw={0.8} />
        <Box x={POND.x} z={POND.z} w={POND.w} d={POND.d} fill="rgba(70,130,150,0.45)" sw={0.8} />
        <Box x={TEA_STALL.x} z={TEA_STALL.z} w={TEA_STALL.w} d={TEA_STALL.d} rot={TEA_STALL.rot} />
        {SHRINES.map((s, i) => (
          <Box key={i} x={s.x} z={s.z} w={s.base} d={s.base} fill="rgba(143,51,32,0.3)" />
        ))}
        {TREES.map(([x, z], i) => {
          const [tx, ty] = worldToMap(x, z, 0, false);
          return <circle key={i} cx={f(tx)} cy={f(ty)} r="2.6" fill="rgba(60,110,60,0.5)" stroke={INK} strokeWidth="0.5" />;
        })}
        {WHEELS.map((w) => {
          const [wx, wy] = worldToMap(w.x, w.z, 0, false);
          return <circle key={w.index} cx={f(wx)} cy={f(wy)} r={f(Math.max(1.6, w.radius * SCALE))} fill={w.colour} stroke={INK} strokeWidth="0.6" />;
        })}
        <Box x={GHAR.x} z={GHAR.z} w={GHAR.w} d={GHAR.d} fill="#e9b62e" sw={1} />
        <path d={`M${f(gx - 5.5)} ${f(gy - 3)} L${f(gx)} ${f(gy - 7)} L${f(gx + 5.5)} ${f(gy - 3)}`} fill="none" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
        {[1, 0.66, 0.34].map((k, i) => (
          <rect key={i} x={f(pcx - (PAGODA.base * SCALE * k) / 2)} y={f(pcy - (PAGODA.base * SCALE * k) / 2)} width={f(PAGODA.base * SCALE * k)} height={f(PAGODA.base * SCALE * k)} fill={i === 2 ? "#c9a227" : "rgba(143,51,32,0.18)"} stroke={INK} strokeWidth="0.8" />
        ))}
        {ZONE_TARGETS.map((t) => (
          <g key={t.id} transform={`translate(${f(t.x)} ${f(t.y)})`}>
            <circle r="7.2" fill="#f6ead0" stroke={INK} strokeWidth="0.9" />
            <path d={GLYPH[t.id] ?? GLYPH.about} fill="none" stroke={INK} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ))}
      </g>
    </svg>
  );
}

export default memo(Art);
