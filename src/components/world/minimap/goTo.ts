// Click a zone on the map = pick it in the "Go to…" menu, then "Walk me there" (same store call, same walkTo).
import { useWorld } from "@/store/world";
import { playerPos, worldControl } from "../input";
import { arrivedAt } from "../guide/footprints";
import { sectionTarget, type Section } from "../guide/sections";

export function goToSection(s: Section) {
  const t = sectionTarget(s);
  const w = useWorld.getState();
  if (!t) return;
  if (arrivedAt(playerPos.x, playerPos.z, t.to, t.radius)) {
    w.showToast(`You're already at ${s.label}`);
    return;
  }
  w.interrupt(); // a click is visitor input: it ends a tour
  w.setGuide({ id: s.id, label: s.label, to: t.to, radius: t.radius });
  if (!worldControl.walkTo?.(t.to[0], t.to[1])) w.showToast("Can't walk from this view: leave Eagle view first");
}
