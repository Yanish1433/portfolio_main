// Tap the house / press E: walk to the Ghar's doormat; the panel opens on arrival (AboutLogic).
import { ABOUT_INFO, useWorld } from "@/store/world";
import { zoneById } from "../zones";
import { playerPos, worldControl } from "../input";

export function visitGhar() {
  const z = zoneById("about");
  const w = useWorld.getState();
  if (!z) return;
  if (Math.hypot(playerPos.x - z.ring[0], playerPos.z - z.ring[1]) < z.ringRadius) {
    w.clearInfoDismissed();
    w.openInfo(ABOUT_INFO);
    return;
  }
  w.clearInfoDismissed();
  worldControl.walkTo?.(z.ring[0], z.ring[1]);
}
