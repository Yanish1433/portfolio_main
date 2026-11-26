// Placeholder detection for Recruiter Mode: nothing that is "#", empty or "Placeholder ..." is shown.

/** True for text the captain has not filled in yet ("Placeholder City, Country"). */
export const isPlaceholder = (text: string | null | undefined): boolean => !text || /^\s*placeholder\b/i.test(text);

/** True when `href` points somewhere real: not empty, not "#", not a placeholder. */
export function isRealLink(href: string | null | undefined): boolean {
  const h = (href ?? "").trim();
  if (!h || h === "#" || isPlaceholder(h)) return false;
  return /^(https?:\/\/|\/|mailto:)/i.test(h);
}

/** An email counts as real only if it looks like an address (or a mailto: link with one). */
export function isRealEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().replace(/^mailto:/i, "");
  return !isPlaceholder(e) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
