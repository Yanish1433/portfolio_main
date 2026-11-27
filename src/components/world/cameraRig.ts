// Pure camera maths for the follow camera (Player.tsx): view limits, per-zone presets, zone
// hysteresis, the pointer-gesture state machine and the camera-relative move vector.
// No three.js / React in here, so every rule is unit-tested (cameraRig.test.ts).
import { AVATAR_HEIGHT } from "./characters";
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
  // wheels face south: nearly straight on and lower, so the bigger drums, plaques and name ring read (step13b)
  "skills-lab": { dist: 10.5, yaw: 0.1, pitch: 30 * DEG, enter: 5, exit: 8 },
  // the education scroll hangs on the courtyard's north wall facing south: look at it straight on (step13b)
  education: { dist: 9.5, yaw: 0.12, pitch: 32 * DEG, enter: 3.8, exit: 6 },
  // the Workshop board of GitHub plaques (halls/workshopLayout.ts; its ring is added by Player): straight on (step13b)
  workshop: { dist: 10, yaw: 0, pitch: 28 * DEG, enter: 3.2, exit: 5.2 },
  // the brick lane runs south-west from the entrance ring
  timeline: { dist: 14, yaw: 0.35, pitch: 42 * DEG, enter: 4, exit: 6.5 },
  // the dalan: stands, dioramas and screens all face south
  "project-hall": { dist: 14, yaw: 0, pitch: 36 * DEG, enter: 5.5, exit: 8.5 },
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

// --- Fly-in (every visit) ---------------------------------------------------------------------------
// Every visit opens high above the island, above the cloud sea, and glides down to the normal
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

/**
 * Should the fly-in play? On every visit; not under reduced motion, nor in debug / robot / journey test runs.
 * `?flyin=0` skips it (tests); `?flyin=1` forces it past the test params (never past reduced motion).
 */
export function shouldFlyIn(opts: { reducedMotion: boolean; search: string }): boolean {
  if (opts.reducedMotion) return false;
  const q = new URLSearchParams(opts.search);
  if (q.get("flyin") === "0") return false;
  if (q.get("flyin") === "1") return true;
  return !(q.has("debug") || q.has("robot") || q.has("journey"));
}

/** `?flyT=0|0.5`: freeze the fly-in at that point (screenshots). null = play normally. */
export function frozenFlyT(search: string): number | null {
  const v = new URLSearchParams(search).get("flyT");
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? clamp(n, 0, 1) : null;
}

// --- Pose of a view, and a tiny projection (pure, for the readability / framing tests) ---------------------

/** The scene camera's vertical field of view (degrees), see World.tsx. */
export const CAM_FOV = 45;

/** Where the follow camera sits for `view` around `target` (what Player.tsx writes every frame). */
export function viewPose(target: readonly [number, number, number], view: View): Pose {
  const flat = Math.cos(view.pitch) * view.dist;
  return {
    pos: [target[0] + Math.sin(view.yaw) * flat, target[1] + Math.sin(view.pitch) * view.dist, target[2] + Math.cos(view.yaw) * flat],
    look: [target[0], target[1], target[2]],
  };
}

/** Pixels per metre, at `depth` metres in front of the camera, for a viewport `heightPx` tall. */
export const pxPerMetre = (depth: number, heightPx: number, fovDeg = CAM_FOV) => heightPx / (2 * depth * Math.tan((fovDeg * DEG) / 2));

type V3 = readonly [number, number, number];
const sub = (a: V3, b: V3): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): [number, number, number] => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Perspective projection of a world point: x / y in NDC (-1..1 is on screen), depth in metres ahead of the camera. */
export function projectNdc(pose: Pose, p: V3, fovDeg: number, aspect: number): { x: number; y: number; depth: number } {
  const f = norm(sub(pose.look, pose.pos));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const d = sub(p, pose.pos);
  const depth = dot(d, f);
  const t = Math.tan((fovDeg * DEG) / 2);
  return { x: dot(d, r) / (depth * t * aspect), y: dot(d, u) / (depth * t), depth };
}

// --- Over-the-shoulder cinema view (step13b) -----------------------------------------------------------------
// Standing on a project's ring, the camera eases in BEHIND Lakhey and looks straight at that stand's
// screen: the screen fills most of the frame and the back of Lakhey's head and shoulders sit at the bottom
// centre. It is a follow preset (Player.tsx blends it over the normal follow pose), not CinemaCamera: the
// click -> openCinema flight, eagle view, fly-in and the manual orbit latch are untouched. It is the one
// view allowed outside the ZOOM / PITCH clamps (it is a pose, not an orbit), but it keeps the camera at
// least SHOULDER.minHead metres from Lakhey's head so the 0.5 m near plane never clips it.

export const SHOULDER = {
  /** Share of the frame's limiting dimension the screen fills. */
  fill: 0.9,
  /** Where the top of Lakhey's head lands vertically in the frame (NDC; below -1/3 = in the bottom third). */
  headNdc: -0.45,
  /** The camera stays at least this far behind Lakhey (m), and never further than maxDist from the screen. */
  minBack: 1.7,
  maxDist: 9,
  /** Closest the camera may get to Lakhey's head (m): well outside the 0.5 m near plane. */
  minHead: 1.2,
  /** Walk onto a project ring (within `enter` m) to start, walk further than `exit` to stop. */
  enter: 0.8,
  exit: 1.5,
  /** Ease time constant (s) of the blend in / out. */
  tau: 0.25,
};

export type ScreenRect = { x: number; y: number; z: number; w: number; h: number };

/**
 * Camera pose behind the avatar at (avatar.x, avatar.z), looking straight (along -z) at a screen that faces +z.
 * Far enough that the screen fills `SHOULDER.fill` of the frame, and high enough that the top of Lakhey's
 * head lands at SHOULDER.headNdc (in the bottom third of the frame).
 */
export function shoulderPose(
  screen: ScreenRect,
  avatar: { x: number; z: number },
  opts: { fovDeg?: number; aspect?: number; headY?: number } = {},
): Pose & { headNdc: number; headDist: number } {
  const fov = opts.fovDeg ?? CAM_FOV;
  const aspect = Math.max(0.1, opts.aspect ?? 16 / 9);
  const headY = opts.headY ?? AVATAR_HEIGHT;
  const halfV = Math.tan((fov * DEG) / 2);
  const halfH = halfV * aspect;
  const avatarGap = Math.max(0, avatar.z - screen.z);
  const fit = Math.max(screen.h / 2 / halfV, screen.w / 2 / halfH) / SHOULDER.fill;
  const D = clamp(Math.max(fit, avatarGap + SHOULDER.minBack), 0.5, Math.max(SHOULDER.maxDist, avatarGap + SHOULDER.minBack));
  const back = D - avatarGap; // camera -> avatar, along z
  // Solve the camera height H so the head's top lands at SHOULDER.headNdc. The head's elevation below the
  // look direction first grows with H, then shrinks again for a very high camera: search up to its peak.
  const want = Math.atan(SHOULDER.headNdc * halfV);
  const diff = (H: number) => Math.atan2(headY - H, back) - Math.atan2(screen.y - H, D);
  let lo = Math.min(headY, screen.y);
  let peak = lo;
  let peakV = diff(lo);
  for (let i = 1; i <= 80; i++) {
    const H = lo + (12 * i) / 80;
    const v = diff(H);
    if (v < peakV) {
      peakV = v;
      peak = H;
    }
  }
  let hi = peak;
  if (peakV > want) lo = hi = peak; // the head can't get that low in the frame: take the lowest it gets
  else {
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (diff(mid) > want) lo = mid;
      else hi = mid;
    }
  }
  let H = (lo + hi) / 2;
  // keep the camera out of Lakhey's head
  const dHead = (h: number) => Math.hypot(back, h - headY);
  if (dHead(H) < SHOULDER.minHead) H = headY + Math.sqrt(Math.max(0, SHOULDER.minHead ** 2 - back ** 2));
  const pos: [number, number, number] = [avatar.x, H, screen.z + D];
  const look: [number, number, number] = [avatar.x, screen.y, screen.z];
  const pose: Pose = { pos, look };
  return { ...pose, headNdc: projectNdc(pose, [avatar.x, headY, avatar.z], fov, aspect).y, headDist: dHead(H) };
}

/**
 * Which project ring (if any) the avatar stands on, with hysteresis: it starts within SHOULDER.enter m of a
 * ring and holds until beyond SHOULDER.exit m. The nearest ring wins.
 */
export function pickShoulder(x: number, z: number, rings: { key: string; ring: [number, number] }[], current: string | null): string | null {
  const d = (r: { ring: [number, number] }) => Math.hypot(x - r.ring[0], z - r.ring[1]);
  const cur = current ? rings.find((r) => r.key === current) : undefined;
  if (cur && d(cur) < SHOULDER.exit) return cur.key;
  let best: string | null = null;
  let bestD = SHOULDER.enter;
  for (const r of rings) {
    const dd = d(r);
    if (dd < bestD) {
      best = r.key;
      bestD = dd;
    }
  }
  return best;
}

/** Blend two poses (t 0..1). */
export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const k = clamp(t, 0, 1);
  const m = (p: V3, q: V3): [number, number, number] => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
  return { pos: m(a.pos, b.pos), look: m(a.look, b.look) };
}
