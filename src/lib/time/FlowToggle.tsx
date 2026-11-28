"use client";

// ⏸ / ▶ for the flowing day. Same pill look as the time pill; 44 px tall on touch screens.
import { useSyncExternalStore } from "react";
import { pillClass } from "@/components/book";
import { isPaused, setPaused, subscribe } from "./flow";

export default function FlowToggle({ className }: { className?: string }) {
  const paused = useSyncExternalStore(subscribe, isPaused, () => false);
  return (
    <button
      type="button"
      onClick={() => setPaused(!paused)}
      aria-pressed={paused}
      aria-label={paused ? "Resume the day cycle" : "Pause the day cycle"}
      title={paused ? "Resume the day cycle" : "Pause the day cycle"}
      className={`${pillClass("h-10 w-10 justify-center")} [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 ${className ?? ""}`}
    >
      <span aria-hidden="true">{paused ? "▶" : "⏸"}</span>
    </button>
  );
}
