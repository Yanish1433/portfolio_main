// The "Go to…" list: the sections a visitor can ask the golden footprints to lead to.
// Targets come from zones.ts / halls layout (read-only): the section's entrance ring.
import type { Vec2 } from "@/store/world";
import { zoneById, type ZoneId } from "../zones";
import { WORKSHOP_SPOT } from "../halls/workshopLayout";

export type Section = { id: string; label: string; icon: string; zone?: ZoneId };

export const SECTIONS: Section[] = [
  { id: "about", label: "About (Ghar)", icon: "🏠", zone: "about" },
  { id: "projects", label: "Projects", icon: "🎬", zone: "project-hall" },
  { id: "skills", label: "Skills", icon: "☸️", zone: "skills-lab" },
  { id: "education", label: "Education", icon: "🎓", zone: "education" },
  { id: "journey", label: "Journey", icon: "🛤️", zone: "timeline" },
  { id: "contact", label: "Contact", icon: "✉️", zone: "mailbox" },
  { id: "workshop", label: "Workshop", icon: "🛠️" },
];

/** Where the footprints end for a section, and how close counts as arrived; null when the section isn't in the world. */
export function sectionTarget(s: Section): { to: Vec2; radius: number } | null {
  if (s.zone) {
    const z = zoneById(s.zone);
    return z ? { to: z.ring, radius: z.ringRadius } : null;
  }
  if (s.id === "workshop" && WORKSHOP_SPOT) return { to: WORKSHOP_SPOT.ring, radius: 1.6 };
  return null;
}
