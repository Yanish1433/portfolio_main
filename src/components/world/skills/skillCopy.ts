// Plain-word copy for the Pottery Square: the robot's line after a pot is chosen, the "no project"
// line and the first-visit hint. Pure (no React), tested in skills.test.ts.

export const NO_PROJECT_LINE = "Used in learning projects and practice.";
export const SQUARE_HINT = "Each pot is a skill. Bigger pot = stronger skill. Tap one to see where it was used.";

export type RobotSkillLine = { text: string; projectId: string | null; chip: string | null };

/**
 * What the robot says once a pot is chosen. Up to 2 projects are named; with more it only counts them.
 * The chip walks to the FIRST project; with none there is no chip.
 */
export function robotSkillLine(skill: string, projects: { id: string; name: string }[]): RobotSkillLine {
  if (projects.length === 0) {
    return { text: `${skill} comes from learning projects and practice, not from one of the stands.`, projectId: null, chip: null };
  }
  const names = projects.length === 1 ? projects[0].name : projects.length === 2 ? `${projects[0].name} and ${projects[1].name}` : `${projects.length} projects`;
  return { text: `${skill} was used in ${names}. Want to see?`, projectId: projects[0].id, chip: `Take me to ${projects[0].name}` };
}
