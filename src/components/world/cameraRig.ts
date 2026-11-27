// Pure camera maths for the follow camera (Player.tsx): view limits, per-zone presets, zone
// hysteresis, the pointer-gesture state machine and the camera-relative move vector.
// No three.js / React in here, so every rule is unit-tested (cameraRig.test.ts).
//
// Yaw convention: 0 = the camera sits SOUTH (+z) of the avatar, today's view. Positive yaw moves
// the camera towards +x (east). Everything in the town (stand screens, captions, plaques) faces +z,
// so the orbit is clamped to +/-75 degrees around that south view and never shows their backs.

export const DEG = Math.PI / 180;

export type View = { dist: number; yaw: number; pitch: number };

/** Zoom limits (camera distance, m). Presets must stay inside. */
export const ZOOM_MIN = 6;
export const ZOOM_MAX = 62;
/** Yaw clamp around the south view. */
export const YAW_LIMIT = 75 * DEG;
/** Pitch band (down-angle of the camera): at 25 deg the horizon starts to show, at 65 deg it is nearly top-down. */
export const PITCH_MIN = 25 * DEG;
export const PITCH_MAX = 65 * DEG;

/** Today's wide view: 45 deg down, from the south, 23 m away. */
export const DEFAULT_VIEW: View = { dist: 23, yaw: 0, pitch: 45 * DEG };

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clampYaw = (y: number) => clamp(y, -YAW_LIMIT, YAW_LIMIT);
export const clampPitch = (p: number) => clamp(p, PITCH_MIN, PITCH_MAX);
export const clampDist = (d: number) => clamp(d, ZOOM_MIN, ZOOM_MAX);

// --- Per-zone presets ---------------------------------------------------------------------------
// ONE table: zone id -> view, plus the hysteresis radii (m from the zone's entrance ring in zones.ts).
// A zone frames once the avatar is inside `enter`, and lets go only beyond `exit` (enter < exit).
// The plaza (centre) and the kiosk have no preset: they use the default wide view.

export type ZonePreset = View & { enter: number; exit: number };

export const ZONE_PRESETS: Record<string, ZonePreset> = {
  // wheels face south: a gentle 3/4 view from the south-east, close enough to read them
  "skills-lab": { dist: 12, yaw: 0.2, pitch: 38 * DEG, enter: 5, exit: 8 },
  // the courtyard house faces east: look in from the south-east
  education: { dist: 11, yaw: 0.7, pitch: 40 * DEG, enter: 3.8, exit: 6 },
  // the brick lane runs south-west from the entrance ring
  timeline: { dist: 14, yaw: 0.35, pitch: 42 * DEG, enter: 4, exit: 6.5 },
  // the dalan: stands, dioramas and screens all face south
  "project-hall": { dist: 15, yaw: 0, pitch: 40 * DEG, enter: 5.5, exit: 8.5 },
  // Yanish's Ghar: front (+z) towards the camera
  about: { dist: 10, yaw: -0.15, pitch: 36 * DEG, enter: 3.6, exit: 5.6 },
  // the Hulak postbox
  mailbox: { dist: 11, yaw: -0.3, pitch: 40 * DEG, enter: 3.8, exit: 5.8 },
};

export const viewOfZone = (zone: string | null): View => {
  const p = zone ? ZONE_PRESETS[zone] : undefined;
  return p ? { dist: p.dist, yaw: p.yaw, pitch: p.pitch } : DEFAULT_VIEW;
};

export type Ring = { id: string; x: number; z: number };

/**
 * Which preset zone frames the camera at (x, z)? `current` is the zone that is framed right now:
 * it is kept until the avatar is beyond its exit radius (hysteresis); otherwise the nearest zone
 * within its enter radius wins, else null (the centre / paths).
 */
export function pickZone(x: number, z: number, rings: Ring[], current: string | null): string | null {
  const dist = (r: Ring) => Math.hypot(x - r.x, z - r.z);
  if (current) {
    const cur = rings.find((r) => r.id === current);
    const p = ZONE_PRESETS[current];
    if (cur && p && dist(cur) < p.exit) return current;
  }
  let best: string | null = null;
  let bestD = Infinity;
  for (const r of rings) {
    const p = ZONE_PRESETS[r.id];
    if (!p) continue;
    const d = dist(r);
    if (d < p.enter && d < bestD) {
      best = r.id;
      bestD = d;
    }
  }
  return best;
}

/** A zone change must hold this long before the camera follows (walking along an edge doesn't bounce). */
export const DWELL_SECS = 0.4;

export type FrameState = {
  /** Zone the camera is framed on (committed). */
  zone: string | null;
  /** A different zone seen this frame, waiting out the dwell (undefined = none). */
  cand: string | null | undefined;
  dwell: number;
  /** The visitor orbited / zoomed by hand since the last committed zone change: auto-frame stays out. */
  manual: boolean;
};

export const newFrameState = (): FrameState => ({ zone: null, cand: undefined, dwell: 0, manual: false });

/** The visitor took the camera: no auto-framing until the framed zone changes. */
export const noteManual = (fs: FrameState) => {
  fs.manual = true;
};

/**
 * One frame of the auto-framer. Returns the new view to ease to when the framed zone just changed
 * (after the dwell), otherwise null. The view is only ever returned on a change, so a hand-set
 * camera is left alone for as long as the avatar stays in the same zone.
 */
export function updateFrame(fs: FrameState, x: number, z: number, dt: number, rings: Ring[]): View | null {
  const raw = pickZone(x, z, rings, fs.zone);
  if (raw === fs.zone) {
    fs.cand = undefined;
    fs.dwell = 0;
    return null;
  }
  if (fs.cand !== raw) {
    fs.cand = raw;
    fs.dwell = 0;
  }
  fs.dwell += dt;
  if (fs.dwell < DWELL_SECS) return null;
  fs.zone = raw;
  fs.cand = undefined;
  fs.dwell = 0;
  fs.manual = false; // a new zone (or the centre) re-arms the auto-frame
  return viewOfZone(raw);
}

// --- Movement relative to the camera -------------------------------------------------------------

/**
 * Keyboard / joystick vector (ix: right +, iz: back / down +) -> world x/z, so that "forward" is
 * always away from the camera. At yaw 0 it is the identity.
 */
export function moveVector(ix: number, iz: number, yaw: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [ix * c + iz * s, -ix * s + iz * c];
}

// --- Pointer gestures -----------------------------------------------------------------------------

export const TAP_SLOP_PX = 6;
/** Radians per pixel of drag. */
export const ORBIT_SENS = 0.005;
/** Wheel / keyboard zoom speed. */
export const WHEEL_ZOOM = 0.012;

/** Pixel drag -> new yaw / pitch (dragging right turns the world with the cursor, like a globe). */
export function orbitBy(yaw: number, pitch: number, dx: number, dy: number): { yaw: number; pitch: number } {
  return { yaw: clampYaw(yaw - dx * ORBIT_SENS), pitch: clampPitch(pitch + dy * ORBIT_SENS) };
}

export type GestureDelta = {
  /** Orbit drag, px since the last event. */
  dx: number;
  dy: number;
  /** Pinch: current finger spread / previous (1 = no change). Greater than 1 means zoom in. */
  pinch: number;
};

type Ptr = { x: number; y: number; sx: number; sy: number; type: string; button: number; far: boolean };

/**
 * Tracks the pointers on the canvas and tells Player what each gesture is:
 *  - mouse right-drag, or mouse left-drag that started on empty ground and moved past the slop: orbit
 *  - two fingers: orbit (midpoint drag) + pinch zoom
 *  - a short press with no such movement: a tap (walks)
 * A press that landed on a clickable object (claimed) never orbits.
 */
export class GestureTracker {
  private ptrs = new Map<number, Ptr>();
  /** A two-finger gesture happened since the last full release: nothing here is a tap any more. */
  private multi = false;
  private dragging = new Set<number>();

  get active(): number {
    return this.ptrs.size;
  }

  down(id: number, x: number, y: number, type: string, button: number) {
    this.ptrs.set(id, { x, y, sx: x, sy: y, type, button, far: false });
    if (this.ptrs.size > 1) this.multi = true;
  }

  private touches(): Ptr[] {
    return [...this.ptrs.values()].filter((p) => p.type === "touch");
  }

  move(id: number, x: number, y: number, claimed: boolean): GestureDelta | null {
    const p = this.ptrs.get(id);
    if (!p) return null;
    const px = p.x;
    const py = p.y;
    // two fingers: midpoint drag + spread ratio
    const ts = this.touches();
    if (ts.length === 2 && p.type === "touch") {
      const [a, b] = ts;
      const d0 = Math.hypot(a.x - b.x, a.y - b.y);
      const m0x = (a.x + b.x) / 2;
      const m0y = (a.y + b.y) / 2;
      p.x = x;
      p.y = y;
      const d1 = Math.hypot(a.x - b.x, a.y - b.y);
      const m1x = (a.x + b.x) / 2;
      const m1y = (a.y + b.y) / 2;
      return { dx: m1x - m0x, dy: m1y - m0y, pinch: d0 > 1 && d1 > 1 ? d1 / d0 : 1 };
    }
    p.x = x;
    p.y = y;
    if (Math.hypot(x - p.sx, y - p.sy) >= TAP_SLOP_PX) p.far = true;
    if (this.multi || p.type === "touch") return null; // a lone finger never orbits (it just isn't a tap)
    if (this.dragging.has(id)) return { dx: x - px, dy: y - py, pinch: 1 };
    if (claimed) return null;
    const right = p.button === 2;
    if (right || (p.button === 0 && p.far)) {
      this.dragging.add(id);
      // the first orbit step covers the whole drag so far, so the grab doesn't jump
      return right ? { dx: x - px, dy: y - py, pinch: 1 } : { dx: x - p.sx, dy: y - p.sy, pinch: 1 };
    }
    return null;
  }

  /** Pointer released: was it a tap (a short, single-pointer, non-orbit press)? */
  up(id: number): { tap: boolean } {
    const p = this.ptrs.get(id);
    this.ptrs.delete(id);
    const tap = !!p && !this.multi && !this.dragging.has(id) && !p.far && p.button === 0;
    this.dragging.delete(id);
    if (this.ptrs.size === 0) this.multi = false;
    return { tap };
  }

  cancel(id: number) {
    this.ptrs.delete(id);
    this.dragging.delete(id);
    if (this.ptrs.size === 0) this.multi = false;
  }
}

// --- First-visit fly-in ---------------------------------------------------------------------------
// The very first visit opens high above the island, above the cloud sea, and glides down to the normal
// follow view behind the avatar. `flyInPose` is pure: it always ends exactly on the pose it is given
// (the live follow pose), so handing the camera back to the rig has no jump.

/** Length of the fly-in, seconds. */
export const FLY_IN_SECS = 3.2;
/** Where it starts: high above the island's south-west, looking at its heart. */
export const FLY_IN_START = { pos: [-30, 46, 80] as const, look: [0, -10, 0] as const };
/** Sideways swing of the path (m): the glide curves in rather than running straight. */
const FLY_SWING = 15;

export type Pose = { pos: [number, number, number]; look: [number, number, number] };

/** Smooth in-out: zero speed at both ends, monotonic. */
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Camera pose `t` (0..1) of the way through the fly-in, ending at `end`. Height only ever goes down. */
export function flyInPose(t: number, end: Pose): Pose {
  return flyBetween(t, FLY_IN_START, end);
}

/** Camera pose `t` (0..1) of the way from `start` to `end` (same glide as the fly-in; exact at both ends). */
export function flyBetween(t: number, start: { pos: readonly number[]; look: readonly number[] }, end: { pos: readonly number[]; look: readonly number[] }): Pose {
  const u = clamp(t, 0, 1);
  const e = easeInOutCubic(u);
  const swing = Math.sin(Math.PI * e) * FLY_SWING * (1 - e);
  const lerp = (a: number, b: number) => a + (b - a) * e;
  return {
    pos: [lerp(start.pos[0], end.pos[0]) + swing, lerp(start.pos[1], end.pos[1]), lerp(start.pos[2], end.pos[2])],
    look: [lerp(start.look[0], end.look[0]), lerp(start.look[1], end.look[1]), lerp(start.look[2], end.look[2])],
  };
}

// --- Eagle view (on-demand sky camera) ----------------------------------------------------------------
/** Seconds to fly up / back down. */
export const EAGLE_SECS = 1.5;
/** The island centre the sky camera orbits and looks at. */
export const EAGLE_CENTER = [0, -6, 0] as const;
/** Sky orbit limits: distance (m) and down-angle. Distance stays inside camera `far` (280) and the fog. */
export const EAGLE_DIST_MIN = 60;
export const EAGLE_DIST_MAX = 140;
export const EAGLE_PITCH_MIN = 55 * DEG;
export const EAGLE_PITCH_MAX = 80 * DEG;
/** Where eagle view opens: from the south, the island and the cloud sea in frame. */
export const EAGLE_DEFAULT = { yaw: 0, pitch: 62 * DEG, dist: 108 };

export const clampEagleDist = (d: number) => clamp(d, EAGLE_DIST_MIN, EAGLE_DIST_MAX);
export const clampEaglePitch = (p: number) => clamp(p, EAGLE_PITCH_MIN, EAGLE_PITCH_MAX);
/** Full 360 deg turn: wraps into (-PI, PI]. */
export const wrapEagleYaw = (y: number) => y - Math.PI * 2 * Math.round(y / (Math.PI * 2));

/** Drag -> new sky yaw / pitch (yaw is free all the way round). */
export function eagleOrbitBy(yaw: number, pitch: number, dx: number, dy: number): { yaw: number; pitch: number } {
  return { yaw: yaw - dx * ORBIT_SENS, pitch: clampEaglePitch(pitch + dy * ORBIT_SENS) };
}

/** Camera pose for a sky orbit around the island centre (inputs are clamped). */
export function eaglePose(yaw: number, pitch: number, dist: number): Pose {
  const p = clampEaglePitch(pitch);
  const d = clampEagleDist(dist);
  const flat = Math.cos(p) * d;
  const [cx, cy, cz] = EAGLE_CENTER;
  return { pos: [cx + Math.sin(yaw) * flat, cy + Math.sin(p) * d, cz + Math.cos(yaw) * flat], look: [cx, cy, cz] };
}

/** The flag key: the fly-in plays once per browser. */
export const FLY_IN_KEY = "portfolio-flyin-seen";

/**
 * Should the fly-in play? Not under reduced motion, in debug / robot / journey test runs, or when the
 * visitor has seen it. `?flyin=1` forces it (screenshots, demos), ignoring all of those but reduced motion.
 */
export function shouldFlyIn(opts: { reducedMotion: boolean; search: string; seen: boolean }): boolean {
  if (opts.reducedMotion) return false;
  const q = new URLSearchParams(opts.search);
  if (q.get("flyin") === "1") return true;
  if (q.has("debug") || q.has("robot") || q.has("journey")) return false;
  return !opts.seen;
}

/** `?flyT=0|0.5`: freeze the fly-in at that point (screenshots). null = play normally. */
export function frozenFlyT(search: string): number | null {
  const v = new URLSearchParams(search).get("flyT");
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? clamp(n, 0, 1) : null;
}
