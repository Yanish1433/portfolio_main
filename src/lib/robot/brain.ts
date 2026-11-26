// The local (free, offline) brain: matcher + responses + light conversation memory.

import type { Profile } from "@/content/profile";
import { analyze, buildEntityIndex, classify, detectFollowUp } from "./matcher";
import type { MatchResult, Ordinal } from "./matcher";
import { buildReply, greetReply, runOfferReply } from "./responses";
import type { Built, Focus } from "./responses";
import { mulberry32 } from "./text";
import type { LocalBrainOptions, RobotAction, RobotBrain, RobotContext, RobotReply } from "./types";

interface Memory {
  text: string;
  focus?: Focus;
  offer?: RobotAction;
}

export function createLocalBrain(profile: Profile, options: LocalBrainOptions = {}): RobotBrain {
  const index = buildEntityIndex(profile);
  const rng = mulberry32(options.seed ?? Math.floor(Math.random() * 4294967296));
  let mem: Memory = { text: "" };

  const remember = (built: Built): RobotReply => {
    mem = { text: built.reply.text, focus: built.focus, offer: built.offer };
    return built.reply;
  };

  /** The robot's last message according to the caller, if the caller keeps history. */
  const lastRobotText = (ctx?: RobotContext): string | undefined => {
    const history = ctx?.history;
    if (!history || history.length === 0) return undefined;
    for (let i = history.length - 1; i >= 0; i--) if (history[i].role === "robot") return history[i].text;
    return "";
  };

  const focusFor = (ctx?: RobotContext): Focus | undefined => {
    const last = lastRobotText(ctx);
    if (last === undefined || last === mem.text) return mem.focus;
    const lower = last.toLowerCase();
    const found = profile.projects
      .map((p, i) => ({ i, pos: lower.indexOf(p.name.toLowerCase()) }))
      .filter((x) => x.pos >= 0)
      .sort((a, b) => a.pos - b.pos);
    if (found.length >= 2) return { list: true };
    if (found.length === 1) return { projectIdx: found[0].i };
    return undefined;
  };

  const offerFor = (ctx?: RobotContext): RobotAction | undefined => {
    if (ctx?.lastOffer) return ctx.lastOffer;
    const last = lastRobotText(ctx);
    return last === undefined || last === mem.text ? mem.offer : undefined;
  };

  const resolveOrdinal = (ordinal: Ordinal, focus?: Focus): number | undefined => {
    const n = profile.projects.length;
    if (n === 0) return undefined;
    const cur = focus?.projectIdx;
    if (typeof ordinal === "number") return ordinal < n ? ordinal : undefined;
    if (ordinal === "last") return n - 1;
    if (ordinal === "next") return ((cur ?? -1) + 1) % n;
    return (((cur ?? 1) - 1) % n + n) % n;
  };

  const followMatch = (kind: "more" | "ordinal", ordinal: Ordinal | undefined, focus?: Focus): MatchResult | undefined => {
    if (kind === "more") {
      if (focus?.projectIdx !== undefined) return { intent: "project_detail", projectIdx: focus.projectIdx, variant: "more", confidence: 0.85 };
      if (focus?.list && profile.projects.length > 0) return { intent: "project_detail", projectIdx: 0, confidence: 0.8 };
      return { intent: "help", confidence: 0.6 };
    }
    if (!focus || (focus.projectIdx === undefined && !focus.list) || ordinal === undefined) return undefined;
    const idx = resolveOrdinal(ordinal, focus);
    return idx === undefined
      ? { intent: "projects_overview", confidence: 0.6 }
      : { intent: "project_detail", projectIdx: idx, confidence: 0.85 };
  };

  const respond = (message: string, ctx?: RobotContext): RobotReply => {
    const mode = ctx?.mode ?? "world";
    const base = { profile, mode, rng, currentZone: ctx?.currentZone };
    const a = analyze(String(message ?? ""), index);

    if (a.empty) return remember(buildReply({ ...base, match: { intent: "help", confidence: 1 } }));
    if (a.nonLatin || a.tokens.length === 0) {
      return remember(buildReply({ ...base, match: { intent: "fallback", confidence: 0, variant: a.nonLatin ? "language" : undefined } }));
    }

    const offer = offerFor(ctx);
    const fu = detectFollowUp(a, offer !== undefined);
    if (fu?.kind === "affirm") {
      return remember(offer ? runOfferReply(base, offer) : buildReply({ ...base, match: { intent: "affirm", confidence: 0.7 } }));
    }
    if (fu?.kind === "decline") {
      return remember(buildReply({ ...base, match: { intent: "decline", confidence: 0.8 } }));
    }

    const focus = focusFor(ctx);
    let match = classify(a);
    if ((match.intent === "fallback" || match.confidence < 0.5) && (fu?.kind === "more" || fu?.kind === "ordinal")) {
      match = followMatch(fu.kind, fu.ordinal, focus) ?? match;
    } else if (match.intent === "project_detail" && match.ordinal !== undefined && match.projectIdx === undefined) {
      const idx = resolveOrdinal(match.ordinal, focus);
      match = idx === undefined ? { intent: "projects_overview", confidence: 0.6 } : { ...match, projectIdx: idx };
    }
    return remember(buildReply({ ...base, match }));
  };

  return {
    reply: (message, ctx) => Promise.resolve().then(() => respond(message, ctx)),
    greet: (ctx) => {
      const mode = ctx?.mode ?? "world";
      return remember(greetReply({ profile, mode, rng, currentZone: ctx?.currentZone }));
    },
  };
}
