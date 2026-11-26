// The captain's path: milestones come only from profile data (see lib/robot/journey.ts), so the
// stones, the zone card, the robot and Recruiter Mode never disagree. No React, no three.js.
import { profile } from "@/content/profile";
import { buildMilestones, type Milestone } from "@/lib/robot/journey";

export const JOURNEY: Milestone[] = buildMilestones(profile);

/**
 * Stone positions along a polyline lane: evenly spaced by arc length (centred in each of n equal
 * parts), pushed `side` metres to the lane's north-west side. Pure, so it is unit-tested.
 */
export function stonePositions(path: [number, number][], n: number, side = 1.4): [number, number][] {
  const segs: { a: [number, number]; b: [number, number]; len: number }[] = [];
  let total = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const len = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    segs.push({ a: path[i], b: path[i + 1], len });
    total += len;
  }
  const out: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    let d = ((k + 0.5) / n) * total;
    for (const s of segs) {
      if (d <= s.len || s === segs[segs.length - 1]) {
        const t = Math.min(1, d / s.len);
        const nx = -(s.b[1] - s.a[1]) / s.len;
        const nz = (s.b[0] - s.a[0]) / s.len;
        // (nx, nz) points north-west for this lane's direction; flip if it ever points the other way
        const sign = nx + nz < 0 ? 1 : -1;
        out.push([s.a[0] + (s.b[0] - s.a[0]) * t + nx * side * sign, s.a[1] + (s.b[1] - s.a[1]) * t + nz * side * sign]);
        break;
      }
      d -= s.len;
    }
  }
  return out;
}
