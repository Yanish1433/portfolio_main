// Public entry point of the robot engine. Import from "@/lib/robot".

export { createLocalBrain } from "./brain";
export { FALLBACK_THRESHOLD } from "./matcher";
export { RECRUITER_ANCHORS, ZONE_LABEL } from "./responses";
export { ZONE_IDS } from "./types";
export type {
  IntentId,
  LocalBrainOptions,
  RobotAction,
  RobotBrain,
  RobotContext,
  RobotMode,
  RobotReply,
  RobotSuggestion,
  ZoneId,
} from "./types";
export { QUICK_TOUR_STOPS, QUICK_TOUR_PAUSE_MS, quickTourLines, quickTourDurationMs } from "./quickTour";
export { runTourStops } from "./quickTour";
export type { TourDeps } from "./quickTour";
