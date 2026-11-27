// Pure rules for the robot's "Click me for a guide" chip and the opened guide.

/** Metres the avatar may walk from where the guide opened before it collapses. */
export const WALK_AWAY_M = 6;

/** A new robot line either shows in the bubble or is held as a tip (the chip pulses). */
export function routeLine(s: { guideOpen: boolean; tourActive: boolean }): "show" | "tip" {
  return s.guideOpen || s.tourActive ? "show" : "tip";
}

export type GuideAnchor = { x: number; z: number; zone: string | null };

/** Leaving the zone it opened in, or moving > 6 m from the opening spot, closes the guide. */
export function walkedAway(anchor: GuideAnchor | null, now: { x: number; z: number; zone: string | null }, limit = WALK_AWAY_M): boolean {
  if (!anchor) return false;
  if (now.zone !== anchor.zone) return true;
  return Math.hypot(now.x - anchor.x, now.z - anchor.z) > limit;
}

/**
 * Outside click closes, but not clicks inside the guide or the chat input.
 * `insideGuide` / `insideChat`: the click target is within those elements.
 */
export function outsideClickCloses(open: boolean, insideGuide: boolean, insideChat: boolean): boolean {
  return open && !insideGuide && !insideChat;
}

/** The H hotkey: ignored while typing, with a panel/video open, or in eagle view. */
export function hotkeyAllowed(c: { typing: boolean; panelOpen: boolean; cinema: boolean; eagle: boolean; modifier: boolean }): boolean {
  return !c.typing && !c.panelOpen && !c.cinema && !c.eagle && !c.modifier;
}
