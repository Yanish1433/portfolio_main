"use client";

// Walking up to the mailbox opens the contact form panel; walking away closes it (like AboutLogic).
import { useEffect } from "react";
import { CONTACT_INFO, useWorld } from "@/store/world";

export function ContactLogic() {
  useEffect(() => {
    return useWorld.subscribe((s, prev) => {
      if (s.activeZone === prev.activeZone) return;
      if (s.activeZone === "mailbox") {
        if (s.infoDismissed === CONTACT_INFO.spot || !s.character) return;
        s.openInfo(CONTACT_INFO);
      } else if (prev.activeZone === "mailbox") {
        if (s.info?.kind === "contact") s.closeInfo(false);
        if (s.infoDismissed === CONTACT_INFO.spot) s.clearInfoDismissed();
      }
    });
  }, []);
  return null;
}
