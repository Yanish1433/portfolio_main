// Pure helpers for "Yanish's Ghar" (About me). No React, no three.js.
import type { About, Profile } from "@/content/profile";

/** "#", "" and null are placeholders: there is nothing to open. */
export const isRealHref = (h: string | null | undefined): h is string => !!h && h.trim() !== "" && h.trim() !== "#";

export type CtaState =
  | { kind: "link"; href: string; external: boolean }
  | { kind: "soon" };

/** A button's href: a real link, or a placeholder ("coming soon", never a dead link). */
export function ctaState(href: string | null | undefined): CtaState {
  if (!isRealHref(href)) return { kind: "soon" };
  const h = href.trim();
  return { kind: "link", href: h, external: /^https?:/i.test(h) };
}

export type CtaPlan =
  | { type: "link"; href: string; external: boolean }
  | { type: "walkMailbox" }
  | { type: "resume" }
  | { type: "soon" };

/**
 * What a CTA button does. "Contact" / "Hire me" walk to the mailbox while their link is a
 * placeholder; "Download resume" uses the resume action when `links.resumeUrl` is real.
 */
export function ctaPlan(cta: { label: string; href: string }, links: Profile["links"]): CtaPlan {
  const s = ctaState(cta.href);
  if (s.kind === "link") return { type: "link", href: s.href, external: s.external };
  const l = cta.label.toLowerCase();
  if (/contact|hire/.test(l)) return { type: "walkMailbox" };
  if (/resume|cv/.test(l) && isRealHref(links.resumeUrl)) return { type: "resume" };
  return { type: "soon" };
}

/** Initials for the generated portrait card ("Yanish Gurung" gives "YG"). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const pick = parts.length === 1 ? [parts[0]] : [parts[0], parts[parts.length - 1]];
  return pick.map((p) => Array.from(p)[0].toUpperCase()).join("");
}

const isPlaceholder = (s: string | undefined) => !s || /^\s*placeholder/i.test(s);

/** The robot's one-line introduction: name and title (and place), skipping any placeholder field. Never a pronoun. */
export function introLine(p: Pick<Profile, "name" | "title" | "location">): string {
  const first = p.name.trim().split(/\s+/)[0] || p.name;
  const title = isPlaceholder(p.title) ? "" : p.title.trim();
  const place = isPlaceholder(p.location) ? "" : p.location.trim();
  let line = `Welcome to ${first}'s Ghar!`;
  if (title) line += ` ${first} is a ${title}${place ? ` based in ${place}` : ""}.`;
  else if (place) line += ` ${first} is based in ${place}.`;
  return line;
}

/** The hint on the first approach. */
export const gharHint = (name: string) => {
  const first = name.trim().split(/\s+/)[0] || name;
  return `This is ${first}'s home. Walk in to meet ${first}.`;
};

/** First-visit flags live in sessionStorage; every access is guarded (storage may be blocked). */
export function takeOnce(key: string, storage?: Pick<Storage, "getItem" | "setItem"> | null): boolean {
  let s = storage;
  try {
    if (s === undefined) s = typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    s = null;
  }
  if (!s) return true;
  try {
    if (s.getItem(key)) return false;
    s.setItem(key, "1");
  } catch {
    /* ignore */
  }
  return true;
}

export const aboutOf = (p: Pick<Profile, "about">): About | undefined => p.about;
