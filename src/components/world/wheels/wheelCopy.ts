// Plain-word copy for the prayer-wheel gallery: the robot's line after a wheel is chosen, the "no project"
// line and the first-visit hint. Pure (no React), tested in wheels.test.ts.

export const NO_PROJECT_LINE = "Used in learning projects and practice.";
export const WHEEL_HINT = "Each prayer wheel is a group of skills. Spin one to see the skills and where they were used.";

export type RobotWheelLine = { text: string; projectId: string | null; chip: string | null };

/**
 * What the robot says once a wheel is chosen. Up to 2 projects are named; with more it only counts them.
 * The chip walks to the FIRST project; with none there is no chip. `group` is the plain group name ("Websites & apps").
 */
export function robotGroupLine(group: string, projects: { id: string; name: string }[]): RobotWheelLine {
  if (projects.length === 0) {
    return { text: `${group} skills come from learning projects and practice, not from one of the stands.`, projectId: null, chip: null };
  }
  const names = projects.length === 1 ? projects[0].name : projects.length === 2 ? `${projects[0].name} and ${projects[1].name}` : `${projects.length} projects`;
  return { text: `${group} skills were used in ${names}. Want to see?`, projectId: projects[0].id, chip: `Take me to ${projects[0].name}` };
}
