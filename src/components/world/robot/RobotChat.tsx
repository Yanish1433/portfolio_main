"use client";

import { useEffect, useRef, useState } from "react";
import { useWorld } from "@/store/world";
import { characterById } from "../characters";
import { LABELS } from "../nepal/labels";
import { ask, greet } from "./actions";
import { useRobot } from "./robotStore";

/** Keys drei's KeyboardControls tracks; released when the input takes focus so nothing stays "held". */
const MOVE_KEYS: [string, string][] = [
  ["ArrowUp", "ArrowUp"],
  ["ArrowDown", "ArrowDown"],
  ["ArrowLeft", "ArrowLeft"],
  ["ArrowRight", "ArrowRight"],
  ["w", "KeyW"],
  ["a", "KeyA"],
  ["s", "KeyS"],
  ["d", "KeyD"],
];
function releaseMoveKeys() {
  for (const [key, code] of MOVE_KEYS) window.dispatchEvent(new KeyboardEvent("keyup", { key, code }));
}

/** Greets once a character is chosen; later picks get a short line. */
function useGreeting() {
  useEffect(() => {
    let greeted = false;
    let timer = 0;
    const unsub = useWorld.subscribe((s, prev) => {
      if (s.spawnSeq === prev.spawnSeq || !s.character) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!greeted) {
          greeted = true;
          greet();
        } else {
          const c = characterById(useWorld.getState().character);
          useRobot.getState().say(`Nice choice! ${c ? c.label : "Your new look"} suits the square.`, [
            { label: "Show me around", message: "Show me around" },
            { label: "See the projects", message: "Show me the projects" },
          ]);
        }
      }, 1400);
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, []);
}

export default function RobotChat() {
  const ready = useWorld((s) => !!s.character && !s.pickerOpen && s.loaded);
  const tourActive = useWorld((s) => s.tourActive);
  const line = useRobot((s) => s.line);
  const thinking = useRobot((s) => s.thinking);
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useGreeting();
  // Hook for automated checks (?debug).
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("debug")) return;
    const w = window as unknown as { __robot?: unknown };
    w.__robot = useRobot;
    return () => {
      delete w.__robot;
    };
  }, []);

  const send = () => {
    const msg = text.trim();
    if (!msg || thinking) return;
    setText("");
    void ask(msg);
  };

  return (
    <>
      {/* Screen readers hear every reply once, in full. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {line ? `Robot: ${line.text}` : ""}
      </div>
      {ready && (
        <div className="pointer-events-auto flex w-full max-w-md flex-col items-center gap-2">
          {tourActive && (
            <button
              type="button"
              onClick={() => useWorld.getState().interrupt()}
              className="rounded-full border-2 border-[#c9a227] bg-[#9c3b22] px-4 py-1.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              ■ {LABELS.ui.stopTour}
            </button>
          )}
          <form
            className="flex w-full items-center gap-2 rounded-full border-2 border-[#9c3b22]/50 bg-[#fff8ec]/95 p-1.5 pl-4 shadow-xl backdrop-blur [[data-theme=dark]_&]:border-[#c9a227]/60 [[data-theme=dark]_&]:bg-[#2a1c22]/95"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#e8a33d] shadow-[0_0_8px_#ffae42]" />
            <label htmlFor="robot-chat" className="sr-only">
              Ask the robot guide
            </label>
            <input
              id="robot-chat"
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              // drei KeyboardControls listens on window: keep typing out of the world.
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Escape") input.current?.blur();
              }}
              onKeyUp={(e) => e.stopPropagation()}
              onFocus={releaseMoveKeys}
              placeholder={LABELS.robot.placeholder}
              autoComplete="off"
              enterKeyHint="send"
              maxLength={200}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] text-[#3a2419] placeholder:text-[#3a2419]/55 focus:outline-none [[data-theme=dark]_&]:text-[#f8e9cc] [[data-theme=dark]_&]:placeholder:text-[#f8e9cc]/55"
              style={{ fontFamily: "Mukta, system-ui, sans-serif" }}
            />
            <button
              type="submit"
              disabled={!text.trim() || thinking}
              className="shrink-0 rounded-full bg-[#9c3b22] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227] disabled:opacity-50"
            >
              {LABELS.robot.send}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

/** Short-lived message (e.g. "Resume coming soon"). */
export function Toast() {
  const toast = useWorld((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-30 flex justify-center px-4" role="status" aria-live="polite">
      {toast && (
        <p
          className={`rounded-full border-2 border-[#c9a227] bg-[#2a1c22]/90 px-4 py-2 text-sm font-medium text-[#f8e9cc] shadow-lg transition-opacity duration-300 ${
            visible ? "opacity-100" : "opacity-0"
          }`}
        >
          {toast.text}
        </p>
      )}
    </div>
  );
}
