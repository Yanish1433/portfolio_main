// Tiny shared mutable state for per-frame data (kept out of React/Zustand on purpose).
import type { Vec2 } from "@/store/world";

export const joystick = { x: 0, y: 0 };
export const playerPos = { x: 0, z: 0 };
/** The robot buddy's ground position, written by the robot each frame (zone labels fade near it while it talks). */
export const robotPos = { x: 0, z: 0 };

/** Written by Player every frame; read by the avatar (walk cycle) and the robot. */
export const avatarMotion = {
  /** Ground speed this frame, m/s (follows the damped curSpeed). */
  speed: 0,
  /** Total distance walked, m (drives the walk-cycle phase so feet don't slide). */
  dist: 0,
  /** Facing, radians about +Y (0 = +Z). */
  heading: 0,
};

/**
 * Where the follow camera wants to be this frame (written by Player every frame, even while
 * cinema mode owns the real camera), so the fly-back can land exactly on it.
 */
export const camRig = { pos: { x: 0, y: 11, z: 18 }, look: { x: 0, y: 1, z: 8.5 } };

/** Player's current click/auto-walk path (same array reference Player follows). */
export const navPath = { path: [] as Vec2[], idx: 0 };

/** Imperative hooks registered by Player (used by the robot actions). */
export const worldControl = {
  /** Auto-walk (does not count as visitor input). Returns false when there is no path. */
  walkTo: null as null | ((x: number, z: number) => boolean),
  /** Turn (while standing) to face a ground point; any movement clears it. */
  face: null as null | ((x: number, z: number) => void),
};

/**
 * A click on a 3D object (stand, book, sign) claims its pointer in R3F's pointerdown, so the
 * ground click-to-walk in Player skips that pointer. Player's native listener on the canvas runs
 * before R3F's (on the canvas' parent), so it clears the claim on each new press first.
 */
export const pointerClaim = {
  id: null as number | null,
  claim(id: number) {
    this.id = id;
  },
  /** Called by Player on pointerdown. */
  reset() {
    this.id = null;
  },
  claimed(id: number) {
    return this.id === id;
  },
};

/** Run is the default pace (m/s); walk is the final approach, Shift, or a small joystick push. */
export const RUN_SPEED = 4.5;
export const WALK_SPEED = 1.5;
