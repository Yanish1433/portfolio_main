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

/** The flagship: the first project marked `featured`, else the first project, else undefined. */
export function featuredProject(data: Pick<Profile, "projects"> = profile): Project | undefined {
  return data.projects.find((p) => p.featured) ?? data.projects[0];
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
