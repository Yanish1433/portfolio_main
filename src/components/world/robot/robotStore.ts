// Robot buddy conversation state. Kept apart from the world store so typing,
// replies and the typewriter never re-render the Canvas tree.
import { create } from "zustand";
import type { RobotAction, RobotSuggestion, ZoneId } from "@/lib/robot";
import { useWorld, type Vec2 } from "@/store/world";
import { routeLine, type GuideAnchor } from "./guideRules";

export type RobotLine = { id: number; text: string; suggestions: RobotSuggestion[] };

type RobotState = {
  line: RobotLine | null;
  thinking: boolean;
  history: { role: "user" | "robot"; text: string }[];
  /** The "Yes, take me" action of the previous reply, for the brain's follow-ups. */
  lastOffer: RobotAction | undefined;
  /** The guide is open (chip clicked / H / a typed question). Closed = only the small chip shows. */
  guideOpen: boolean;
  /** Where/when the guide opened, for the walk-away rule. */
  anchor: GuideAnchor | null;
  /** Latest line said while the guide was closed (no tour): the chip pulses, opening shows it. */
  pendingTip: RobotLine | null;
  say: (text: string, suggestions?: RobotSuggestion[]) => void;
  setThinking: (v: boolean) => void;
  pushUser: (text: string) => void;
  setLastOffer: (a: RobotAction | undefined) => void;
  hide: () => void;
  openGuide: (anchor: GuideAnchor | null, line?: RobotLine | null) => void;
  closeGuide: () => void;
};

let nextId = 1;

export const useRobot = create<RobotState>((set) => ({
  line: null,
  thinking: false,
  history: [],
  lastOffer: undefined,
  guideOpen: false,
  anchor: null,
  pendingTip: null,
  say: (text, suggestions = []) =>
    set((s) => {
      const line = { id: nextId++, text, suggestions };
      const history = [...s.history, { role: "robot" as const, text }].slice(-20);
      if (routeLine({ guideOpen: s.guideOpen, tourActive: useWorld.getState().tourActive }) === "show") {
        return { line, thinking: false, history };
      }
      return { pendingTip: line, thinking: false, history };
    }),
  setThinking: (thinking) => set({ thinking }),
  pushUser: (text) => set((s) => ({ history: [...s.history, { role: "user" as const, text }].slice(-20) })),
  setLastOffer: (lastOffer) => set({ lastOffer }),
  hide: () => set({ line: null }),
  openGuide: (anchor, line) =>
    set((s) => ({ guideOpen: true, anchor: anchor ?? s.anchor, line: line ?? s.pendingTip ?? s.line, pendingTip: null })),
  closeGuide: () => set({ guideOpen: false, anchor: null, line: null, thinking: false }),
}));

/** Per-frame robot data (outside React). */
export const robotMotion = {
  /** Zone the robot is leading the avatar to, or null when it just follows. */
  leading: null as ZoneId | null,
  /** Something the robot is talking about; it looks there until `lookUntil` (seconds, performance clock). */
  lookAt: null as Vec2 | null,
  lookUntil: 0,
  /** performance.now()/1000 of the last reply (happy eyes for a moment). */
  repliedAt: 0,
};
