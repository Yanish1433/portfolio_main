"use client";

import { cardClass, chipClass } from "../ui/lokta";
import { useEffect, useRef, useState } from "react";
import { useWorld } from "@/store/world";
import { occlusion } from "../nepal/materials";
import { pickSuggestion } from "./actions";
import { useRobot } from "./robotStore";

const MARGIN = 16;
/** Below the top UI bar (buttons / hint pill). */
const TOP_SAFE = 72;
/** Above the chat bar. */
const BOTTOM_SAFE = 96;
/** Gap between the robot and a bubble placed beside it. */
const SIDE_GAP = 40;

type Box = { l: number; t: number; r: number; b: number };
const hits = (a: Box, b: Box) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));

/** The avatar's screen box in CSS px, from the occlusion point the renderer already projects each frame. */
function avatarBox(vh: number): Box | null {
  const o = occlusion.value;
  const bufH = o.z / 0.13; // ThemeDriver stores radius = buffer height * 0.13
  if (!(o.x > -1e4) || !(bufH > 1)) return null;
  const k = vh / bufH;
  const cx = o.x * k;
  const cy = (bufH - o.y) * k;
  return { l: cx - 0.1 * vh, r: cx + 0.1 * vh, t: cy - 0.22 * vh, b: cy + 0.22 * vh };
}

/**
 * Speech bubble above the robot (rendered through drei <Html>, outside the
 * Canvas React tree's render path): typewriter text + suggestion chips.
 */
export default function RobotBubble({ reducedMotion }: { reducedMotion: boolean }) {
  const line = useRobot((s) => s.line);
  const thinking = useRobot((s) => s.thinking);
  const night = useWorld((s) => s.theme === "night");
  // On phones the info bottom sheet + bubble + chat + joystick is too much: hide the bubble while a panel is open.
  const [compact] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px), (pointer: coarse)").matches);
  const hidden = useWorld((s) => s.pickerOpen || !s.character || !!s.cinema || (compact && !!s.info));
  const [shown, setShown] = useState(0);
  const fit = useRef<HTMLDivElement>(null);
  const tail = useRef<HTMLSpanElement>(null);

  // Keep the bubble fully on screen: measure it every other frame and apply a translate offset
  // straight to the DOM (no React state). No room above the robot -> beside it, never below (the avatar must stay visible).
  useEffect(() => {
    let raf = 0;
    let n = 0;
    let ox = 0;
    let oy = 0;
    let last: HTMLDivElement | null = null;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = fit.current;
      if (!el || ++n % 2) return;
      if (el !== last) {
        last = el; // remounted: no offset applied yet
        ox = 0;
        oy = 0;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Natural rect (as if no offset were applied); the anchor is just under its bottom edge.
      const l = r.left - ox;
      const t = r.top - oy;
      const w = r.width;
      const h = r.height;
      // Placement order: 1) above the robot; 2) beside it, away from the avatar; 3) clamped into the
      // top safe area (may overlap the robot a little). Never below the robot: the avatar stays visible.
      const avatar = avatarBox(vh);
      const free = (x: number, y: number) => !avatar || !hits({ l: x - 6, t: y - 6, r: x + w + 6, b: y + h + 6 }, avatar);
      const maxY = vh - BOTTOM_SAFE - h;
      let tx = clamp(l, MARGIN, vw - MARGIN - w);
      let ty = t;
      let attached = true; // still directly above the robot (tail makes sense)
      if (t < TOP_SAFE || !free(tx, ty)) {
        const cx = l + w / 2;
        const cy = t + h + 6 + 26; // robot's centre
        const sy = clamp(cy - h / 2, TOP_SAFE, maxY);
        const right = { x: cx + SIDE_GAP, ok: cx + SIDE_GAP + w <= vw - MARGIN };
        const left = { x: cx - SIDE_GAP - w, ok: cx - SIDE_GAP - w >= MARGIN };
        const awayRight = !avatar || (avatar.l + avatar.r) / 2 <= cx;
        const sides = awayRight ? [right, left] : [left, right];
        const side = sides.find((c) => c.ok && free(c.x, sy));
        attached = false;
        if (side) {
          tx = side.x;
          ty = sy;
        } else {
          ty = clamp(t, TOP_SAFE, maxY);
        }
      }
      ty = Math.min(ty, Math.max(TOP_SAFE, maxY));
      const nx = tx - l;
      const ny = ty - t;
      if (Math.abs(nx - ox) > 0.5 || Math.abs(ny - oy) > 0.5) {
        ox = nx;
        oy = ny;
        el.style.transform = `translate(${ox}px, ${oy}px)`;
      }
      // The tail only makes sense while the bubble sits directly above the robot.
      if (tail.current) tail.current.style.display = !attached || Math.abs(ox) > 1 || Math.abs(oy) > 1 ? "none" : "";
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!line) return;
    if (reducedMotion) {
      setShown(line.text.length);
      return;
    }
    setShown(0);
    const id = window.setInterval(() => {
      setShown((n) => {
        if (n >= line.text.length) {
          window.clearInterval(id);
          return n;
        }
        return n + 2;
      });
    }, 22);
    return () => window.clearInterval(id);
  }, [line, reducedMotion]);

  if (hidden || (!line && !thinking)) return null;
  const done = !line || shown >= line.text.length;
  const tailClass = night ? "border-[#3e2416] bg-[#e6d6b2]" : "border-[#3e2416] bg-[#f6ead0]";

  return (
    <div
      className="flex w-max max-w-[280px] flex-col items-center"
      style={{ transform: "translate(-50%, calc(-100% - 6px))", fontFamily: "Mukta, system-ui, sans-serif" }}
    >
      <div ref={fit} data-night={night} className={cardClass("relative w-max max-w-[280px] px-3 py-2 text-[15px] leading-snug")}>
        {thinking || !line ? (
          <span className="tracking-widest" aria-hidden="true">…</span>
        ) : (
          // The full reply is announced by the aria-live region in RobotChat.
          <span className="whitespace-pre-wrap" aria-hidden="true">{line.text.slice(0, shown)}</span>
        )}
        {line && line.suggestions.length > 0 && !thinking && (
          <div
            role="group"
            aria-label="Suggestions"
            className={`mt-2 flex flex-wrap gap-1.5 transition-opacity duration-200 ${done ? "opacity-100" : "pointer-events-none opacity-0"}`}
          >
            {line.suggestions.map((sg, i) => (
              <button
                key={`${line.id}-${i}`}
                type="button"
                onClick={() => pickSuggestion(sg)}
                className={chipClass("pointer-events-auto cursor-pointer")}
              >
                {sg.label}
              </button>
            ))}
          </div>
        )}
        {/* tail */}
        <span
          ref={tail}
          className={`absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-[6px] rotate-45 border-b-[3px] border-r-[3px] ${tailClass}`}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
