"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { profile } from "@/content/profile";
import { profileLeadFirst } from "@/content/lead";
import { createLocalBrain } from "@/lib/robot";
import type { RobotAction, RobotBrain, RobotContext, RobotReply } from "@/lib/robot";
import styles from "./recruiter.module.css";
import { RobotChat } from "./RobotChat";
import type { ChatTurn } from "./RobotChat";
import { scrollToHash } from "./scroll";

type History = NonNullable<RobotContext["history"]>;

/** The offer the robot just made ("Want me to jump there?") is the action behind its "Yes..." chip. */
function offerOf(reply: RobotReply): RobotAction | undefined {
  return reply.suggestions.find((s) => s.action && !s.message && /^yes/i.test(s.label))?.action;
}

/** Recruiter Mode's robot: the free offline brain, wired to page actions. */
export function RobotChatClient() {
  const brain = useRef<RobotBrain | null>(null);
  const history = useRef<History>([]);
  const lastOffer = useRef<RobotAction | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const showToast = useCallback((text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const run = useCallback(
    (action: RobotAction) => {
      switch (action.type) {
        case "openLink":
          if (action.url.startsWith("#")) scrollToHash(action.url);
          else window.open(action.url, "_blank", "noopener,noreferrer");
          break;
        case "openProject":
          scrollToHash("#projects");
          break;
        case "showResume": {
          const url = profile.links.resumeUrl;
          if (!url || url === "#") showToast("Resume coming soon.");
          else window.open(url, "_blank", "noopener,noreferrer");
          break;
        }
        default:
          // walkTo / startTour / openRecruiterMode only make sense in the 3D world.
          break;
      }
    },
    [showToast],
  );

  const toTurn = useCallback(
    (reply: RobotReply): ChatTurn => ({
      text: reply.text,
      chips: reply.suggestions.map((s) => ({
        label: s.label,
        message: s.message ?? (s.action ? undefined : s.label),
        run: s.action ? () => run(s.action as RobotAction) : undefined,
      })),
    }),
    [run],
  );

  const greet = useCallback((): ChatTurn => {
    brain.current ??= createLocalBrain(profileLeadFirst(profile));
    const reply = brain.current.greet({ mode: "recruiter" });
    history.current = [{ role: "robot", text: reply.text }];
    lastOffer.current = offerOf(reply);
    return toTurn(reply);
  }, [toTurn]);

  const ask = useCallback(
    async (message: string): Promise<ChatTurn> => {
      brain.current ??= createLocalBrain(profileLeadFirst(profile));
      const reply = await brain.current.reply(message, {
        mode: "recruiter",
        history: history.current,
        lastOffer: lastOffer.current,
      });
      history.current = [...history.current, { role: "user", text: message }, { role: "robot", text: reply.text }];
      lastOffer.current = offerOf(reply);
      reply.actions?.forEach(run);
      return toTurn(reply);
    },
    [run, toTurn],
  );

  return (
    <>
      <RobotChat greet={greet} ask={ask} />
      <p className={styles.toast} role="status">
        {toast}
      </p>
    </>
  );
}
