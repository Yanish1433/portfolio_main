// Answers: every reply is built from profile data. Nothing about the owner is hard-coded here.
// Voice: friendly, short (about two sentences), then suggestions. No pronouns for the owner: name only.

import type { Profile } from "@/content/profile";
import { eduSentence, expPeriod, sortedEducation } from "./journey";
import type { MatchResult, TechEntity } from "./matcher";
import type {
  IntentId,
  RobotAction,
  RobotMode,
  RobotReply,
  RobotSuggestion,
  ZoneId,
} from "./types";

export const ZONE_LABEL: Record<ZoneId, string> = {
  plaza: "the Plaza",
  "project-hall": "the Project Hall",
  education: "the Education Zone",
  "skills-lab": "the Skills Lab",
  timeline: "the Timeline",
  about: "the Ghar (the About house)",
  mailbox: "the Mailbox",
  kiosk: "the Kiosk",
};

/** Where each zone lives on the recruiter page. Edit here if the recruiter page uses other anchors. */
export const RECRUITER_ANCHORS: Record<ZoneId, { url: string; label: string }> = {
  plaza: { url: "#top", label: "Top of the page" },
  "project-hall": { url: "#projects", label: "Projects" },
  education: { url: "#journey", label: "Education" },
  "skills-lab": { url: "#skills", label: "Skills" },
  timeline: { url: "#journey", label: "Experience" },
  about: { url: "#about", label: "About" },
  mailbox: { url: "#contact", label: "Contact" },
  kiosk: { url: "#contact", label: "Contact" },
};

export interface Focus {
  /** Index into profile.projects the conversation is about. */
  projectIdx?: number;
  /** The last reply listed all projects. */
  list?: boolean;
}

export interface Built {
  reply: RobotReply;
  /** The action the reply offered ("Want me to walk you there?"), so a later "yes" can run it. */
  offer?: RobotAction;
  focus?: Focus;
}

export interface BuildInput {
  profile: Profile;
  mode: RobotMode;
  rng: () => number;
  match: MatchResult;
  currentZone?: ZoneId;
}

/* ------------------------------------------------------------------ helpers */

const pick = <T>(rng: () => number, items: readonly T[]): T => items[Math.floor(rng() * items.length) % items.length];

const sentence = (s: string): string => {
  const t = s.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
};

const firstName = (p: Profile): string => p.name.trim().split(/\s+/)[0] || p.name;

function joinList(items: string[], conj = "and"): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ${conj} ${items[items.length - 1]}`;
}

const isRealUrl = (u: string | null | undefined): u is string => !!u && u.trim() !== "" && u.trim() !== "#";

const msg = (label: string, message: string): RobotSuggestion => ({ label, message });
const act = (label: string, action: RobotAction): RobotSuggestion => ({ label, action });

function zoneAction(zone: ZoneId, mode: RobotMode): RobotAction {
  if (mode === "world") return { type: "walkTo", zone };
  const anchor = RECRUITER_ANCHORS[zone];
  return { type: "openLink", url: anchor.url, label: anchor.label };
}

function goSuggestion(zone: ZoneId, mode: RobotMode): RobotSuggestion {
  return mode === "world"
    ? act(`Take me to ${ZONE_LABEL[zone]}`, zoneAction(zone, mode))
    : act(`Jump to ${RECRUITER_ANCHORS[zone].label.toLowerCase()}`, zoneAction(zone, mode));
}

function offerQuestion(rng: () => number, mode: RobotMode): string {
  return mode === "world"
    ? pick(rng, ["Want me to walk you there?", "Shall I take you there?", "Want to go and have a look?"])
    : pick(rng, ["Want me to jump to that section?", "Shall I scroll you there?"]);
}

function yesOffer(zone: ZoneId, mode: RobotMode): RobotSuggestion {
  return act(mode === "world" ? "Yes, take me" : "Yes, jump there", zoneAction(zone, mode));
}

function levelWords(level: number): string {
  if (level >= 85) return "one of the strongest skills";
  if (level >= 75) return "comfortable and confident";
  if (level >= 60) return "solid working knowledge";
  if (level >= 40) return "still growing there";
  return "just getting started";
}

function currentJob(p: Profile): { role: string; company: string } | undefined {
  const job = p.experience.find((e) => /present|current|now/i.test(e.end)) ?? undefined;
  return job ? { role: job.role, company: job.company } : undefined;
}

function projectLinkSuggestions(p: Profile, idx: number): RobotSuggestion[] {
  const proj = p.projects[idx];
  const out: RobotSuggestion[] = [];
  if (isRealUrl(proj.liveUrl)) out.push(act(`${proj.name}: live demo`, { type: "openLink", url: proj.liveUrl, label: `${proj.name} live demo` }));
  if (isRealUrl(proj.repoUrl)) out.push(act(`${proj.name}: source code`, { type: "openLink", url: proj.repoUrl, label: `${proj.name} source` }));
  if (isRealUrl(proj.caseStudyUrl)) out.push(act(`${proj.name}: case study`, { type: "openLink", url: proj.caseStudyUrl, label: `${proj.name} case study` }));
  return out;
}

/** Suggestions used to pad a reply to at least two, so there is never a dead end. */
function defaultSuggestions(p: Profile, mode: RobotMode): RobotSuggestion[] {
  const list: RobotSuggestion[] = [
    msg("Show me the projects", "Show me the projects"),
    msg("What are the skills?", "What are the skills?"),
    msg("Where did they study?", "Where did you study?"),
    msg("How can I get in touch?", "How can I contact you?"),
    act("Show me the resume", { type: "showResume" }),
  ];
  if (mode === "world") list.splice(2, 0, msg("Show me around", "Show me around"));
  return list;
}

/* ------------------------------------------------------------------ builders */

type Parts = Omit<Built, "reply"> & { text: string; suggestions: RobotSuggestion[]; actions?: RobotAction[] };

function build(input: BuildInput): Parts {
  const { profile: p, mode, rng, match, currentZone } = input;
  const F = firstName(p);
  const world = mode === "world";
  const intent: IntentId = match.intent;
  const defaults = defaultSuggestions(p, mode);

  switch (intent) {
    case "greeting": {
      const text = pick(rng, [
        `Hi there! I'm ${F}'s robot buddy. What would you like to explore?`,
        `Hello! I know ${F}'s portfolio inside out, so ask me anything.`,
        `Hey, welcome in! I can show you ${F}'s projects, skills and more.`,
      ]);
      return {
        text,
        suggestions: world
          ? [msg("See the projects", "Show me the projects"), msg("What are the skills?", "What are the skills?"), msg("Show me around", "Show me around"), msg("Who are you?", "Who are you?")]
          : [msg("See the projects", "Show me the projects"), msg("What are the skills?", "What are the skills?"), act("Show me the resume", { type: "showResume" }), msg("How can I get in touch?", "How can I contact you?")],
      };
    }

    case "who_are_you":
      return {
        text: pick(rng, [
          `I'm ${F}'s robot buddy, a little helper who knows this whole portfolio. I don't use any cloud AI, I just match your question to what's here.`,
          `Beep boop! I'm the portfolio robot. Ask me about ${F}'s projects, skills or background.`,
          `I'm ${F}'s guide bot. I answer straight from the portfolio, so I won't make things up.`,
        ]),
        suggestions: [msg("What can you do?", "What can you do?"), msg(`Who is ${F}?`, `Who is ${F}?`), msg("Show me the projects", "Show me the projects"), world ? msg("Show me around", "Show me around") : act("Show me the resume", { type: "showResume" })],
      };

    case "about_owner": {
      const intro = pick(rng, [
        `${p.name} is a ${p.title}. ${sentence(p.tagline)}`,
        `Meet ${F}: ${p.title}. ${sentence(p.tagline)}`,
        sentence(p.summary.split(/(?<=\.)\s/)[0] ?? p.summary),
      ]);
      if (world) {
        // In the world the answer is a walk to the About house (the Ghar), where the full story is.
        return {
          text: `${intro} ${pick(rng, ["Follow me to the Ghar for the full story!", "Let's walk to the Ghar, the About house, for the full story!"])}`,
          suggestions: [msg("Show me the projects", "Show me the projects"), msg("What are the skills?", "What are the skills?"), msg("Work experience?", "Tell me about the work experience"), act("Show me the resume", { type: "showResume" })],
          actions: [zoneAction("about", mode)],
        };
      }
      return {
        text: intro,
        suggestions: [act("Read the About section", zoneAction("about", mode)), msg("Show me the projects", "Show me the projects"), msg("What are the skills?", "What are the skills?"), act("Show me the resume", { type: "showResume" })],
      };
    }

    case "projects_overview": {
      if (p.projects.length === 0) {
        return { text: `No projects are listed yet, but ${F}'s resume and contact details are here.`, suggestions: defaults.slice(1, 4) };
      }
      const names = p.projects.map((x) => x.name);
      const shown = names.slice(0, 4);
      const list = joinList(shown) + (names.length > shown.length ? " and more" : "");
      const text = pick(rng, [
        `${F} has built ${names.length} ${names.length === 1 ? "project" : "projects"}: ${list}. Which one sounds interesting?`,
        `Here are ${F}'s projects: ${list}. Pick one and I'll tell you more!`,
        `${names.length} ${names.length === 1 ? "project" : "projects"} so far: ${list}. Want details on any?`,
      ]);
      const suggestions = p.projects.slice(0, 3).map((x) => msg(x.name, `Tell me about ${x.name}`));
      suggestions.push(goSuggestion("project-hall", mode));
      // "show me / take me to the projects": lead the visitor there (walk in the world, #projects link in recruiter mode).
      const actions = match.go ? [zoneAction("project-hall", mode)] : undefined;
      return { text, suggestions, focus: { list: true }, ...(actions ? { actions } : {}) };
    }

    case "project_detail": {
      const idx = match.projectIdx ?? 0;
      const proj = p.projects[idx];
      if (!proj) return { text: `I can't find that project, but here's the full list.`, suggestions: [msg("Show me the projects", "Show me the projects"), ...defaults.slice(1, 3)] };
      const next = p.projects.length > 1 ? p.projects[(idx + 1) % p.projects.length] : undefined;
      const openCard = act(`Open ${proj.name}`, { type: "openProject", projectId: proj.id });
      const nextSug = next ? msg(`Next: ${next.name}`, `Tell me about ${next.name}`) : msg("All projects", "Show me the projects");
      const focus: Focus = { projectIdx: idx };
      // "show me / take me to <project>": walk to its stand and open it (world only; recruiter mode just answers).
      const go = match.go && world ? { actions: [{ type: "openProject" as const, projectId: proj.id }] } : {};

      if (match.variant === "stack") {
        const text = `${proj.name} is built with ${joinList(proj.stack)}.${proj.highlights[0] ? ` Highlight: ${sentence(proj.highlights[0])}` : ""}`;
        return { text, suggestions: [msg("More details", `Tell me more about ${proj.name}`), openCard, nextSug, msg("All projects", "Show me the projects")], focus, ...go };
      }
      if (match.variant === "links") {
        const links = projectLinkSuggestions(p, idx);
        const text = links.length
          ? `Here are the links for ${proj.name}. Tap one to open it.`
          : `${proj.name} has no public links listed yet. I can still tell you what it does.`;
        return { text, suggestions: [...links, msg("What's it built with?", `What is ${proj.name} built with?`), openCard, nextSug].slice(0, 4), focus, ...go };
      }
      if (match.variant === "more") {
        const text = pick(rng, [
          `What makes ${proj.name} interesting: ${joinList(proj.highlights)}. ${sentence(proj.problem)}`,
          `${proj.name} highlights: ${joinList(proj.highlights)}. It was built because: ${proj.problem}`,
        ]);
        return { text, suggestions: [msg("What's it built with?", `What is ${proj.name} built with?`), openCard, nextSug, msg("All projects", "Show me the projects")], focus, ...go };
      }
      const text = pick(rng, [
        `${proj.name}: ${sentence(proj.tagline)} ${sentence(proj.description)}`,
        `Say hello to ${proj.name}! ${sentence(proj.description)}`,
        `${proj.name} (${proj.tagline}). The problem it solves: ${sentence(proj.problem)}`,
      ]);
      const suggestions = [msg("What's it built with?", `What is ${proj.name} built with?`), msg("Tell me more", `Tell me more about ${proj.name}`), openCard, nextSug];
      return { text, suggestions, focus, ...go };
    }

    case "skills_overview": {
      const groups = p.skills.filter((g) => g.skills.length > 0);
      if (groups.length === 0) return { text: `No skills are listed yet, but the projects show what ${F} can build.`, suggestions: defaults.slice(0, 3) };
      if (match.groupIdx !== undefined && p.skills[match.groupIdx]) {
        const g = p.skills[match.groupIdx];
        const names = g.skills.map((s) => s.name);
        const best = [...g.skills].sort((a, b) => b.level - a.level)[0];
        return {
          text: `In ${g.label}, ${F} works with ${joinList(names)}. Strongest here: ${best.name}.`,
          suggestions: [msg(`Do you know ${best.name}?`, `Do you know ${best.name}?`), msg("All the skills", "What are the skills?"), msg("Show me the projects", "Show me the projects"), goSuggestion("skills-lab", mode)],
        };
      }
      const all = groups.flatMap((g) => g.skills);
      const top = [...all].sort((a, b) => b.level - a.level).slice(0, 4).map((s) => s.name);
      const labels = joinList(groups.map((g) => g.label));
      const text = pick(rng, [
        `${F} works across ${labels}. Strongest right now: ${joinList(top)}. ${offerQuestion(rng, mode)}`,
        `Skills cover ${labels}, with ${joinList(top)} leading the way. ${offerQuestion(rng, mode)}`,
      ]);
      return {
        text,
        suggestions: [yesOffer("skills-lab", mode), msg(`Do you know ${top[0]}?`, `Do you know ${top[0]}?`), msg("Show me the projects", "Show me the projects"), act("Show me the resume", { type: "showResume" })],
        offer: zoneAction("skills-lab", mode),
      };
    }

    case "skill_check": {
      const techs: TechEntity[] = (match.techs ?? []).slice(0, 3);
      const owned = techs.filter((t) => t.owned);
      const other = techs.filter((t) => !t.owned);
      const projectIdxs = [...new Set(techs.flatMap((t) => t.projectIdxs))];
      const projNames = projectIdxs.map((i) => p.projects[i]?.name).filter((n): n is string => !!n);
      const parts: string[] = [];
      if (owned.length === 1) {
        parts.push(`Yes! ${F} works with ${owned[0].name}, and it's ${levelWords(owned[0].level ?? 0)}.`);
      } else if (owned.length > 1) {
        parts.push(`Yes! ${F} works with ${joinList(owned.map((t) => `${t.name} (${levelWords(t.level ?? 0)})`))}.`);
      }
      for (const t of other) {
        const used = t.projectIdxs.map((i) => p.projects[i]?.name).filter((n): n is string => !!n);
        parts.push(
          used.length
            ? `${t.name} isn't on ${F}'s main skills list, but it's part of the stack in ${joinList(used)}.`
            : `I don't see ${t.name} on ${F}'s skills list, so I won't claim it.`,
        );
      }
      if (owned.length > 0 && projNames.length > 0) parts.push(`You can see it in ${joinList(projNames)}.`);
      const text = parts.slice(0, 3).join(" ");
      const suggestions: RobotSuggestion[] = [];
      const firstProj = projectIdxs[0];
      if (firstProj !== undefined) suggestions.push(msg(`See ${p.projects[firstProj].name}`, `Tell me about ${p.projects[firstProj].name}`));
      suggestions.push(msg("All the skills", "What are the skills?"));
      suggestions.push(msg("Show me the projects", "Show me the projects"));
      suggestions.push(goSuggestion("skills-lab", mode));
      return { text, suggestions };
    }

    case "education": {
      if (p.education.length === 0) return { text: `No education details are listed yet.`, suggestions: defaults.slice(0, 3) };
      const order = sortedEducation(p.education);
      const asked = match.schoolIdxs?.length ? match.schoolIdxs.map((i) => p.education[i]).filter(Boolean) : [];
      const list = asked.length ? asked : order;
      const parts = list.slice(0, 4).map((e) => eduSentence(e));
      // "<Name> is currently studying at X" reads as its own clause; the rest follow as "and earlier: ..."
      const now = parts.find((t) => t.startsWith("is currently"));
      const rest = parts.filter((t) => t !== now);
      const body = now
        ? rest.length
          ? `${F} ${now}. Earlier: ${joinList(rest)}.`
          : `${F} ${now}.`
        : pick(rng, [`${F} studied ${joinList(rest)}.`, `On the education side: ${joinList(rest)}.`]);
      const suggestions: RobotSuggestion[] = [yesOffer("education", mode)];
      if (p.certificates.length) suggestions.push(msg("Any certificates?", "Any certificates?"));
      if (p.courses.length) suggestions.push(msg("Any courses?", "Which courses were taken?"));
      suggestions.push(msg("Show me the projects", "Show me the projects"));
      return { text: `${body} ${offerQuestion(rng, mode)}`, suggestions, offer: zoneAction("education", mode) };
    }

    case "certificates": {
      if (p.certificates.length === 0) return { text: `No certificates are listed yet.`, suggestions: defaults.slice(0, 3) };
      const ids = match.certIdxs?.length ? match.certIdxs : p.certificates.map((_, i) => i);
      const list = ids.slice(0, 3).map((i) => `${p.certificates[i].name} (${p.certificates[i].issuer}, ${p.certificates[i].year})`);
      const text = `${F} has earned ${p.certificates.length} ${p.certificates.length === 1 ? "certificate" : "certificates"}: ${joinList(list)}. ${offerQuestion(rng, mode)}`;
      const linked = p.certificates[ids[0]];
      const suggestions: RobotSuggestion[] = [yesOffer("education", mode)];
      if (isRealUrl(linked.url)) suggestions.push(act(`Open ${linked.name}`, { type: "openLink", url: linked.url, label: linked.name }));
      if (p.courses.length) suggestions.push(msg("Which courses?", "Which courses were taken?"));
      suggestions.push(msg("Where did they study?", "Where did you study?"));
      return { text, suggestions, offer: zoneAction("education", mode) };
    }

    case "courses": {
      if (p.courses.length === 0) return { text: `No courses are listed yet.`, suggestions: defaults.slice(0, 3) };
      const ids = match.courseIdxs?.length ? match.courseIdxs : p.courses.map((_, i) => i);
      const list = ids.slice(0, 3).map((i) => `${p.courses[i].name} (${p.courses[i].provider})`);
      const text = `${F} has taken ${p.courses.length} ${p.courses.length === 1 ? "course" : "courses"}: ${joinList(list)}. ${offerQuestion(rng, mode)}`;
      return {
        text,
        suggestions: [yesOffer("education", mode), ...(p.certificates.length ? [msg("Any certificates?", "Any certificates?")] : []), msg("Where did they study?", "Where did you study?")],
        offer: zoneAction("education", mode),
      };
    }

    case "experience": {
      if (p.experience.length === 0) {
        const recent = p.projects.slice(0, 2).map((x) => x.name);
        const work = recent.length ? ` Recent work is ${joinList(recent)}, built as projects.` : "";
        return {
          text: `No jobs are listed yet.${work} ${world ? "I can walk you along the path of milestones if you like." : "The journey section shows the path so far."}`,
          suggestions: [yesOffer("timeline", mode), msg("Show me the projects", "Show me the projects"), msg("How can I contact you?", "How can I contact you?")],
          offer: zoneAction("timeline", mode),
        };
      }
      const ids = match.companyIdxs?.length ? match.companyIdxs : p.experience.map((_, i) => i);
      const parts = ids.slice(0, 3).map((i) => {
        const e = p.experience[i];
        const yrs = expPeriod(e);
        return `${e.role} at ${e.company}${yrs ? ` (${yrs})` : ""}`;
      });
      const text = pick(rng, [
        `Work history: ${joinList(parts)}. ${offerQuestion(rng, mode)}`,
        `${F}'s experience includes ${joinList(parts)}. ${offerQuestion(rng, mode)}`,
      ]);
      return {
        text,
        suggestions: [yesOffer("timeline", mode), msg("Show me the projects", "Show me the projects"), msg("What are the skills?", "What are the skills?")],
        offer: zoneAction("timeline", mode),
      };
    }

    case "contact": {
      const links: RobotSuggestion[] = [];
      if (p.links.email.includes("@")) links.push(act("Email", { type: "openLink", url: `mailto:${p.links.email}`, label: "Email" }));
      if (isRealUrl(p.links.github)) links.push(act("GitHub", { type: "openLink", url: p.links.github, label: "GitHub" }));
      if (isRealUrl(p.links.linkedin)) links.push(act("LinkedIn", { type: "openLink", url: p.links.linkedin, label: "LinkedIn" }));
      if (links.length > 0) {
        const mail = p.links.email.includes("@") ? ` The quickest way is email: ${p.links.email}.` : "";
        return { text: `You can reach ${F} online, and the links are below.${mail}`, suggestions: [...links, goSuggestion("mailbox", mode)].slice(0, 4) };
      }
      return {
        text: pick(rng, [
          `${F}'s contact details live at the Contact spot. ${offerQuestion(rng, mode)}`,
          `The contact links are in the Contact section. ${offerQuestion(rng, mode)}`,
        ]),
        suggestions: [yesOffer("mailbox", mode), act("Show me the resume", { type: "showResume" }), msg("Show me the projects", "Show me the projects")],
        offer: zoneAction("mailbox", mode),
      };
    }

    case "resume":
      return {
        text: pick(rng, [`Sure, here's ${F}'s resume!`, `Opening the resume for you now.`, `Of course! Here's the resume.`]),
        actions: [{ type: "showResume" }],
        suggestions: [msg("Show me the projects", "Show me the projects"), msg("How can I contact you?", "How can I contact you?"), msg("What are the skills?", "What are the skills?")],
      };

    case "hire_availability": {
      const job = currentJob(p);
      const base = job
        ? `${F} is currently working as ${job.role} at ${job.company}.`
        : `I don't have availability details, so I won't guess.`;
      return {
        text: `${base} For opportunities, the best way is to get in touch directly.`,
        suggestions: [msg("How can I contact you?", "How can I contact you?"), act("Show me the resume", { type: "showResume" }), msg("Show me the projects", "Show me the projects"), msg("What are the skills?", "What are the skills?")],
      };
    }

    case "location":
      return {
        text: `${F} is based in ${p.location}. I don't have more detail than that, so reaching out is best for anything else.`,
        suggestions: [msg("How can I contact you?", "How can I contact you?"), msg("Work experience?", "Tell me about the work experience"), msg("Show me the projects", "Show me the projects")],
      };

    case "tour": {
      if (world) {
        return {
          text: pick(rng, [`Let's go! Just follow me and I'll show you around.`, `Great idea! Follow me, I'll walk you through the highlights.`]),
          actions: [{ type: "startTour" }],
          suggestions: [msg("Skip it: show the projects", "Show me the projects"), msg("I'm in a hurry", "I'm in a hurry"), msg("What are the skills?", "What are the skills?")],
        };
      }
      return {
        text: `Quick tour: jump straight to projects, skills, education or contact.`,
        suggestions: [
          act("Projects", zoneAction("project-hall", mode)),
          act("Skills", zoneAction("skills-lab", mode)),
          act("Education", zoneAction("education", mode)),
          act("Contact", zoneAction("mailbox", mode)),
        ],
      };
    }

    case "navigate": {
      const zone = match.zone;
      if (!zone) {
        return {
          text: world ? `Where to? I can take you to the Project Hall, Education Zone, Skills Lab or Mailbox.` : `Where to? I can jump to projects, skills, education or contact.`,
          suggestions: [goSuggestion("project-hall", mode), goSuggestion("education", mode), goSuggestion("skills-lab", mode), goSuggestion("mailbox", mode)],
        };
      }
      const action = zoneAction(zone, mode);
      const others = (["project-hall", "skills-lab", "education", "mailbox"] as ZoneId[]).filter((z) => z !== zone).slice(0, 3);
      if (world && currentZone === zone) {
        return { text: `We're already in ${ZONE_LABEL[zone]}! Look around, or I can take you somewhere else.`, suggestions: others.map((z) => goSuggestion(z, mode)) };
      }
      const text = world
        ? pick(rng, [`On our way to ${ZONE_LABEL[zone]}! Follow me!`, `Follow me! Heading to ${ZONE_LABEL[zone]}.`, `Let's go to ${ZONE_LABEL[zone]}!`])
        : pick(rng, [`Jumping to ${RECRUITER_ANCHORS[zone].label.toLowerCase()}.`, `Scrolling to ${RECRUITER_ANCHORS[zone].label.toLowerCase()} for you.`]);
      return { text, actions: [action], suggestions: others.map((z) => goSuggestion(z, mode)) };
    }

    case "recruiter_mode": {
      if (!world) {
        return {
          text: `You're already in the quick view, so everything is one scroll away.`,
          suggestions: [act("Show me the resume", { type: "showResume" }), act("Projects", zoneAction("project-hall", mode)), act("Contact", zoneAction("mailbox", mode))],
        };
      }
      return {
        text: pick(rng, [`Got it, switching to the quick view!`, `No problem, here's the fast version.`]),
        actions: [{ type: "openRecruiterMode" }],
        suggestions: [act("Show me the resume", { type: "showResume" }), msg("Show me the projects", "Show me the projects"), msg("How can I contact you?", "How can I contact you?")],
      };
    }

    case "thanks":
      return {
        text: pick(rng, [`Anytime!`, `You're welcome!`, `Happy to help!`]) + ` Anything else you'd like to see?`,
        suggestions: [msg("Show me the projects", "Show me the projects"), act("Show me the resume", { type: "showResume" }), msg("How can I contact you?", "How can I contact you?")],
      };

    case "goodbye":
      return {
        text: pick(rng, [`Bye for now! Thanks for visiting ${F}'s portfolio.`, `See you! Come back any time.`, `Take care! It was nice chatting.`]),
        suggestions: [act("Show me the resume", { type: "showResume" }), msg("How can I contact you?", "How can I contact you?")],
      };

    case "joke":
      return {
        text: pick(rng, [
          `Why do programmers prefer dark mode? Because light attracts bugs!`,
          `A SQL query walks into a bar, walks up to two tables and asks: "Can I join you?"`,
          `There are 10 kinds of people: those who understand binary and those who don't.`,
          `I would tell you a UDP joke, but you might not get it.`,
          `It works on my machine! Let's ship the machine.`,
        ]),
        suggestions: [msg("Another joke", "Tell me another joke"), msg("Show me the projects", "Show me the projects"), msg("What can you do?", "What can you do?")],
      };

    case "help":
      return {
        text: world
          ? `I can tell you about ${F}'s projects, skills, education and experience, or walk you around the world. Just ask, or tap a suggestion!`
          : `I can answer questions about ${F}'s projects, skills, education and experience, or jump you to a section. Just ask, or tap a suggestion!`,
        suggestions: [msg("Show me the projects", "Show me the projects"), msg("What are the skills?", "What are the skills?"), msg("Where did they study?", "Where did you study?"), msg("How can I contact you?", "How can I contact you?")],
      };

    case "affirm":
      return { text: `Great! What would you like to see?`, suggestions: defaults.slice(0, 4) };

    case "decline":
      return { text: `No problem! Tell me if you'd like to see anything else.`, suggestions: defaults.slice(0, 3) };

    case "fallback":
    default: {
      if (match.variant === "language") {
        return {
          text: `Sorry, I only understand English for now. I can still show you ${F}'s work if you tap a suggestion!`,
          suggestions: [msg("Show me the projects", "Show me the projects"), msg("What are the skills?", "What are the skills?"), msg("How can I contact you?", "How can I contact you?"), act("Show me the resume", { type: "showResume" })],
        };
      }
      return {
        text: pick(rng, [
          `Hmm, I'm not sure I got that, and I'd rather not guess. Try one of these, or the resume has the full story.`,
          `I'm not certain what you mean, and I don't want to make something up. These might help, or check the resume.`,
        ]),
        suggestions: [msg("Show me the projects", "Show me the projects"), msg("What are the skills?", "What are the skills?"), msg("How can I contact you?", "How can I contact you?"), act("Show me the resume", { type: "showResume" })],
      };
    }
  }
}

/* ------------------------------------------------------------------ public */

/** Make sure a reply never contains world-only actions in recruiter mode (suggestions included). */
export function adaptAction(action: RobotAction, mode: RobotMode): RobotAction {
  if (mode === "world") return action;
  if (action.type === "walkTo") return zoneAction(action.zone, "recruiter");
  if (action.type === "startTour") return zoneAction("project-hall", "recruiter");
  return action;
}

function finish(parts: Parts, intent: IntentId, confidence: number, mode: RobotMode, p: Profile): Built {
  const seen = new Set<string>();
  const unique = (list: RobotSuggestion[]): RobotSuggestion[] =>
    list.filter((s) => {
      const key = s.label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  // No resume download on this site unless links.resumeUrl is real (captain's decision): drop those chips everywhere.
  const resumeOk = isRealUrl(p.links.resumeUrl);
  const chipOk = (s: RobotSuggestion) => resumeOk || s.action?.type !== "showResume";
  let suggestions = unique(
    parts.suggestions.filter(chipOk).map((s) => (s.action ? { ...s, action: adaptAction(s.action, mode) } : s)),
  );
  if (mode === "recruiter") {
    suggestions = suggestions.filter((s) => s.action?.type !== "openRecruiterMode");
  }
  for (const extra of defaultSuggestions(p, mode).filter(chipOk)) {
    if (suggestions.length >= 2) break;
    suggestions = [...suggestions, ...unique([extra])];
  }
  suggestions = suggestions.slice(0, 4);

  const actions = parts.actions?.map((a) => adaptAction(a, mode));
  const reply: RobotReply = {
    text: parts.text,
    suggestions,
    intent,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
  if (actions && actions.length > 0) reply.actions = actions;
  return { reply, offer: parts.offer ? adaptAction(parts.offer, mode) : undefined, focus: parts.focus };
}

export function buildReply(input: BuildInput): Built {
  const parts = build(input);
  return finish(parts, input.match.intent, input.match.confidence, input.mode, input.profile);
}

/** The reply that acknowledges an offered action the visitor said yes to. */
export function runOfferReply(input: Omit<BuildInput, "match">, offer: RobotAction): Built {
  const { profile: p, mode, rng } = input;
  const action = adaptAction(offer, mode);
  let text: string;
  switch (action.type) {
    case "walkTo":
      text = pick(rng, [`Follow me!`, `This way! Follow me!`, `On it! Follow me.`]);
      break;
    case "startTour":
      text = `Let's go! I'll show you around.`;
      break;
    case "openProject":
      text = `Opening it up!`;
      break;
    case "showResume":
      text = `Here's the resume!`;
      break;
    case "openRecruiterMode":
      text = `Switching to the quick view!`;
      break;
    default:
      text = `Sure, opening ${action.label}.`;
  }
  const parts: Parts = { text, actions: [action], suggestions: defaultSuggestions(p, mode).slice(0, 4) };
  return finish(parts, "affirm", 0.9, mode, p);
}

export function greetReply(input: Omit<BuildInput, "match">): Built {
  return buildReply({ ...input, match: { intent: "greeting", confidence: 1 } });
}
