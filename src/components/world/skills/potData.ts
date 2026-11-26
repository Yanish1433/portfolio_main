// The Pottery Square's data, bound to profile.ts at module load (before the nav grid is built).
// ?debug&skills=N (3 to 40) resizes the skill list for layout checks; profile.ts is not touched.
import { profile, type Project } from "@/content/profile";
import { projectsForSkill } from "@/content/showcase";
import { debugCount, HALL } from "../halls/content";
import { standForProject, type Stand } from "../halls/layout";
import { layoutPots, resizeSkills } from "./potLayout";

export const POTS = layoutPots(resizeSkills(profile.skills, debugCount("skills")));

/** Projects (as the hall shows them) that used each pot's skill, in profile order. */
export const POT_PROJECTS: Project[][] = POTS.map((p) => projectsForSkill(p.name, { skills: profile.skills, projects: HALL.projects }));

/** The stands to light up for a pot: one per project (the carousel stand counts once). */
export function standsForPot(i: number): Stand[] {
  const out: Stand[] = [];
  for (const p of POT_PROJECTS[i] ?? []) {
    const s = standForProject(p.id);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}
