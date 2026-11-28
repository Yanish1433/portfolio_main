// step23: pure phone-control rules (no React, no three): joystick math, touch routing, fixed-UI rect checks, DPR cap.
import { RUN_SPEED, WALK_SPEED } from "./input";

export const JOY_DEAD = 0.12;
export const JOY_RUN_AT = 0.85;
/** Joystick base radius in CSS px (the knob can travel this far). */
export const JOY_RADIUS = 56;

export interface JoyOut {
  /** -1..1 per axis, dead zone removed (screen space: +x right, +y down). */
  x: number;
  y: number;
  /** 0..1 push after the dead zone is removed. */
  mag: number;
  /** Knob offset in px, clamped to the base radius. */
  kx: number;
  ky: number;
}

/** Offset of the finger from the stick origin -> clamped knob + analog vector with a dead zone. */
export function joyVector(dx: number, dy: number, radius = JOY_RADIUS): JoyOut {
  const len = Math.hypot(dx, dy);
  const r = len / radius;
  const c = len > radius ? radius / len : 1;
  const kx = dx * c;
  const ky = dy * c;
  if (r < JOY_DEAD || len === 0) return { x: 0, y: 0, mag: 0, kx, ky };
  const mag = Math.min(1, (r - JOY_DEAD) / (1 - JOY_DEAD));
  return { x: (dx / len) * mag, y: (dy / len) * mag, mag, kx, ky };
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Ground speed (m/s) for a joystick push 0..1: walk pace ramps up, then blends into run; > JOY_RUN_AT is a full run. */
export function joySpeed(push: number): number {
  const m = Math.min(1, Math.max(0, push));
  if (m < 0.6) return WALK_SPEED * (m / 0.6);
  return WALK_SPEED + (RUN_SPEED - WALK_SPEED) * smooth(0.6, JOY_RUN_AT, m);
}

export interface Zone {
  /** Fractions of the viewport: the joystick claims touches that start with x <= w and y >= top. */
  w: number;
  top: number;
}
/** Bottom-left quarter-ish of the screen. */
export const JOY_ZONE: Zone = { w: 0.5, top: 0.45 };

export type TouchRoute = "joystick" | "tap-orbit" | "orbit" | "pinch";

/**
 * Who owns a touch? `count` = fingers down including this one. A first finger that STARTS in the joystick zone is the
 * joystick (no walk, no orbit); a second finger anywhere pinches / orbits; any other lone finger is tap-to-walk, or an
 * orbit drag once it moves past the tap slop ("tap-orbit").
 */
export function routeTouch(start: { x: number; y: number }, count: number, vw: number, vh: number, zone: Zone = JOY_ZONE, joyActive = false): TouchRoute {
  if (count >= 2) return "pinch";
  if (!joyActive && start.x <= vw * zone.w && start.y >= vh * zone.top) return "joystick";
  return "tap-orbit";
}

/** Phones: cap the pixel ratio at 1.5 (desktop keeps its own rules). */
export function dprCap(coarse: boolean, devicePixelRatio: number, desktopCap = 1.5): number {
  return coarse ? Math.min(devicePixelRatio, 1.5) : Math.min(devicePixelRatio, desktopCap);
}

// ---- fixed-UI rects (declared layout, in CSS px) ---------------------------------------------------

export interface Rect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function findOverlaps(rects: Rect[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (overlaps(rects[i], rects[j])) out.push([rects[i].id, rects[j].id]);
  return out;
}

export const PHONE_MAX_W = 480;
export const TAP_MIN = 44;
/** Size of the joystick base and the action buttons (kept in step with the CSS in Joystick / PhoneActions). */
export const ACTION_BTN = 48;
export const ACTION_GAP = 8;
/** Dance, Passport, 360 and Map. */
export const ACTION_COUNT = 4;

/**
 * Where the fixed pieces sit on a phone viewport, from the same numbers phone.css uses (keep the two in step).
 * Landscape = a touch device with height <= 500. The floating stick itself only exists under a finger; its resting
 * "Drag to walk" hint ring is what is checked here.
 */
export function phoneRects(vw: number, vh: number): Rect[] {
  const land = vh <= 500;
  const m = 12;
  const menu: Rect = { id: "menu-button", x: m, y: m, w: 48, h: 48 };
  const mapW = land ? 76 : 96;
  const map: Rect = { id: "minimap", x: vw - m - mapW, y: m, w: mapW, h: mapW + 6 + TAP_MIN };
  const cluster: Rect = land
    ? { id: "actions", x: vw - m - (ACTION_COUNT * ACTION_BTN + (ACTION_COUNT - 1) * ACTION_GAP), y: vh - m - ACTION_BTN, w: ACTION_COUNT * ACTION_BTN + (ACTION_COUNT - 1) * ACTION_GAP, h: ACTION_BTN }
    : { id: "actions", x: vw - m - ACTION_BTN, y: vh - m - (ACTION_COUNT * ACTION_BTN + (ACTION_COUNT - 1) * ACTION_GAP), w: ACTION_BTN, h: ACTION_COUNT * ACTION_BTN + (ACTION_COUNT - 1) * ACTION_GAP };
  const dockL = land ? 140 : m;
  const dockR = land ? 232 : 72;
  const chatH = 52;
  const chatW = Math.min(448, vw - dockL - dockR);
  const chat: Rect = { id: "chat", x: dockL, y: vh - m - chatH, w: chatW, h: chatH };
  const chip: Rect = { id: "guide-chip", x: m, y: vh - 76 - TAP_MIN, w: Math.min(300, vw - m - dockR), h: TAP_MIN };
  const hint: Rect = { id: "joystick-hint", x: 16, y: vh - 150 - 112, w: 100, h: 112 };
  return [menu, map, cluster, chat, chip, hint];
}
