// Pure helpers for the Project Hall showcase (project video, living screens, dioramas).
// No React, no three.js, no DOM: safe in node tests.
import type { ArchLayer } from "@/content/showcase";
import type { Project } from "@/content/profile";

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

/** The painted ring on the ground is 0.5 m wide; the clip plays within it plus this slack. */
export const RING_VISUAL_R = 0.5;
export const RING_SLACK = 0.3;

export type VideoStand = { key: string; ring: [number, number] };

/**
 * The one stand whose clip should play: the stand whose ring the avatar is standing on
 * (inside the ring radius + 0.3 m; the nearest if rings ever overlap), or null anywhere else.
 */
export function videoStateFor(avatarPos: [number, number], stands: VideoStand[]): string | null {
  let best: string | null = null;
  let bestD = RING_VISUAL_R + RING_SLACK;
  for (const s of stands) {
    const d = Math.hypot(avatarPos[0] - s.ring[0], avatarPos[1] - s.ring[1]);
    if (d <= bestD) {
      best = s.key;
      bestD = d;
    }
  }
  return best;
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
