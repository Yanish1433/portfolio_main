"use client";

// "How it works": the project's plain-word layers (plainArchitecture) as boxes joined by roads,
// with small dots flowing from the visitor through each layer, left -> right (top -> bottom on
// narrow screens). Plain label big, tech name small. Reduced motion: the dots stand still.
import { useEffect, useState } from "react";
import type { ArchLayer } from "@/content/showcase";

const NODE_W = 176;
const NODE_H = 100;
const GAP = 64;
const VISITOR_R = 34;
const PAD = 14;

type Pt = { x: number; y: number };

export default function ArchDiagram({ layers, accent, reducedMotion, night }: { layers: ArchLayer[]; accent: string; reducedMotion: boolean; night: boolean }) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  if (!layers.length) return null;

  const n = layers.length;
  const horizontal = !narrow;
  // visitor circle first, then one box per layer
  const step = (horizontal ? NODE_W : NODE_H) + GAP;
  const visitorSpan = VISITOR_R * 2 + GAP;
  const along = PAD + visitorSpan + n * step - GAP + PAD;
  const across = PAD * 2 + (horizontal ? NODE_H : NODE_W);
  const W = horizontal ? along : across;
  const H = horizontal ? across : along;
  const mid = across / 2;
  const pos = (a: number): Pt => (horizontal ? { x: a, y: mid } : { x: mid, y: a });
  const visitorC = pos(PAD + VISITOR_R);
  const boxStart = (i: number) => PAD + visitorSpan + i * step;
  const boxLen = horizontal ? NODE_W : NODE_H;

  // roads: visitor -> box 0, box i -> box i+1
  const roads: [Pt, Pt][] = [[pos(PAD + VISITOR_R * 2 + 4), pos(boxStart(0) - 4)]];
  for (let i = 0; i + 1 < n; i++) roads.push([pos(boxStart(i) + boxLen + 4), pos(boxStart(i + 1) - 4)]);

  const ink = night ? "#f8e9cc" : "#3a2419";
  const card = night ? "#3a2a2e" : "#fff4e0";
  const road = night ? "rgba(248,233,204,0.28)" : "rgba(90,42,24,0.22)";
  const dotDur = 1.6;

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Diagram: visitor, then ${layers.map((l) => l.label).join(", then ")}`} className="mx-auto block h-auto w-full" style={{ maxWidth: horizontal ? W : 300 }}>
        {roads.map(([a, b], i) => (
          <g key={`r${i}`}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={road} strokeWidth={10} strokeLinecap="round" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={accent} strokeOpacity={0.55} strokeWidth={2} strokeDasharray="6 8" />
            {/* arrow head */}
            <path
              d={horizontal ? `M${b.x - 9},${b.y - 7} L${b.x},${b.y} L${b.x - 9},${b.y + 7}` : `M${b.x - 7},${b.y - 9} L${b.x},${b.y} L${b.x + 7},${b.y - 9}`}
              fill="none"
              stroke={accent}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {[0, 0.5].map((off) =>
              reducedMotion ? (
                <circle key={off} cx={a.x + (b.x - a.x) * (0.3 + off * 0.8)} cy={a.y + (b.y - a.y) * (0.3 + off * 0.8)} r={5} fill={accent} />
              ) : (
                <circle key={off} r={5} fill={accent} cx={a.x} cy={a.y}>
                  <animate attributeName={horizontal ? "cx" : "cy"} from={horizontal ? a.x : a.y} to={horizontal ? b.x - 8 : b.y - 8} dur={`${dotDur}s`} begin={`${(i * 0.35 + off * dotDur).toFixed(2)}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur={`${dotDur}s`} begin={`${(i * 0.35 + off * dotDur).toFixed(2)}s`} repeatCount="indefinite" />
                </circle>
              ),
            )}
          </g>
        ))}
        {/* the visitor */}
        <g>
          <circle cx={visitorC.x} cy={visitorC.y} r={VISITOR_R} fill={card} stroke={accent} strokeWidth={2.5} />
          <circle cx={visitorC.x} cy={visitorC.y - 9} r={8} fill={ink} opacity={0.8} />
          <path d={`M${visitorC.x - 14},${visitorC.y + 17} Q${visitorC.x},${visitorC.y - 4} ${visitorC.x + 14},${visitorC.y + 17} Z`} fill={ink} opacity={0.8} />
          <text x={visitorC.x} y={visitorC.y + VISITOR_R + (horizontal ? 20 : 0)} dx={horizontal ? 0 : VISITOR_R + 40} dy={horizontal ? 0 : 5} textAnchor="middle" fontSize={15} fontWeight={600} fill={ink}>
            Visitor
          </text>
        </g>
        {layers.map((l, i) => {
          const c = pos(boxStart(i) + boxLen / 2);
          const x = c.x - NODE_W / 2;
          const y = c.y - NODE_H / 2;
          return (
            <g key={`n${i}`}>
              <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={16} fill={card} stroke={accent} strokeWidth={2.5} />
              <rect x={x} y={y} width={NODE_W} height={8} rx={4} fill={accent} opacity={0.85} />
              <text x={c.x} y={c.y + 4} textAnchor="middle" fontSize={24} fontWeight={600} fill={ink}>
                {l.label}
              </text>
              <text x={c.x} y={c.y + 30} textAnchor="middle" fontSize={14} fill={ink} opacity={0.7}>
                {l.tech.length > 22 ? `${l.tech.slice(0, 21)}…` : l.tech}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
