// Walk the avatar to a stand / plaque / easel / the shelf, turn to face it, then open its
// panel. Used by clicks on the 3D objects, the zone card's lists and the robot's
// openProject action. Any visitor input (ground click, keys, joystick, chat) cancels it.
import type { ZoneId } from "@/lib/robot";
import { useWorld, type InfoRef } from "@/store/world";
import { avatarMotion, playerPos, worldControl } from "../input";
import { robotMotion } from "../robot/robotStore";
import { HALL } from "./content";
import { spotByKey, standForProject, SHELF_SPOT_KEY, type Spot } from "./layout";

/** Key of the spot being walked to (the walk-up logic leaves other spots alone meanwhile). */
export const visitState = { key: null as string | null };

let current: AbortController | null = null;

const STALL_MS = 8000;
const abortError = () => new DOMException("aborted", "AbortError");

/** The panel a spot opens by default when the avatar walks up to it. */
export function defaultInfo(spot: Spot): InfoRef | null {
  switch (spot.kind) {
    case "project": {
      const p = HALL.projects[spot.index];
      return p ? { kind: "project", id: p.id, spot: spot.key } : null;
    }
    case "more":
      return { kind: "more", id: "more", spot: spot.key };
    case "education": {
      const e = HALL.education[spot.index];
      return e ? { kind: "education", id: e.id, spot: spot.key } : null;
    }
    case "certificate": {
      const c = HALL.certificates[spot.index];
      return c ? { kind: "certificate", id: c.id, spot: spot.key } : null;
    }
    default:
      return null;
  }
}

export function projectInfo(id: string): InfoRef | null {
  const stand = standForProject(id);
  return stand ? { kind: "project", id, spot: stand.spot.key } : null;
}

export const courseInfo = (id: string): InfoRef => ({ kind: "course", id, spot: SHELF_SPOT_KEY });

function waitArrive(seq0: number, x: number, z: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    let lastDist = avatarMotion.dist;
    let lastMove = performance.now();
    const finish = (ok: boolean) => {
      unsub();
      window.clearInterval(watch);
      if (ok) resolve();
      else reject(abortError());
    };
    const unsub = useWorld.subscribe((s) => {
      if (s.arrivedSeq !== seq0) finish(true);
    });
    const watch = window.setInterval(() => {
      const now = performance.now();
      if (avatarMotion.dist !== lastDist) {
        lastDist = avatarMotion.dist;
        lastMove = now;
      }
      if (Math.hypot(playerPos.x - x, playerPos.z - z) < 0.3 && avatarMotion.speed < 0.2) finish(true);
      else if (now - lastMove > STALL_MS) finish(false);
    }, 250);
    signal.addEventListener("abort", () => finish(false));
  });
}

/**
 * Walk to `ref`'s spot and open it. `signal`: an outer task (the robot's) that can abort it;
 * `lead`: the robot flies ahead while walking. Resolves true once the panel is open.
 */
export async function visit(ref: InfoRef, opts: { signal?: AbortSignal; lead?: ZoneId } = {}): Promise<boolean> {
  const spot = spotByKey(ref.spot);
  if (!spot || !worldControl.walkTo) return false;
  current?.abort();
  const ctl = new AbortController();
  current = ctl;
  if (opts.signal) {
    if (opts.signal.aborted) return false;
    opts.signal.addEventListener("abort", () => ctl.abort());
  }
  const seq0 = useWorld.getState().interruptSeq;
  const unsubInput = useWorld.subscribe((s) => {
    if (s.interruptSeq !== seq0) ctl.abort();
  });
  visitState.key = spot.key;
  const w = useWorld.getState();
  if (w.info && w.info.spot !== spot.key) w.closeInfo(false);
  try {
    const [rx, rz] = spot.ring;
    if (Math.hypot(playerPos.x - rx, playerPos.z - rz) > 0.25) {
      const arrived0 = useWorld.getState().arrivedSeq;
      if (!worldControl.walkTo(rx, rz)) return false;
      if (opts.lead) robotMotion.leading = opts.lead;
      await waitArrive(arrived0, rx, rz, ctl.signal);
    }
    if (ctl.signal.aborted) return false;
    worldControl.face?.(spot.x, spot.z);
    useWorld.getState().openInfo(ref);
    return true;
  } catch {
    return false;
  } finally {
    unsubInput();
    if (opts.lead) robotMotion.leading = null;
    if (current === ctl) {
      current = null;
      visitState.key = null;
    }
  }
}

/** A click on a 3D display or a zone-card button: counts as visitor input (cancels tours), then walks. */
export function visitByVisitor(ref: InfoRef): Promise<boolean> {
  useWorld.getState().interrupt();
  return visit(ref);
}
