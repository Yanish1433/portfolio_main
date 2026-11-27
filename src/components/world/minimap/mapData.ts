// What the mini-map shows: clickable zone targets (the SAME list as the "Go to…" menu: guide/sections.ts) and the
// ink shapes, all read from zones.ts / the wheel layout. Nothing here is copied: change the world, the map follows.
import { SECTIONS, sectionTarget, type Section } from "../guide/sections";
import { WORKSHOP_SPOT } from "../halls/workshopLayout";
import { zoneById } from "../zones";
import { worldToMap, type MapTarget } from "./mapMath";

export type ZoneTarget = MapTarget & { section: Section; name: string };

/** Where a section's icon sits on the map: its label spot (the building), or the workshop's ring. */
function sectionAt(s: Section): [number, number] | null {
  if (s.zone) return zoneById(s.zone)?.position ?? null;
  return s.id === "workshop" && WORKSHOP_SPOT ? WORKSHOP_SPOT.ring : null;
}

export const ZONE_TARGETS: ZoneTarget[] = SECTIONS.flatMap((s) => {
  const at = sectionAt(s);
  if (!at || !sectionTarget(s)) return [];
  const [x, y] = worldToMap(at[0], at[1]);
  return [{ id: s.id, x, y, section: s, name: s.label }];
});
