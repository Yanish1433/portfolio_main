// The prayer-wheel gallery's data, bound to profile.ts at module load (before the nav grid is built).
// ?debug&groups=N (1 to 8) resizes the group list for layout checks; profile.ts is not touched.
import { profile, type Project } from "@/content/profile";
import { projectsForSkill } from "@/content/showcase";
import { debugCount, HALL } from "../halls/content";
import { standForProject, type Stand } from "../halls/layout";
import { layoutWheels, projectsForGroup, resizeGroups } from "./wheelLayout";

export const WHEELS = layoutWheels(resizeGroups(profile.skills, debugCount("groups")));

/** Projects (as the hall shows them) that used any skill of each wheel's group, de-duplicated, in profile order. */
export const WHEEL_PROJECTS: Project[][] = WHEELS.map((w) => projectsForGroup(w.skills, (name) => projectsForSkill(name, { skills: profile.skills, projects: HALL.projects })));

/** The stands to light up for a wheel: one per project (the carousel stand counts once). */
export function standsForWheel(i: number): Stand[] {
  const out: Stand[] = [];
  for (const p of WHEEL_PROJECTS[i] ?? []) {
    const s = standForProject(p.id);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}
