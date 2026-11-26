// Pure helpers over the content in profile.ts (no React, no fs: safe in the browser and in node tests).
// They only read the optional showcase fields, so the site works whether or not the captain filled them.
import { profile, type Profile, type Project, type Skill } from "./profile";

type Data = Pick<Profile, "skills" | "projects">;

// ---------------------------------------------------------------- matching names

/** Short names people write → the one canonical key. Keys and values are already normalised. */
const ALIASES: Record<string, string> = {
  postgres: "postgresql",
  pg: "postgresql",
  psql: "postgresql",
  ts: "typescript",
  mongo: "mongodb",
  tailwind: "tailwindcss",
  llmapi: "llm",
  llmapis: "llm",
  restapi: "restapis",
  rest: "restapis",
  auth: "authentication",
};

/**
 * Normalise a technology name for comparison: lowercase, no spaces/dots/dashes, no ".js" suffix,
 * then aliases ("Next" and "Next.js" → "next"; "Postgres" and "PostgreSQL" → "postgresql").
 * Equality is on the WHOLE normalised name, so "React" never matches "React Native".
 */
export function normaliseTech(name: string): string {
  let n = name.toLowerCase().trim().replace(/[\s._\-/]+/g, "");
  if (n.length > 3 && n.endsWith("js")) n = n.slice(0, -2);
  return ALIASES[n] ?? n;
}

export const sameTech = (a: string, b: string) => normaliseTech(a) === normaliseTech(b);

function findSkill(data: Data, skillName: string): Skill | undefined {
  for (const g of data.skills) for (const s of g.skills) if (sameTech(s.name, skillName)) return s;
  return undefined;
}

// ---------------------------------------------------------------- helpers

/**
 * Projects that used a skill, in profile order. Uses the skill's `usedIn` ids when it has them,
 * otherwise derives them from each project's `stack`.
 */
export function projectsForSkill(skillName: string, data: Data = profile): Project[] {
  const skill = findSkill(data, skillName);
  if (skill?.usedIn) {
    const ids = new Set(skill.usedIn);
    return data.projects.filter((p) => ids.has(p.id));
  }
  return data.projects.filter((p) => p.stack.some((t) => sameTech(t, skillName)));
}

/**
 * Every flagship: the projects marked `featured`, in profile order. With none marked, the first
 * project stands in as the only flagship. Empty when there are no projects.
 */
export function featuredProjects(data: Pick<Profile, "projects"> = profile): Project[] {
  const list = data.projects.filter((p) => p.featured);
  if (list.length) return list;
  return data.projects.length ? [data.projects[0]] : [];
}

/** A small stable hash of a seed (number or text) into 0..2^32-1. */
function hashSeed(seed: number | string): number {
  const text = String(seed);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The lead flagship: the one that gets the first place (hall, Recruiter Mode, robot). With a
 * `seed` it is picked from the flagships by that seed (same seed, same lead); without one it is
 * the first flagship.
 */
export function leadProject(seed?: number | string, data: Pick<Profile, "projects"> = profile): Project | undefined {
  const list = featuredProjects(data);
  if (!list.length) return undefined;
  if (seed === undefined) return list[0];
  return list[hashSeed(seed) % list.length];
}

/** The flagship (the lead): kept for older callers. Same as leadProject() with no seed. */
export function featuredProject(data: Pick<Profile, "projects"> = profile): Project | undefined {
  return leadProject(undefined, data);
}

/** Projects with the lead first and the rest in their own order. An unknown id changes nothing. */
export function leadFirst<T extends { id: string }>(list: T[], leadId: string | undefined): T[] {
  const i = leadId ? list.findIndex((p) => p.id === leadId) : -1;
  return i <= 0 ? list : [list[i], ...list.slice(0, i), ...list.slice(i + 1)];
}

/**
 * The tagline to show. When the project has a `disclaimer`, a trailing "(concept, ...)" note in
 * the tagline is dropped, because the disclaimer is shown on its own line right beside it.
 */
export function taglineOf(p: Pick<Project, "tagline" | "disclaimer">): string {
  if (!p.disclaimer) return p.tagline;
  return p.tagline.replace(/\s*\((?:concept|not affiliated)[^)]*\)\s*$/i, "") || p.tagline;
}

export type ArchLayer = { label: string; tech: string };

/** Plain-word layer for a technology (a guess). Languages are not layers, so they map to null. */
const LAYER_OF: Record<string, string | null> = {
  react: "Website",
  next: "Website",
  vue: "Website",
  nuxt: "Website",
  svelte: "Website",
  angular: "Website",
  tailwindcss: "Website",
  three: "Website",
  html: "Website",
  css: "Website",
  vite: "Website",
  node: "Server",
  express: "Server",
  fastify: "Server",
  nest: "Server",
  django: "Server",
  flask: "Server",
  fastapi: "Server",
  rails: "Server",
  spring: "Server",
  restapis: "Server",
  authentication: "Server",
  websockets: "Live link",
  socketio: "Live link",
  postgresql: "Database",
  mysql: "Database",
  sqlite: "Database",
  mongodb: "Database",
  redis: "Database",
  firebase: "Database",
  supabase: "Database",
  prisma: "Database",
  stripe: "Payments",
  llm: "AI helper",
  openai: "AI helper",
  treesitter: "Code reader",
  docker: "Hosting",
  aws: "Hosting",
  vercel: "Hosting",
  typescript: null,
  javascript: null,
  python: null,
  java: null,
  go: null,
  rust: null,
};

const LAYER_ORDER = ["Website", "Live link", "Server", "Code reader", "AI helper", "Database", "Payments", "Hosting", "Other"];

/**
 * The plain-word layers of a project, in order. Uses `architecture` when given; otherwise guesses
 * from `stack` (website → server → database → extras). Always an array (empty if there is no stack).
 */
export function plainArchitecture(project: Pick<Project, "stack" | "architecture">): ArchLayer[] {
  if (project.architecture && project.architecture.length) return project.architecture;
  const groups = new Map<string, string[]>();
  const skipped: string[] = [];
  for (const tech of project.stack) {
    const key = normaliseTech(tech);
    const layer = key in LAYER_OF ? LAYER_OF[key] : "Other";
    if (layer === null) {
      skipped.push(tech);
      continue;
    }
    const list = groups.get(layer) ?? [];
    list.push(tech);
    groups.set(layer, list);
  }
  const out: ArchLayer[] = LAYER_ORDER.filter((l) => groups.has(l)).map((l) => ({ label: l, tech: groups.get(l)!.join(", ") }));
  if (!out.length && skipped.length) out.push({ label: "Code", tech: skipped.join(", ") });
  return out;
}
