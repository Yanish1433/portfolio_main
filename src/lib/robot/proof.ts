// "Proof, not job titles": claims for a profile with no jobs yet, derived only from the projects'
// real data (stack, highlights, live links). A card exists only when its evidence exists, so editing
// the content can never leave a false claim behind.
import type { Profile, Project } from "@/content/profile";
import { featuredProjects } from "@/content/showcase";

export type TeamCard = { id: string; title: string; evidence: string };

const has = (p: Pick<Project, "stack" | "highlights">, re: RegExp) => p.stack.some((s) => re.test(s)) || p.highlights.some((h) => re.test(h));
const hasAll = (p: Pick<Project, "stack" | "highlights">, res: RegExp[]) => res.every((re) => has(p, re));

/** "in both projects" / "in all 3 projects" / "in Barber On Demand". */
function scope(matched: Project[], pool: Project[]): string {
  if (matched.length === pool.length && pool.length > 1) return pool.length === 2 ? "in both projects" : `in all ${pool.length} projects`;
  return `in ${matched.map((p) => p.name).join(" and ")}`;
}

/** Shipped = has a live link. */
export const shippedProjects = (data: Pick<Profile, "projects">): Project[] => featuredProjects(data).filter((p) => !!p.liveUrl && p.liveUrl.startsWith("http"));

/** "Built and shipped 2 full-stack apps on my own, from design to deployment", or null with nothing shipped. */
export function builtLine(data: Pick<Profile, "projects">): string | null {
  const n = shippedProjects(data).length;
  if (!n) return null;
  return `Built and shipped ${n} full-stack ${n === 1 ? "app" : "apps"} on my own, from design to deployment`;
}

/** "What I can do for your team": 0 to 4 cards, each tied to project evidence. */
export function teamCards(data: Pick<Profile, "projects">): TeamCard[] {
  const pool = shippedProjects(data);
  const cards: TeamCard[] = [];

  const rt = pool.filter((p) => has(p, /websocket/i));
  if (rt.length) {
    const hl = rt[0].highlights.find((h) => /websocket/i.test(h));
    cards.push({ id: "realtime", title: "Real-time features", evidence: `${rt[0].name}: ${hl ?? "live updates with WebSockets"}` });
  }

  const auth = pool.filter((p) => hasAll(p, [/^jwt$/i, /express/i, /^zod$/i]));
  if (auth.length) cards.push({ id: "auth", title: "Secure login & APIs", evidence: `JWT, Express and Zod ${scope(auth, pool)}` });

  const three = pool.filter((p) => hasAll(p, [/react three fiber/i, /^gsap$/i]));
  if (three.length) cards.push({ id: "3d", title: "3D & motion on the web", evidence: `React Three Fiber and GSAP ${scope(three, pool)}` });

  const live = pool.filter((p) => has(p, /cloudflare/i));
  if (live.length) cards.push({ id: "product", title: "A full product, idea to live", evidence: `${live.length === pool.length && pool.length > 1 ? "Both" : live.map((p) => p.name).join(" and ")} deployed on Cloudflare` });

  return cards;
}

/** "internships, junior roles and freelance" (or null when not set). */
export function openToText(data: Pick<Profile, "openTo">): string | null {
  const l = data.openTo ?? [];
  if (!l.length) return null;
  return l.length === 1 ? l[0] : `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`;
}
