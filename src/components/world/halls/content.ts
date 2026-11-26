// What the Project Hall and the Education Zone show. Everything comes from
// src/content/profile.ts; nothing here is hard-coded per item.
//
// Test override (production needs ?debug): ?debug&projects=N (also edu=, certs=, courses=)
// repeats the placeholder entries up to N with suffixed ids, so layouts for 1, 4, 8 or 12
// items can be checked without touching profile.ts. It is read once when the module loads,
// before the nav grid is built, so the obstacles always match what is drawn.
//
// ?debug&skills=N (skills/potData.ts) does the same for the Pottery Square's pots.
//
// Demo media (production needs ?debug): ?debug&media=demo gives the first two projects the
// placeholder clips in public/showcase/demo-a and demo-b, so the living screens and the cinema
// hero can be tested before the captain's real media arrives. profile.ts is not touched.
//
// Poster fallback order (also in public/showcase/README.md), see projectPoster():
//   1. media.poster from profile.ts
//   2. public/showcase/<id>/poster.webp (found on the server, src/app/page.tsx)
//   3. public/projects/<id>.webp (the older thumbnail folder)
//   4. the generated poster (name + tagline + stack on the accent colour)
import { profile, type Certificate, type Course, type Education, type Project } from "@/content/profile";
import { posterUrl, type MediaFiles } from "./showcaseView";

const MAX_OVERRIDE = 40;

export function debugCount(key: string): number | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  if (!q.has("debug") && process.env.NODE_ENV === "production") return null;
  const raw = q.get(key);
  if (raw === null) return null;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 0 && n <= MAX_OVERRIDE ? n : null;
}

function debugFlag(key: string): string | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  if (!q.has("debug") && process.env.NODE_ENV === "production") return null;
  return q.get(key);
}

/** Placeholder media (?debug&media=demo), given to the first projects by position. */
const DEMO_MEDIA: NonNullable<Project["media"]>[] = [
  {
    poster: "/showcase/demo-a/poster.webp",
    screenshots: ["/showcase/demo-a/shot-1.webp", "/showcase/demo-a/shot-2.webp"],
    video: "/showcase/demo-a/demo.webm",
  },
  { poster: "/showcase/demo-b/poster.webp", video: "/showcase/demo-b/demo.webm" },
];

function withDemoMedia(list: Project[]): Project[] {
  if (debugFlag("media") !== "demo") return list;
  return list.map((p, i) => (DEMO_MEDIA[i] ? { ...p, media: { ...p.media, ...DEMO_MEDIA[i] } } : p));
}

function resize<T extends { id: string }>(list: T[], n: number | null, rename: (item: T, copy: number) => T): T[] {
  if (n === null || list.length === 0) return list;
  return Array.from({ length: n }, (_, i) => {
    const base = list[i % list.length];
    const copy = Math.floor(i / list.length);
    return copy === 0 ? base : rename(base, copy + 1);
  });
}

export const HALL: {
  projects: Project[];
  education: Education[];
  certificates: Certificate[];
  courses: Course[];
} = {
  projects: withDemoMedia(resize(profile.projects, debugCount("projects"), (p, k) => ({ ...p, id: `${p.id}-${k}`, name: `${p.name} ${k}`, featured: false }))),
  education: resize(profile.education, debugCount("edu"), (e, k) => ({ ...e, id: `${e.id}-${k}`, school: `${e.school} ${k}` })),
  certificates: resize(profile.certificates, debugCount("certs"), (c, k) => ({ ...c, id: `${c.id}-${k}`, name: `${c.name} ${k}` })),
  courses: resize(profile.courses, debugCount("courses"), (c, k) => ({ ...c, id: `${c.id}-${k}`, name: `${c.name} ${k}` })),
};

export const projectById = (id: string) => HALL.projects.find((p) => p.id === id);

/** Placeholder links are "#": treat "#", empty and null as "no link". */
export const realUrl = (u: string | null | undefined): u is string => !!u && u.trim() !== "" && u.trim() !== "#";

/** Accent colour per project, by its position in the list (neighbours never share one). */
const ACCENTS = ["#c9a227", "#d9775b", "#5fa38c", "#8f6fc2", "#d4604f", "#4f8fc0", "#c98a2e", "#7fa04a"];
export const accentAt = (i: number) => ACCENTS[((i % ACCENTS.length) + ACCENTS.length) % ACCENTS.length];
export const projectAccent = (id: string) => accentAt(Math.max(0, HALL.projects.findIndex((p) => p.id === id)));

/** The poster image of a project (fallback order at the top of this file), or null for the generated one. */
export const projectPoster = (p: Project, files: MediaFiles) => posterUrl(p, files);
