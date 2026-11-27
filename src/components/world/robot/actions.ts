// Robot brain wiring + action runner (walkTo, openProject, tour, ...).
// Robot-led walks and the tour are async sequences with an AbortController;
// any visitor input (ground click, WASD, joystick, chat) aborts them.
import { createLocalBrain, quickTourLines, QUICK_TOUR_PAUSE_MS, QUICK_TOUR_STOPS, runTourStops, ZONE_LABEL, type RobotAction, type RobotBrain, type RobotReply, type RobotSuggestion, type ZoneId } from "@/lib/robot";
import { profile } from "@/content/profile";
import { leadFirst } from "@/content/showcase";
import { useWorld } from "@/store/world";
import { zoneById, type ZoneId as WorldZoneId } from "../zones";
import { avatarMotion, playerPos, worldControl } from "../input";
import { LABELS } from "../nepal/labels";
import { NAVIGATE_EVENT } from "../nepal/navigate";
import { robotMotion, useRobot } from "./robotStore";
import { HALL, LEAD_ID, realUrl } from "../halls/content";
import { spotByKey, ZONE_FACE } from "../halls/layout";
import { visit } from "../halls/visit";

// The engine's ZoneIds are the same strings as zones.ts, so no mapping is needed.
// This line stops compiling if the two unions ever drift apart.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const ZONE_IDS_MATCH: Same<ZoneId, WorldZoneId> = true;

export const TOUR: ZoneId[] = ["plaza", "about", "project-hall", "education", "skills-lab", "timeline", "mailbox", "kiosk"];

const TOUR_LINES: Record<ZoneId, string> = {
  plaza: `This is Durbar Square, the heart of ${profile.name}'s portfolio. Every path starts here.`,
  "project-hall": `The Project Hall: ${profile.projects.length} projects stand along the dalan, the carved gallery. Walk up to any stand.`,
  education: "The pathshala, the old school house. Degree plaques, certificates and a bookshelf of courses are in the courtyard.",
  "skills-lab": "The prayer wheels! Each wheel is one group of skills.",
  timeline: "The brick lane is the work journey, one milestone stone per step.",
  about: `${profile.name.split(" ")[0]}'s Ghar, the home of the person behind this portfolio. Step up to the doormat to read the story.`,
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
  about_owner: "about",
  contact: "mailbox",
  recruiter_mode: "kiosk",
};

let brain: RobotBrain | null = null;
// The robot suggests this session's lead project first (the profile it reads is lead-first).
const getBrain = () => (brain ??= createLocalBrain({ ...profile, projects: leadFirst(profile.projects, LEAD_ID) }));

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
      // Eagle view and cinema also end a tour (the avatar can't be led while the camera is elsewhere).
      else if (s.tourActive && (s.cinema || s.cameraMode === "eagle")) abortRobotTask();
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

/** The full tour (8 stops, "Show me around") or the Quick tour (6 stops, ~5 s each, ~60 s in all). */
async function tour(quick = false) {
  const signal = newTask();
  useWorld.getState().setTourActive(true);
  const say = useRobot.getState().say;
  const stops: readonly ZoneId[] = quick ? QUICK_TOUR_STOPS : TOUR;
  const lines: Partial<Record<ZoneId, string>> = quick ? quickTourLines(profile) : TOUR_LINES;
  const pause = quick ? QUICK_TOUR_PAUSE_MS : 3200;
  try {
    await runTourStops(
      stops,
      pause,
      {
        inZone,
        leadTo: (zone, sig) => {
          say(`${LABELS.robot.followMe} Next: ${ZONE_LABEL[zone].replace(/^the /, "")}.`, [stopTourChip]);
          return leadTo(zone, sig);
        },
        arrive: (zone) => {
          console.info(`[tour] at ${zone} t=${Math.round(performance.now())}ms`);
          faceZone(zone);
          lookAtZone(zone, quick ? 4 : 3);
          say(lines[zone] ?? "", [stopTourChip]);
        },
        sleep,
      },
      signal,
    );
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

const stopTourChip: RobotSuggestion = { label: LABELS.ui.stopTour, message: "__stop_tour__" };

/** The Quick tour button: same tour machinery (one cancel path), the 6-stop sequence. */
export function startQuickTour() {
  useWorld.getState().interrupt();
  void tour(true);
}

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
      if (action.projectId === "workshop") {
        // the Workshop (GitHub-only projects) hangs in the Project Hall's east bay
        if (!spoken) robot.say(`${LABELS.robot.followMe} The Workshop hangs at the east end of the Project Hall.`);
        const ws = spotByKey("workshop");
        if (!ws) {
          void walkSequence("project-hall");
          return;
        }
        robotMotion.lookAt = [ws.x, ws.z];
        robotMotion.lookUntil = performance.now() / 1000 + 3;
        void visit({ kind: "workshop", id: "all", spot: "workshop" }, { signal: newTask(), lead: "project-hall" });
        return;
      }
      // Open that project's demo video full screen (no walk to the stand: that was the "zooming in" chore).
      const proj = profile.projects.find((p) => p.id === action.projectId);
      if (proj && HALL.projects.some((p) => p.id === action.projectId)) {
        abortRobotTask();
        useWorld.getState().openCinema(action.projectId, false);
        return;
      }
      // Unknown id: just take them to the Project Hall.
      if (!spoken) robot.say(`${LABELS.robot.followMe} That project is in the Project Hall.`);
      void walkSequence("project-hall");
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
  openGuideNow(false); // a typed question always opens the guide (the reply shows in it)
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
    useRobot.getState().closeGuide(); // acting (walk, tour, video): back to the small chip
    useWorld.getState().interrupt();
    runAction(s.action);
  } else void ask(s.message ?? s.label);
}

/** Open the guide: the latest tip (if any) plus the contextual chips for where the avatar is. */
export function openGuideNow(withContent = true) {
  const robot = useRobot.getState();
  const anchor = { x: playerPos.x, z: playerPos.z, zone: useWorld.getState().activeZone };
  if (!withContent) {
    robot.openGuide(anchor, robot.pendingTip);
    return;
  }
  const tip = robot.pendingTip;
  const ctxSug = getBrain().greet(ctx());
  const seen = new Set<string>();
  const suggestions = [...(tip?.suggestions ?? []), ...ctxSug.suggestions]
    .filter((sg) => (seen.has(sg.label) ? false : (seen.add(sg.label), true)))
    .slice(0, 4);
  robot.openGuide(anchor, { id: tip?.id ?? -1, text: tip?.text ?? ctxSug.text, suggestions });
}
