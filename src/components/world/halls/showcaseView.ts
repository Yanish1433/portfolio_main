// Pure helpers for the Project Hall showcase (cinema mode, living screens, dioramas).
// No React, no three.js, no DOM: safe in node tests.
import { plainArchitecture, type ArchLayer } from "@/content/showcase";
import type { Project } from "@/content/profile";

// ---------------------------------------------------------------- metrics

/** A metric value split for the count-up: "1.2k" -> 1.2 + "k", "-30%" -> "-" 30 "%", "$4,000" -> "$" 4000. */
export type MetricParts = { prefix: string; num: number; decimals: number; suffix: string; grouped: boolean };

export function parseMetric(value: string): MetricParts | null {
  const m = /^\s*([^\d\s.,]*)\s*(\d[\d,]*(?:\.\d+)?|\.\d+)\s*(.*?)\s*$/.exec(value);
  if (!m) return null;
  const [, prefix, raw, suffix] = m;
  const grouped = raw.includes(",");
  const clean = raw.replace(/,/g, "");
  const num = Number(clean);
  if (!Number.isFinite(num)) return null;
  const dot = clean.indexOf(".");
  return { prefix, num, decimals: dot < 0 ? 0 : clean.length - dot - 1, suffix, grouped };
}

/** The metric shown at count-up progress `n` (0..num). formatMetric(p, p.num) gives back the original look. */
export function formatMetric(p: MetricParts, n: number): string {
  let body = n.toFixed(p.decimals);
  if (p.grouped) {
    const [int, frac] = body.split(".");
    body = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac ? `.${frac}` : "");
  }
  return `${p.prefix}${body}${p.suffix}`;
}

// ---------------------------------------------------------------- tech chips

/** Plain group name for one technology (same guess as plainArchitecture; languages -> "Languages"). */
export function techGroup(tech: string): string {
  const layer = plainArchitecture({ stack: [tech] })[0]?.label;
  if (!layer || layer === "Code") return "Languages";
  return layer;
}

/** The stack grouped for the Tech tab, groups in first-seen order. */
export function groupStack(stack: string[]): { group: string; items: string[] }[] {
  const out: { group: string; items: string[] }[] = [];
  for (const t of stack) {
    const g = techGroup(t);
    const row = out.find((r) => r.group === g);
    if (row) row.items.push(t);
    else out.push({ group: g, items: [t] });
  }
  return out;
}

// ---------------------------------------------------------------- "How it works"

const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/**
 * One plain sentence that reads the diagram aloud:
 * [Website, Server, Database] -> "A visitor's click on the website travels to the server, then the database."
 */
export function flowSentence(layers: Pick<ArchLayer, "label">[]): string {
  const names = layers.map((l) => lowerFirst(l.label.trim())).filter(Boolean);
  if (!names.length) return "";
  if (names.length === 1) return `Everything runs in one place: the ${names[0]}.`;
  const [first, ...rest] = names;
  // "the server", but "payments" (plural layers read better without "the")
  const the = (n: string) => (/s$/i.test(n) && !/ss$/i.test(n) ? n : `the ${n}`);
  const tail = rest.map((n, i) => (i === 0 ? `travels to ${the(n)}` : `then ${the(n)}`)).join(", ");
  return /website|app|page|site/i.test(first)
    ? `A visitor's click on the ${first} ${tail}.`
    : `A visitor's request starts at the ${first}, then ${tail}.`;
}

// ---------------------------------------------------------------- media

export type MediaFiles = {
  /** Project ids with public/showcase/<id>/poster.webp (listed on the server). */
  showcasePosters: ReadonlySet<string>;
  /** Project ids with the older public/projects/<id>.webp thumbnail. */
  thumbs: ReadonlySet<string>;
};

/**
 * The poster image for a stand screen / the cinema hero, in the documented fallback order
 * (public/showcase/README.md): media.poster -> /showcase/<id>/poster.webp -> /projects/<id>.webp ->
 * null (the caller draws the generated poster).
 */
export function posterUrl(p: Pick<Project, "id" | "media">, files: MediaFiles): string | null {
  if (p.media?.poster && p.media.poster.trim()) return p.media.poster;
  const id = encodeURIComponent(p.id);
  if (files.showcasePosters.has(p.id)) return `/showcase/${id}/poster.webp`;
  if (files.thumbs.has(p.id)) return `/projects/${id}.webp`;
  return null;
}

/** Is this a video file the browser can be asked to play (mp4 / webm / mov)? */
export const isVideoUrl = (u: string | null | undefined): u is string => !!u && /\.(mp4|webm|m4v|mov)(\?.*)?$/i.test(u.trim());

/** The demo clip of a project: media.video first, then the older demoVideo field. */
export function videoUrl(p: Pick<Project, "media" | "demoVideo">): string | null {
  if (isVideoUrl(p.media?.video)) return p.media!.video!;
  if (isVideoUrl(p.demoVideo)) return p.demoVideo;
  return null;
}

// ---------------------------------------------------------------- camera

/**
 * Camera pose that fills the view with a screen of size w x h facing +z (centre cx, cy, cz):
 * straight in front of it, far enough that the whole screen fits (a small margin around it).
 */
export function screenPose(
  s: { x: number; y: number; z: number; w: number; h: number },
  fovDeg: number,
  aspect: number,
  margin = 1.08,
): { pos: [number, number, number]; look: [number, number, number] } {
  const halfV = Math.tan((fovDeg * Math.PI) / 360);
  const halfH = halfV * Math.max(0.1, aspect);
  const d = Math.max((s.h / 2 / halfV) * margin, (s.w / 2 / halfH) * margin, 0.4);
  return { pos: [s.x, s.y, s.z + d], look: [s.x, s.y, s.z] };
}

// ---------------------------------------------------------------- living screens

export type ScreenCandidate = { id: string; dist: number; onScreen: boolean };

/** The one stand whose clip plays: the nearest on-screen candidate within `maxDist` m, or null. */
export function pickLiveScreen(list: ScreenCandidate[], maxDist: number): string | null {
  let best: ScreenCandidate | null = null;
  for (const c of list) {
    if (!c.onScreen || c.dist > maxDist) continue;
    if (!best || c.dist < best.dist) best = c;
  }
  return best?.id ?? null;
}

// ---------------------------------------------------------------- dioramas

/** Tiny Newari building per layer: Website -> shop-front, Server -> pagoda-roofed hut, Database -> granary. */
export type BlockKind = "shop" | "pagoda" | "granary" | "house";

export function blockKind(label: string): BlockKind {
  const l = label.toLowerCase();
  if (/web|site|app|page|front|client|ui\b/.test(l)) return "shop";
  if (/server|api|back|worker|function/.test(l)) return "pagoda";
  if (/data|store|storage|cache|db\b/.test(l)) return "granary";
  return "house";
}

export type DioramaBlock = { kind: BlockKind; label: string; tech: string; /** offset from the plinth centre, m */ x: number; /** footprint scale */ s: number };

/** Most blocks a plinth holds; more layers are folded into the last one ("+2 more"). */
export const MAX_BLOCKS = 5;
/** Footprint of one block at scale 1 (m). */
export const BLOCK_SIZE = 0.2;

/**
 * Blocks in order along a plinth of the given top width (m), evenly spread with a margin, and
 * scaled down when they would crowd (never below 0.6). Empty when there are no layers.
 */
export function dioramaBlocks(layers: ArchLayer[], width: number): DioramaBlock[] {
  if (!layers.length) return [];
  let list = layers;
  if (list.length > MAX_BLOCKS) {
    const extra = list.length - (MAX_BLOCKS - 1);
    list = [...list.slice(0, MAX_BLOCKS - 1), { label: `+${extra} more`, tech: list.slice(MAX_BLOCKS - 1).map((l) => l.label).join(", ") }];
  }
  const n = list.length;
  const usable = Math.max(0.2, width - 0.16);
  const slot = usable / n;
  const s = Math.max(0.6, Math.min(1, (slot - 0.06) / BLOCK_SIZE));
  return list.map((l, i) => ({ kind: blockKind(l.label), label: l.label, tech: l.tech, x: -usable / 2 + slot * (i + 0.5), s }));
}
