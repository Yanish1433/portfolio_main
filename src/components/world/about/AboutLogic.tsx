"use client";

// Walking up to the Ghar opens its panel; walking away closes it. The robot introduces the owner
// on the first visit per session, and a hint shows on the first approach.
import { useEffect, useState } from "react";
import { profile } from "@/content/profile";
import { ABOUT_INFO, useWorld } from "@/store/world";
import { useRobot } from "../robot/robotStore";
import { zoneById } from "../zones";
import { gharHint, introLine, takeOnce } from "./aboutView";

export function AboutLogic() {
  useEffect(() => {
    return useWorld.subscribe((s, prev) => {
      if (s.activeZone === prev.activeZone) return;
      if (s.activeZone === "about") {
        if (s.infoDismissed === ABOUT_INFO.spot || !s.character) return;
        s.openInfo(ABOUT_INFO);
        if (takeOnce("ghar-met")) {
          useRobot.getState().say(introLine(profile), [
            { label: "Show me the projects", message: "Show me the projects" },
            { label: "What are the skills?", message: "What are the skills?" },
          ]);
        }
      } else if (prev.activeZone === "about") {
        if (s.info?.kind === "about") s.closeInfo(false);
        if (s.infoDismissed === ABOUT_INFO.spot) s.clearInfoDismissed();
      }
    });
  }, []);
  return null;
}

const HINT_MS = 9000;
const HINT_R = 8;

/** First approach: "This is Yanish's home. Walk in to meet him." */
export function GharHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let done = false;
    let timer = 0;
    const ring = zoneById("about")!.ring;
    const unsub = useWorld.subscribe((s) => {
      if (done || !s.character || s.pickerOpen || s.info) return;
      if (Math.hypot(s.position[0] - ring[0], s.position[1] - ring[1]) > HINT_R) return;
      done = true;
      if (!takeOnce("ghar-hint")) return;
      setShow(true);
      useWorld.getState().setGharHint(true);
      timer = window.setTimeout(() => {
        setShow(false);
        useWorld.getState().setGharHint(false);
      }, HINT_MS);
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
      useWorld.getState().setGharHint(false);
    };
  }, []);
  const hidden = useWorld((s) => !!s.cinema || !!s.info);
  const on = show && !hidden;
  // free the top-centre slot again as soon as the panel opens
  useEffect(() => {
    if (hidden) useWorld.getState().setGharHint(false);
  }, [hidden]);
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-4 transition-opacity duration-500 sm:top-4 ${on ? "opacity-100" : "opacity-0"}`}
      aria-hidden={!on}
    >
      <p className="max-w-[min(34rem,calc(100vw-32px))] rounded-2xl bg-[#5a3d33]/85 px-4 py-2 text-center text-sm text-white shadow" role="status">
        {gharHint(profile.name)}
      </p>
    </div>
  );
}
