// Robot buddy conversation state. Kept apart from the world store so typing,
// replies and the typewriter never re-render the Canvas tree.
import { create } from "zustand";
import type { RobotAction, RobotSuggestion, ZoneId } from "@/lib/robot";
import type { Vec2 } from "@/store/world";

export type RobotLine = { id: number; text: string; suggestions: RobotSuggestion[] };

type RobotState = {
  line: RobotLine | null;
  thinking: boolean;
  history: { role: "user" | "robot"; text: string }[];
  /** The "Yes, take me" action of the previous reply, for the brain's follow-ups. */
  lastOffer: RobotAction | undefined;
  say: (text: string, suggestions?: RobotSuggestion[]) => void;
  setThinking: (v: boolean) => void;
  pushUser: (text: string) => void;
  setLastOffer: (a: RobotAction | undefined) => void;
  hide: () => void;
};

let nextId = 1;

export const useRobot = create<RobotState>((set) => ({
  line: null,
  thinking: false,
  history: [],
  lastOffer: undefined,
  say: (text, suggestions = []) =>
    set((s) => ({
      line: { id: nextId++, text, suggestions },
      thinking: false,
      history: [...s.history, { role: "robot" as const, text }].slice(-20),
    })),
  setThinking: (thinking) => set({ thinking }),
  pushUser: (text) => set((s) => ({ history: [...s.history, { role: "user" as const, text }].slice(-20) })),
  setLastOffer: (lastOffer) => set({ lastOffer }),
  hide: () => set({ line: null }),
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
