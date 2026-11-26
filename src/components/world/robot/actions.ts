// Robot brain wiring + action runner (walkTo, openProject, tour, ...).
// Robot-led walks and the tour are async sequences with an AbortController;
// any visitor input (ground click, WASD, joystick, chat) aborts them.
import { createLocalBrain, ZONE_LABEL, type RobotAction, type RobotBrain, type RobotReply, type RobotSuggestion, type ZoneId } from "@/lib/robot";
import { profile } from "@/content/profile";
import { useWorld } from "@/store/world";
import { zoneById, type ZoneId as WorldZoneId } from "../zones";
import { avatarMotion, playerPos, worldControl } from "../input";
import { LABELS } from "../nepal/labels";
import { NAVIGATE_EVENT } from "../nepal/navigate";
import { robotMotion, useRobot } from "./robotStore";
import { realUrl } from "../halls/content";
import { spotByKey, ZONE_FACE } from "../halls/layout";
import { projectInfo, visit } from "../halls/visit";

// The engine's ZoneIds are the same strings as zones.ts, so no mapping is needed.
// This line stops compiling if the two unions ever drift apart.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const ZONE_IDS_MATCH: Same<ZoneId, WorldZoneId> = true;

export const TOUR: ZoneId[] = ["plaza", "project-hall", "education", "skills-lab", "timeline", "mailbox", "kiosk"];

const TOUR_LINES: Record<ZoneId, string> = {
  plaza: `This is Durbar Square, the heart of ${profile.name}'s portfolio. Every path starts here.`,
  "project-hall": `The Project Hall: ${profile.projects.length} projects stand along the dalan, the carved gallery. Walk up to any stand.`,
  education: "The pathshala, the old school house. Degree plaques, certificates and a bookshelf of courses are in the courtyard.",
  "skills-lab": "Pottery Square! Each row of pots is one group of skills.",
  timeline: "The brick lane is the work journey, one milestone stone per step.",
  mailbox: "The hulak (post box). This is where you can get in touch.",
  kiosk: `Last stop: the chiya pasal. In a hurry? Recruiter Mode (${LABELS.zones.kiosk.ne}) has everything on one page.`,
};

/** Which zone a reply is "about", so the robot glances at it. */
const INTENT_ZONE: Partial<Record<string, ZoneId>> = {
  projects_overview: "project-hall",
  project_detail: "project-hall",
  skills_overview: "skills-lab",
  skill_check: "skills-lab",
  education: "education",
  certificates: "education",
  courses: "education",
  experience: "timeline",
  contact: "mailbox",
  recruiter_mode: "kiosk",
};

let brain: RobotBrain | null = null;
const getBrain = () => (brain ??= createLocalBrain(profile));

let current: AbortController | null = null;
let watching = false;

/** Abort the running tour / robot-led walk. */
export function abortRobotTask() {
  current?.abort();
  current = null;
}

function newTask(): AbortSignal {
  abortRobotTask();
  // Visitor input (the world store's interrupt counter) cancels the task.
  if (!watching) {
    watching = true;
    useWorld.subscribe((s, prev) => {
      if (s.interruptSeq !== prev.interruptSeq) abortRobotTask();
    });
  }
  current = new AbortController();
  const signal = current.signal;
  signal.addEventListener("abort", () => {
    robotMotion.leading = null;
    useWorld.getState().setTourActive(false);
  });
  return signal;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("aborted", "AbortError"));
    const t = window.setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      window.clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    });
  });

const inZone = (id: ZoneId) => {
  const z = zoneById(id);
  return !!z && Math.hypot(playerPos.x - z.ring[0], playerPos.z - z.ring[1]) < z.ringRadius;
};

/** A leg that makes no progress for this long (wall clock) is abandoned, so a tour can never hang. */
const STALL_MS = 8000;
/** Hard cap per leg. */
const LEG_MAX_MS = 5 * 60 * 1000;

/**
 * Auto-walk the avatar to a zone ring (robot leads). "Arrived" = the path is complete (the
 * player clamps each step to the remaining distance, so running can't overshoot) or the avatar
 * is already inside the ring; a stalled or overlong leg logs and continues instead of hanging.
 */
async function leadTo(zone: ZoneId, signal: AbortSignal): Promise<void> {
  const z = zoneById(zone);
  if (!z) throw new Error(`unknown zone ${zone}`);
  if (inZone(zone)) return;
  const world = useWorld.getState();
  const seq0 = world.arrivedSeq;
  if (!worldControl.walkTo?.(z.ring[0], z.ring[1])) throw new Error(`no path to ${zone}`);
  robotMotion.leading = zone;
  try {
    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException("aborted", "AbortError"));
      const started = performance.now();
      let lastDist = avatarMotion.dist;
      let lastMove = started;
      const done = () => {
        unsub();
        window.clearInterval(watch);
        resolve();
      };
      const unsub = useWorld.subscribe((s) => {
        if (s.arrivedSeq !== seq0) done();
      });
      const watch = window.setInterval(() => {
        const now = performance.now();
        if (avatarMotion.dist !== lastDist) {
          lastDist = avatarMotion.dist;
          lastMove = now;
        }
        if (inZone(zone) && avatarMotion.speed < 0.2) done();
        else if (now - lastMove > STALL_MS || now - started > LEG_MAX_MS) {
          console.warn(`[tour] leg to ${zone} gave up (${now - lastMove > STALL_MS ? "stalled" : "timeout"})`);
          done();
        }
      }, 500);
      signal.addEventListener("abort", () => {
        unsub();
        window.clearInterval(watch);
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  } finally {
    robotMotion.leading = null;
  }
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

function lookAtZone(zone: ZoneId, seconds = 4) {
  const z = zoneById(zone);
  if (!z) return;
  robotMotion.lookAt = z.position;
  robotMotion.lookUntil = performance.now() / 1000 + seconds;
}

/** After a robot-led walk, turn the avatar toward what the zone is about (plaques, first stand). */
function faceZone(zone: ZoneId) {
  const p = ZONE_FACE[zone];
  if (p) worldControl.face?.(p[0], p[1]);
}

async function walkSequence(zone: ZoneId, after?: () => void) {
  const signal = newTask();
  try {
    await leadTo(zone, signal);
    faceZone(zone);
    after?.();
  } catch (e) {
    if (!isAbort(e)) console.warn("[robot]", e);
  }
}

async function tour() {
  const signal = newTask();
  useWorld.getState().setTourActive(true);
  const say = useRobot.getState().say;
  try {
    for (const zone of TOUR) {
      if (!inZone(zone)) {
        say(`${LABELS.robot.followMe} Next: ${ZONE_LABEL[zone].replace(/^the /, "")}.`, [stopTourChip]);
        await leadTo(zone, signal);
      }
      console.info(`[tour] at ${zone} t=${Math.round(performance.now())}ms`);
      faceZone(zone);
      lookAtZone(zone, 3);
      say(TOUR_LINES[zone], [stopTourChip]);
      await sleep(3200, signal);
    }
    useWorld.getState().setTourActive(false);
    say("That's the whole town! Ask me anything, or wander around on your own.", [
      { label: "See the projects", message: "Show me the projects" },
      { label: "What are the skills?", message: "What are the skills?" },
      { label: "How can I contact you?", message: "How can I contact you?" },
    ]);
  } catch (e) {
    if (!isAbort(e)) console.warn("[robot]", e);
  } finally {
    useWorld.getState().setTourActive(false);
  }
}

/** Said at a project's stand once the robot has walked the visitor there. */
export const CASE_STUDY_LINE = "Want the full story? Tap Open case study.";

const stopTourChip: RobotSuggestion = { label: LABELS.ui.stopTour, message: "__stop_tour__" };

/** Run one RobotAction. `spoken`: the brain already said something for it. */
export function runAction(action: RobotAction, spoken = false) {
  const robot = useRobot.getState();
  switch (action.type) {
    case "walkTo":
      if (!spoken) robot.say(`${LABELS.robot.followMe} Heading to ${ZONE_LABEL[action.zone]}.`);
      lookAtZone(action.zone, 2);
      void walkSequence(action.zone);
      return;
    case "openProject": {
      // Walk to that project's stand in the dalan and open its panel.
      const proj = profile.projects.find((p) => p.id === action.projectId);
      const ref = projectInfo(action.projectId);
      if (!spoken) robot.say(`${LABELS.robot.followMe} ${proj ? `${proj.name} has its own stand` : "That project is"} in the Project Hall.`);
      useWorld.getState().setFocusProject(action.projectId);
      if (!ref) {
        void walkSequence("project-hall");
        return;
      }
      const signal = newTask();
      const spot = spotByKey(ref.spot);
      if (spot) {
        robotMotion.lookAt = [spot.x, spot.z];
        robotMotion.lookUntil = performance.now() / 1000 + 3;
      }
      // Arrived: the stand's teaser is open. Point at the case study, but don't open it for them.
      void visit(ref, { signal, lead: "project-hall" }).then((ok) => {
        if (ok && useWorld.getState().info?.id === action.projectId) useRobot.getState().say(CASE_STUDY_LINE);
      });
      return;
    }
    case "showResume":
      if (realUrl(profile.links.resumeUrl)) window.open(profile.links.resumeUrl, "_blank", "noopener,noreferrer");
      else useWorld.getState().showToast(LABELS.ui.resumeSoon);
      return;
    case "startTour":
      void tour();
      return;
    case "openRecruiterMode":
      window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: "/recruiter" }));
      return;
    case "openLink":
      if (realUrl(action.url)) window.open(action.url, "_blank", "noopener,noreferrer");
      else useWorld.getState().showToast(`${action.label}: coming soon`);
      return;
  }
}

function ctx() {
  const { history, lastOffer } = useRobot.getState();
  const zone = useWorld.getState().activeZone as ZoneId | null;
  return { mode: "world" as const, currentZone: zone ?? undefined, history, lastOffer };
}

/** The "Yes, take me" style suggestion is what a later "yes" should run. */
const offerOf = (r: RobotReply) => r.suggestions.find((s) => s.action && /^yes\b/i.test(s.label))?.action;

function show(r: RobotReply) {
  robotMotion.repliedAt = performance.now() / 1000;
  const zone = INTENT_ZONE[r.intent];
  if (zone) lookAtZone(zone);
  useRobot.getState().say(r.text, r.suggestions);
  useRobot.getState().setLastOffer(offerOf(r));
}

export function greet() {
  show(getBrain().greet(ctx()));
}

/** Visitor message (typed or a chip). */
export async function ask(text: string) {
  const msg = text.trim();
  const world = useWorld.getState();
  world.interrupt(); // chat input aborts a tour / robot-led walk
  if (msg === "__stop_tour__") {
    useRobot.getState().say("Tour stopped. Ask me anything!", [
      { label: "See the projects", message: "Show me the projects" },
      { label: "Show me around", message: "Show me around" },
    ]);
    return;
  }
  const robot = useRobot.getState();
  const c = ctx();
  robot.pushUser(msg);
  robot.setThinking(true);
  const started = performance.now();
  const reply = await getBrain().reply(msg, c);
  // A short "thinking" beat so the eyes have time to show it.
  const wait = 450 - (performance.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  show(reply);
  const actions = reply.actions ?? [];
  for (const a of actions) runAction(a, true);
}

/** A chip under the bubble: run its action, or send its message. */
export function pickSuggestion(s: RobotSuggestion) {
  if (s.action) {
    useWorld.getState().interrupt();
    runAction(s.action);
  } else void ask(s.message ?? s.label);
}
