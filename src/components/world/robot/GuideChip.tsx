"use client";

import { chipClass } from "../ui/book";
import { useRobot } from "./robotStore";
import { openGuideNow } from "./actions";

/** The small default state of the robot guide: one tap opens the guide. A dot pulses when it has a tip. */
export default function GuideChip({ className = "" }: { className?: string }) {
  const hasTip = useRobot((s) => !!s.pendingTip);
  return (
    <button
      type="button"
      data-robot-guide
      aria-label="Click me for a guide (H)"
      onClick={() => openGuideNow()}
      className={chipClass(`pointer-events-auto relative cursor-pointer !min-h-0 !max-h-10 !px-3 !py-1 text-[13px] leading-tight ${className}`)}
      style={{ fontFamily: "Mukta, system-ui, sans-serif" }}
    >
      <span aria-hidden="true">🤖 </span>Click me for a guide
      {hasTip && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-[#e8a33d] shadow-[0_0_6px_#ffae42]"
        />
      )}
    </button>
  );
}
