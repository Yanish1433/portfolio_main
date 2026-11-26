// Public types of the robot engine. Pure TypeScript: no React, no node:* imports.

export type ZoneId =
  | "plaza"
  | "project-hall"
  | "education"
  | "skills-lab"
  | "timeline"
  | "about"
  | "mailbox"
  | "kiosk";

export const ZONE_IDS: readonly ZoneId[] = [
  "plaza",
  "project-hall",
  "education",
  "skills-lab",
  "timeline",
  "about",
  "mailbox",
  "kiosk",
];

export type RobotAction =
  | { type: "walkTo"; zone: ZoneId }
  | { type: "openProject"; projectId: string }
  | { type: "showResume" }
  | { type: "startTour" }
  | { type: "openRecruiterMode" }
  | { type: "openLink"; url: string; label: string };

export interface RobotSuggestion {
  label: string;
  /** Sent back to the robot as if the visitor typed it. */
  message?: string;
  /** Run directly by the UI when clicked. */
  action?: RobotAction;
}

export interface RobotReply {
  text: string;
  /** Always 2–4 entries, so the visitor never hits a dead end. */
  suggestions: RobotSuggestion[];
  /** Actions the UI should run immediately (explicit visitor commands only). */
  actions?: RobotAction[];
  intent: string;
  /** 0..1 */
  confidence: number;
}

export type RobotMode = "world" | "recruiter";

export interface RobotContext {
  mode: RobotMode;
  currentZone?: ZoneId;
  history?: { role: "user" | "robot"; text: string }[];
  /** The action the robot last offered ("Want me to walk you there?"). Wins over the brain's own memory. */
  lastOffer?: RobotAction;
}

export interface RobotBrain {
  reply(message: string, ctx?: RobotContext): Promise<RobotReply>;
  greet(ctx?: RobotContext): RobotReply;
}

export interface LocalBrainOptions {
  /** Seeds the phrasing picker (mulberry32). Omit for random variety. */
  seed?: number;
}

export type IntentId =
  | "greeting"
  | "who_are_you"
  | "about_owner"
  | "projects_overview"
  | "workshop"
  | "project_detail"
  | "skills_overview"
  | "skill_check"
  | "education"
  | "certificates"
  | "courses"
  | "experience"
  | "contact"
  | "resume"
  | "hire_availability"
  | "location"
  | "tour"
  | "navigate"
  | "recruiter_mode"
  | "thanks"
  | "goodbye"
  | "joke"
  | "help"
  | "affirm"
  | "decline"
  | "fallback";
