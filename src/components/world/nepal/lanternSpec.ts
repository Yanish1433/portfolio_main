// "Hire me" lantern: a tall wooden post with a hanging Newari paper-and-brass lantern. Pure data (no three).

export const HIRE_LANTERN = {
  /** Foot of the post. West of the Ghar's doormat ring, off the spawn line, the timeline lane and the wheel sightline. */
  x: -3.6,
  z: 8.6,
  /** Post height and the arm that carries the lantern toward +x. */
  postH: 4.4,
  armLen: 0.95,
  /** Lantern body centre height. */
  bodyY: 3.55,
  bodyW: 0.62,
  bodyH: 0.9,
  en: "Hire me",
  ne: "मलाई काममा लिनुहोस्",
} as const;

/** World position of the lantern body (the click target). */
export const lanternBody = () => ({ x: HIRE_LANTERN.x + HIRE_LANTERN.armLen, y: HIRE_LANTERN.bodyY, z: HIRE_LANTERN.z });
