// Prayer-wheel spin timing (pure maths, no three.js): the "wave" that runs left to right while the visitor stands at the row.
//  - wheel i starts WAVE_STEP s after wheel i-1; each eases up, turns WAVE_TURNS full turns, eases down and stops
//  - the wave repeats every WAVE_PERIOD s while the visitor stays
//  - every spin is a whole number of turns, and the name repeats around the drum NAME_REPEATS times, so a wheel always ends facing the camera
export const WAVE_STEP = 0.35;
export const WAVE_PERIOD = 6;
export const WAVE_TURNS = 2;
/** Seconds one wheel needs for its turns (ease in, spin, ease out). */
export const WAVE_DUR = 2.6;
/** The avatar counts as "at the row" within this many metres of it (or inside the skills zone). */
export const ROW_R = 3;
/** The avatar must stand still this long (s) before the wave starts. */
export const STAND_SECS = 0.5;
/** The group name is drawn this many times around each drum. */
export const NAME_REPEATS = 2;
const TAU = Math.PI * 2;

const easeInOut = (p: number) => 0.5 - 0.5 * Math.cos(Math.PI * p);

/**
 * Clockwise angle (rad, >= 0, cumulative) wheel `i` has turned `t` seconds after the wave began.
 * `lastCycle` (optional) stops new spins after that cycle index, so a wheel finishes the turn it is in when the visitor leaves.
 */
export function waveSpin(t: number, i: number, lastCycle = Infinity): number {
  const local = t - i * WAVE_STEP;
  if (local < 0) return 0;
  let cyc = Math.floor(local / WAVE_PERIOD);
  let f = local - cyc * WAVE_PERIOD;
  if (cyc > lastCycle) {
    cyc = lastCycle;
    f = WAVE_PERIOD;
  }
  if (cyc < 0) return 0;
  return (cyc + easeInOut(Math.min(1, f / WAVE_DUR))) * WAVE_TURNS * TAU;
}

/** The cycle wheel `i` is in at time `t` (-1 before its first spin). */
export const waveCycle = (t: number, i: number) => (t - i * WAVE_STEP < 0 ? -1 : Math.floor((t - i * WAVE_STEP) / WAVE_PERIOD));

/** The nearest yaw (rad) at which a name faces the camera: a multiple of 2π / repeats. */
export function snapYaw(yaw: number, repeats = NAME_REPEATS): number {
  const step = TAU / repeats;
  return Math.round(yaw / step) * step;
}

/** Distance (m) from (x, z) to the wheel row (the segment between the first and last wheel). */
export function rowDistance(wheels: { x: number; z: number }[], x: number, z: number): number {
  if (!wheels.length) return Infinity;
  const x0 = wheels[0].x;
  const x1 = wheels[wheels.length - 1].x;
  return Math.hypot(x - Math.min(x1, Math.max(x0, x)), z - wheels[0].z);
}

/** Is the visitor at the wheel row: in the skills zone, or within ROW_R of the row? */
export function atRow(wheels: { x: number; z: number }[], x: number, z: number, zone: string | null): boolean {
  return zone === "skills-lab" || rowDistance(wheels, x, z) <= ROW_R;
}

/** Wave progress: `t` is the wave clock (s), `still` how long the visitor has stood still. */
export type WaveState = { t: number; active: boolean; still: number; lastCycle: number[] };
export const newWave = (): WaveState => ({ t: 0, active: false, still: 0, lastCycle: [] });

/**
 * One step. `at` = at the row, `moving` = the avatar is walking. The wave starts once the visitor has stood still
 * for STAND_SECS and runs while they stay at the row. On leaving, every wheel finishes the turn it is in
 * (`lastCycle` per wheel), then the state resets.
 */
export function stepWave(s: WaveState, dt: number, at: boolean, moving: boolean, n: number): WaveState {
  if (!at) {
    if (s.active) {
      s.active = false;
      s.lastCycle = Array.from({ length: n }, (_, i) => waveCycle(s.t, i));
    }
    if (s.lastCycle.length) {
      s.t += dt;
      if (s.lastCycle.every((c, i) => waveSpin(s.t, i, c) === waveSpin(s.t + 99, i, c))) {
        s.lastCycle = [];
        s.t = 0;
      }
    }
    s.still = 0;
    return s;
  }
  s.still = moving ? 0 : s.still + dt;
  if (!s.active && s.still >= STAND_SECS) {
    s.active = true;
    s.t = 0;
    s.lastCycle = [];
  }
  if (s.active) s.t += dt;
  return s;
}
