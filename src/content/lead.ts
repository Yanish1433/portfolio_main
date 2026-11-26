// Which flagship leads for this visitor. Picked at random once per browser session and kept in
// sessionStorage ("lead-project"), so a refresh or a walk between the world and Recruiter Mode
// keeps the same lead. Everything that touches the browser is in try/catch: if storage is
// blocked or throws, the default (the first flagship) is used. No React, no three.js.
import { profile, type Profile } from "./profile";
import { featuredProjects, leadFirst } from "./showcase";

export const LEAD_KEY = "lead-project";

type Store = Pick<Storage, "getItem" | "setItem">;
type Data = Pick<Profile, "projects">;

/** `?lead=barber` (or `goldstar`, or a full id): any flagship whose id contains the text. */
function overrideFrom(search: string, data: Data): string | undefined {
  const q = new URLSearchParams(search);
  // like the other test overrides: production only honours it together with ?debug
  if (!q.has("debug") && process.env.NODE_ENV === "production") return undefined;
  const want = q.get("lead")?.trim().toLowerCase();
  if (!want) return undefined;
  return featuredProjects(data).find((p) => p.id.toLowerCase().includes(want))?.id;
}

/**
 * The lead's id. On the server (no window) and whenever anything fails, the first flagship.
 * `env` is only for tests.
 */
export function resolveLeadId(
  data: Data = profile,
  env?: { storage?: Store | null; search?: string; random?: () => number },
): string | undefined {
  const flagships = featuredProjects(data);
  const fallback = flagships[0]?.id;
  if (flagships.length < 2) return fallback;
  const hasWindow = typeof window !== "undefined";
  try {
    const search = env?.search ?? (hasWindow ? window.location.search : "");
    const forced = overrideFrom(search, data);
    if (forced) return forced;
  } catch {
    /* ignore */
  }
  let storage: Store | null = null;
  try {
    storage = env?.storage !== undefined ? env.storage : hasWindow ? window.sessionStorage : null;
  } catch {
    storage = null;
  }
  if (!storage) return fallback;
  try {
    const saved = storage.getItem(LEAD_KEY);
    if (saved && flagships.some((p) => p.id === saved)) return saved;
    const pick = flagships[Math.min(flagships.length - 1, Math.floor((env?.random ?? Math.random)() * flagships.length))].id;
    storage.setItem(LEAD_KEY, pick);
    return pick;
  } catch {
    return fallback;
  }
}

/** The same profile with this session's lead project first (so the robot suggests it first). */
export function profileLeadFirst(data: Profile = profile, leadId: string | undefined = resolveLeadId(data)): Profile {
  return { ...data, projects: leadFirst(data.projects, leadId) };
}
