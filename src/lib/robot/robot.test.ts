// Robot engine tests. Run (no extra packages):
//   node --no-warnings --import ./scripts/ts-resolve.mjs --test "src/lib/robot/**/*.test.ts"
// Tests check intent, action shape and suggestion count, never exact wording.

import assert from "node:assert/strict";
import { test } from "node:test";
import { profile as liveProfile } from "@/content/profile";
import type { Profile } from "@/content/profile";
import { FIXTURE_CERTIFICATES, FIXTURE_COURSES, FIXTURE_EDUCATION, FIXTURE_EXPERIENCE, FIXTURE_PROJECTS, FIXTURE_REAL_EDUCATION } from "./test-fixtures";
import { FALLBACK_THRESHOLD, ZONE_IDS, ZONE_LABEL, createLocalBrain } from "./index";
import type { RobotAction, RobotContext, RobotMode, RobotReply } from "./index";
import { INTENTS } from "./intents";
import { STOPWORDS, damerauLevenshtein, fuzzyMatch, normalize } from "./text";

// The robot is tested against fixed content, so editing the real content never breaks these tests.
const profile: Profile = {
  ...liveProfile,
  projects: FIXTURE_PROJECTS,
  education: FIXTURE_EDUCATION,
  certificates: FIXTURE_CERTIFICATES,
  courses: FIXTURE_COURSES,
  experience: FIXTURE_EXPERIENCE,
};
/** The captain's real shape today: current study + three schools, no jobs, certificates or courses. */
const realShape: Profile = { ...profile, education: FIXTURE_REAL_EDUCATION, certificates: [], courses: [], experience: [] };

const SEED = 7;
const world: RobotContext = { mode: "world" };
const recruiter: RobotContext = { mode: "recruiter" };

const ask = (message: string, ctx: RobotContext = world, p: Profile = profile): Promise<RobotReply> =>
  createLocalBrain(p, { seed: SEED }).reply(message, ctx);

/** A profile with real URLs so link suggestions can be exercised. */
const livePlaceholder: Profile = {
  ...profile,
  links: { github: "https://github.com/example", linkedin: "https://linkedin.com/in/example", email: "me@example.com", resumeUrl: "https://example.com/cv.pdf" },
  projects: profile.projects.map((p) => ({ ...p, liveUrl: "https://example.com/live", repoUrl: "https://example.com/repo" })),
};

function allActions(r: RobotReply): RobotAction[] {
  return [...(r.actions ?? []), ...r.suggestions.flatMap((s) => (s.action ? [s.action] : []))];
}

function assertShape(r: RobotReply, label: string): void {
  assert.ok(r.text.length > 0, `${label}: text`);
  assert.ok(r.suggestions.length >= 2 && r.suggestions.length <= 4, `${label}: ${r.suggestions.length} suggestions`);
  assert.ok(r.confidence >= 0 && r.confidence <= 1, `${label}: confidence ${r.confidence}`);
  for (const s of r.suggestions) assert.ok(s.label && (s.message || s.action), `${label}: suggestion needs message or action`);
}

/* ------------------------------------------------------------------ single-turn table */

const TABLE: [message: string, intent: string][] = [
  ["hi", "greeting"],
  ["HELLO!!", "greeting"],
  ["heyyy", "greeting"],
  ["who are you?", "who_are_you"],
  ["are you a robot", "who_are_you"],
  ["who is yanish", "about_owner"],
  ["tell me about yanish", "about_owner"],
  ["show me your projects", "projects_overview"],
  ["wat proj did u build", "projects_overview"],
  ["PROJECTS??", "projects_overview"],
  ["projcts", "projects_overview"],
  ["tell me about RepoGuide", "project_detail"],
  ["what is syncboard built with", "project_detail"],
  ["book easy", "project_detail"],
  ["what are your skills", "skills_overview"],
  ["skils", "skills_overview"],
  ["what is your tech stack", "skills_overview"],
  ["front end skills", "skills_overview"],
  ["do you know react?", "skill_check"],
  ["do u know postgres", "skill_check"],
  ["Is Node.js one of your skills", "skill_check"],
  ["do you know typscript", "skill_check"],
  ["does he know python", "skill_check"],
  ["do you know go", "skill_check"],
  ["which projects use react", "skill_check"],
  ["where did you study", "education"],
  ["eductaion", "education"],
  ["whats ur edu", "education"],
  ["where did you go to school", "education"],
  ["tell me about placeholder university", "education"],
  ["any certificates?", "certificates"],
  ["show ur certs", "certificates"],
  ["what courses have you taken", "courses"],
  ["tell me about your work experience", "experience"],
  ["where do you work", "experience"],
  ["how can I contact you", "contact"],
  ["contcat", "contact"],
  ["whats ur email", "contact"],
  ["can I see your resume", "resume"],
  ["download ur cv pls", "resume"],
  ["are you available for hire", "hire_availability"],
  ["where are you based", "location"],
  ["show me around", "tour"],
  ["take me to the project hall", "navigate"],
  ["go to mailbox", "navigate"],
  ["take me to eductaion", "navigate"],
  ["I'm in a hurry", "recruiter_mode"],
  ["i am a recruiter", "recruiter_mode"],
  ["thanks!", "thanks"],
  ["bye", "goodbye"],
  ["tell me a joke", "joke"],
  ["what can you do?", "help"],
  ["asdfghjkl", "fallback"],
  ["what is the weather on mars", "fallback"],
];

for (const [message, intent] of TABLE) {
  test(`understands "${message}" -> ${intent}`, async () => {
    const r = await ask(message);
    assert.equal(r.intent, intent, `text: ${r.text}`);
    assertShape(r, message);
    if (intent === "fallback") assert.ok(r.confidence < FALLBACK_THRESHOLD);
    else assert.ok(r.confidence >= FALLBACK_THRESHOLD);
  });
}

test("covers at least 18 distinct intents", () => {
  const covered = new Set(TABLE.map(([, i]) => i));
  assert.ok(covered.size >= 18, `only ${covered.size}`);
  for (const def of INTENTS) assert.ok(covered.has(def.id), `no test message for ${def.id}`);
});

/* ------------------------------------------------------------------ precedence and entities */

test("navigate verb + zone beats the topic intent and walks", async () => {
  const r = await ask("take me to education");
  assert.equal(r.intent, "navigate");
  assert.deepEqual(r.actions, [{ type: "walkTo", zone: "education" }]);
});

test("every zone can be reached by name", async () => {
  const names: Record<string, string> = {
    plaza: "plaza", "project-hall": "project hall", education: "education", "skills-lab": "skills lab",
    timeline: "timeline", about: "ghar", mailbox: "mailbox", kiosk: "kiosk", pottery: "pottery",
  };
  for (const zone of ZONE_IDS) {
    const r = await ask(`take me to the ${names[zone]}`);
    assert.deepEqual(r.actions, [{ type: "walkTo", zone }], zone);
  }
});

test("skill_check answers yes with level wording and a related project", async () => {
  const r = await ask("do you know react?");
  assert.match(r.text, /^Yes/);
  assert.match(r.text, /React/);
  assert.ok(r.suggestions.some((s) => s.message?.includes("SyncBoard")), "related project suggestion");
});

test("skill_check says no honestly for skills that are not listed", async () => {
  const r = await ask("do you know python?");
  assert.match(r.text, /Python/);
  assert.match(r.text, /won't claim/);
  assert.doesNotMatch(r.text, /^Yes/);
});

test("skill_check finds tech that only appears in a project stack", async () => {
  const r = await ask("do you know redis?");
  assert.match(r.text, /SyncBoard/);
});

test("ambiguous words are not skills without a skill cue", async () => {
  for (const m of ["what's next", "where do i go next", "what about the rest"]) {
    const r = await ask(m);
    assert.notEqual(r.intent, "skill_check", m);
  }
});

test("project entity gives project_detail with openProject suggestion", async () => {
  const r = await ask("tell me about syncboard");
  assert.equal(r.intent, "project_detail");
  assert.ok(r.suggestions.some((s) => s.action?.type === "openProject" && s.action.projectId === "syncboard"));
});

test("project links appear only when the profile has real URLs", async () => {
  const none = await ask("link to bookeasy repo");
  assert.ok(!allActions(none).some((a) => a.type === "openLink"));
  const live = await ask("link to bookeasy repo", world, livePlaceholder);
  assert.ok(allActions(live).some((a) => a.type === "openLink"));
});

test("contact offers real links when the profile has them", async () => {
  const r = await ask("how can I contact you", world, livePlaceholder);
  const links = allActions(r).filter((a) => a.type === "openLink");
  assert.ok(links.length >= 2);
  assert.ok(links.some((a) => a.type === "openLink" && a.url.startsWith("mailto:")));
});

test("education reply offers a walk to the education zone", async () => {
  const r = await ask("where did you study");
  assert.match(r.text, /Placeholder University/);
  assert.ok(r.suggestions.some((s) => s.action?.type === "walkTo" && s.action.zone === "education"));
});

test("education reply with the real shape: clean sentence, mentions TechSkills, no empty-field artefacts, no dead-end chips", async () => {
  for (const ctx of [world, recruiter]) {
    const r = await ask("what's your education?", ctx, realShape);
    assert.equal(r.intent, "education");
    assert.match(r.text, /currently studying at TechSkills Institute/);
    assert.match(r.text, /Bachelor of Information Technology \(BIT\) at Lincoln University \(2022–2026\)/);
    assert.match(r.text, /Universal School \(until 2020\)/);
    assert.doesNotMatch(r.text, / in {1,2}at |\(–|until present|Information Technology in Information|\s{2}/);
    assert.doesNotMatch(r.text, /(he|she|his|her)/i);
    assert.ok(r.suggestions.every((s) => !/certificates|courses/i.test(s.label)), "no chips for empty lists");
    assert.ok(r.suggestions.every((s) => s.action?.type !== "showResume"), "no resume chip without a real resume");
    assert.ok(r.suggestions.some((s) => s.action?.type === (ctx === world ? "walkTo" : "openLink")));
  }
  const filled = await ask("where did you study");
  assert.ok(filled.suggestions.some((s) => /certificates/i.test(s.label)) && filled.suggestions.some((s) => /courses/i.test(s.label)));
});

test("experience reply: honest line when there are no jobs, real data when there are", async () => {
  const empty = await ask("work history?", world, realShape);
  assert.equal(empty.intent, "experience");
  assert.match(empty.text, /no jobs listed yet/);
  assert.match(empty.text, /open to internships, junior roles and freelance/);
  assert.doesNotMatch(empty.text, /\b(he|she|his|her)\b/i);
  const real = await ask("work history?", world, { ...liveProfile, experience: [] });
  assert.equal(real.text, "Yanish is starting out: no jobs listed yet, but has built and shipped 2 full-stack apps solo, and is open to internships, junior roles and freelance. Want to see the projects?");
  assert.ok(empty.suggestions.some((s) => s.action?.type === "walkTo" && s.action.zone === "timeline"));
  const r = await ask("work history?", recruiter, realShape);
  assert.ok(r.suggestions.some((s) => s.action?.type === "openLink" && s.action.url === "#journey"));
  const full = await ask("work history?", world, profile);
  assert.match(full.text, /Full-Stack Developer at Placeholder Company A \(2025–now\)/);
});

test("resume chips appear only when links.resumeUrl is real", async () => {
  const fallback = await ask("zzzz qqqq");
  assert.ok(fallback.suggestions.every((s) => s.action?.type !== "showResume"));
  const withResume: Profile = { ...profile, links: { ...profile.links, resumeUrl: "https://example.com/cv.pdf" } };
  const r = await ask("zzzz qqqq", world, withResume);
  assert.ok(r.suggestions.some((s) => s.action?.type === "showResume"));
  assert.deepEqual((await ask("show me your resume")).actions, [{ type: "showResume" }]);
});

test("resume and recruiter mode trigger their actions", async () => {
  assert.deepEqual((await ask("show me your resume")).actions, [{ type: "showResume" }]);
  assert.deepEqual((await ask("i'm in a hurry")).actions, [{ type: "openRecruiterMode" }]);
  assert.deepEqual((await ask("show me around")).actions, [{ type: "startTour" }]);
});

/* ------------------------------------------------------------------ input edge cases */

test("empty and whitespace-only input gets the help reply", async () => {
  for (const m of ["", "   ", "\n\t "]) {
    const r = await ask(m);
    assert.equal(r.intent, "help");
    assertShape(r, JSON.stringify(m));
  }
});

test("non-Latin input (Nepali) gets a polite fallback", async () => {
  const r = await ask("नमस्ते, तपाईं को हुनुहुन्छ?");
  assert.equal(r.intent, "fallback");
  assert.match(r.text, /English/);
  assertShape(r, "nepali");
});

test("emoji-only and punctuation-only input does not crash", async () => {
  for (const m of ["😀😀", "???", "...", "<script>alert(1)</script>"]) {
    const r = await ask(m);
    assertShape(r, m);
  }
});

test("fallback never invents facts and always offers suggestions", async () => {
  const r = await ask("zzzz qqqq");
  assert.equal(r.intent, "fallback");
  assert.match(r.text, /not (sure|certain)/);
  assert.ok(r.suggestions.length >= 3 && r.suggestions.length <= 4);
});

test("normalize handles case, accents, slang and tech names", () => {
  assert.equal(normalize("  WHAT's   UR   Résumé?? "), "what is your resume");
  assert.equal(normalize("pls hv u node.js or C++"), "please have you nodejs or cpp");
  assert.equal(normalize("hiiiii"), "hi");
});

test("fuzzy matching follows the distance rules", () => {
  assert.equal(damerauLevenshtein("eductaion", "education"), 1);
  assert.ok(fuzzyMatch("eductaion", "education"));
  assert.ok(fuzzyMatch("skils", "skill"));
  assert.ok(!fuzzyMatch("cat", "car"), "3 letters or fewer must be exact");
  assert.ok(!fuzzyMatch("mail", "fail"), "short words keep the first letter");
});

test("keywords never contain stopwords", () => {
  for (const def of INTENTS) {
    for (const word of Object.keys(def.keywords)) assert.ok(!STOPWORDS.has(word), `${def.id}: "${word}" is a stopword`);
  }
});

/* ------------------------------------------------------------------ memory and follow-ups */

test("follow-up: 'tell me more' after the project list explains the first project", async () => {
  const brain = createLocalBrain(profile, { seed: SEED });
  await brain.reply("show me your projects", world);
  const r = await brain.reply("tell me more", world);
  assert.equal(r.intent, "project_detail");
  assert.match(r.text, /BookEasy/);
});

test("follow-up: ordinals index projects in profile order", async () => {
  const brain = createLocalBrain(profile, { seed: SEED });
  await brain.reply("what projects do you have", world);
  assert.match((await brain.reply("the second one", world)).text, /SyncBoard/);
  assert.match((await brain.reply("and the third one?", world)).text, /RepoGuide/);
  assert.match((await brain.reply("first one", world)).text, /BookEasy/);
  assert.match((await brain.reply("last one", world)).text, /RepoGuide/);
});

test("follow-up: 'next one' and 'tell me more' after a project detail", async () => {
  const brain = createLocalBrain(profile, { seed: SEED });
  await brain.reply("tell me about bookeasy", world);
  const more = await brain.reply("tell me more", world);
  assert.equal(more.intent, "project_detail");
  assert.match(more.text, /Multi-tenant data isolation/);
  const next = await brain.reply("next one", world);
  assert.match(next.text, /SyncBoard/);
});

test("follow-up: 'the second project' works without any history", async () => {
  assert.match((await ask("the second project")).text, /SyncBoard/);
});

test("follow-up: ordinal with no project context is a safe fallback", async () => {
  assert.equal((await ask("the second one")).intent, "fallback");
});

test("follow-up: yes after an offer runs the offered action", async () => {
  for (const yes of ["yes", "sure", "ok", "yes please", "take me there", "go ahead"]) {
    const brain = createLocalBrain(profile, { seed: SEED });
    await brain.reply("where did you study", world);
    const r = await brain.reply(yes, world);
    assert.deepEqual(r.actions, [{ type: "walkTo", zone: "education" }], yes);
    assertShape(r, yes);
  }
});

test("follow-up: ctx.lastOffer wins over the brain's own memory", async () => {
  const brain = createLocalBrain(profile, { seed: SEED });
  await brain.reply("where did you study", world);
  const r = await brain.reply("yes", { mode: "world", lastOffer: { type: "walkTo", zone: "mailbox" } });
  assert.deepEqual(r.actions, [{ type: "walkTo", zone: "mailbox" }]);
});

test("follow-up: yes with nothing offered does nothing risky", async () => {
  const r = await ask("yes");
  assert.equal(r.intent, "affirm");
  assert.equal(r.actions, undefined);
});

test("follow-up: no thanks clears the offer", async () => {
  const brain = createLocalBrain(profile, { seed: SEED });
  await brain.reply("where did you study", world);
  assert.equal((await brain.reply("no thanks", world)).intent, "decline");
  assert.equal((await brain.reply("yes", world)).actions, undefined);
});

test("follow-up: 'not sure' is not a yes", async () => {
  const brain = createLocalBrain(profile, { seed: SEED });
  await brain.reply("where did you study", world);
  const r = await brain.reply("not sure", world);
  assert.equal(r.actions, undefined);
});

test("memory can be rebuilt from ctx.history when the brain is new", async () => {
  const first = await createLocalBrain(profile, { seed: SEED }).reply("show me your projects", world);
  const fresh = createLocalBrain(profile, { seed: SEED });
  const r = await fresh.reply("the second one", {
    mode: "world",
    history: [{ role: "user", text: "show me your projects" }, { role: "robot", text: first.text }],
  });
  assert.match(r.text, /SyncBoard/);
});

/* ------------------------------------------------------------------ recruiter mode */

test("recruiter mode: navigation becomes #section links, never walkTo", async () => {
  const cases: [string, string][] = [
    ["take me to education", "#journey"],
    ["go to the project hall", "#projects"],
    ["take me to the skills lab", "#skills"],
    ["go to mailbox", "#contact"],
  ];
  for (const [m, url] of cases) {
    const r = await ask(m, recruiter);
    assert.equal(r.actions?.[0]?.type, "openLink", m);
    assert.equal(r.actions?.[0]?.type === "openLink" ? r.actions[0].url : "", url, m);
  }
});

test("recruiter mode: tour becomes anchor links", async () => {
  const r = await ask("show me around", recruiter);
  assert.equal(r.actions, undefined);
  assert.ok(r.suggestions.every((s) => s.action?.type === "openLink"));
});

test("recruiter mode: 'yes' runs the offer as a scroll link", async () => {
  const brain = createLocalBrain(profile, { seed: SEED });
  await brain.reply("where did you study", recruiter);
  const r = await brain.reply("yes", recruiter);
  assert.deepEqual(r.actions, [{ type: "openLink", url: "#journey", label: "Education" }]);
});

test("recruiter mode: an offer made in world mode is converted when run", async () => {
  const r = await ask("yes", { mode: "recruiter", lastOffer: { type: "startTour" } });
  assert.equal(r.actions?.[0]?.type, "openLink");
});

test("recruiter mode: no reply anywhere contains walkTo or startTour", async () => {
  const brain = createLocalBrain(livePlaceholder, { seed: SEED });
  const messages = [...TABLE.map(([m]) => m), "yes", "sure", "tell me more", "the second one", "next one", ""];
  const replies: RobotReply[] = [brain.greet(recruiter)];
  for (const m of messages) replies.push(await brain.reply(m, recruiter));
  for (const r of replies) {
    for (const a of allActions(r)) {
      assert.ok(a.type !== "walkTo" && a.type !== "startTour", `${r.intent}: ${JSON.stringify(a)}`);
    }
    assert.doesNotMatch(r.text, /walk you|follow me|take you there/i, r.text);
    assertShape(r, r.intent);
  }
});

/* ------------------------------------------------------------------ whole-system properties */

test("every reply in both modes has 2-4 suggestions", async () => {
  for (const mode of ["world", "recruiter"] as RobotMode[]) {
    const brain = createLocalBrain(profile, { seed: SEED });
    assertShape(brain.greet({ mode }), `greet ${mode}`);
    for (const [m] of TABLE) assertShape(await brain.reply(m, { mode }), `${mode}: ${m}`);
  }
});

test("every suggestion message is understood by the robot (no dead ends)", async () => {
  for (const mode of ["world", "recruiter"] as RobotMode[]) {
    const brain = createLocalBrain(profile, { seed: SEED });
    const replies = [brain.greet({ mode })];
    for (const [m] of TABLE) replies.push(await brain.reply(m, { mode }));
    for (const r of replies) {
      for (const s of r.suggestions) {
        if (!s.message) continue;
        const next = await createLocalBrain(profile, { seed: SEED }).reply(s.message, { mode });
        assert.notEqual(next.intent, "fallback", `"${s.message}" (${mode}) falls back`);
      }
    }
  }
});

test("greet works in both modes and offers suggestions", () => {
  const brain = createLocalBrain(profile, { seed: SEED });
  assert.equal(brain.greet().intent, "greeting");
  assert.match(brain.greet().text, /^Start here: .+'s home is right in front of you/);
  const rec = brain.greet(recruiter);
  assert.ok(rec.suggestions.every((s) => s.action?.type !== "startTour"));
});

test("same seed gives the same replies; different seeds give variety", async () => {
  const run = async (seed: number): Promise<string[]> => {
    const brain = createLocalBrain(profile, { seed });
    const out: string[] = [];
    for (const m of ["hi", "who are you", "thanks", "tell me a joke", "bye"]) out.push((await brain.reply(m, world)).text);
    return out;
  };
  assert.deepEqual(await run(5), await run(5));
  const greetings = new Set<string>();
  for (let s = 0; s < 30; s++) greetings.add(createLocalBrain(profile, { seed: s }).greet(recruiter).text);
  assert.ok(greetings.size >= 2, "phrasing variants exist");
});

test("answers come from the profile: change the data, the robot changes", async () => {
  const other: Profile = {
    ...profile,
    name: "Sam Rivera",
    location: "Lisbon, Portugal",
    projects: [{ ...profile.projects[0], id: "zapmap", name: "ZapMap", tagline: "Map of EV chargers" }, ...profile.projects.slice(1)],
    skills: [{ category: "backend", label: "Backend", skills: [{ name: "Elixir", level: 90 }] }],
    education: [{ ...profile.education[0], school: "Lisbon Institute", degree: "Master of Arts", field: "Design" }],
  };
  const brain = createLocalBrain(other, { seed: SEED });
  assert.match((await brain.reply("where are you based")).text, /Lisbon, Portugal/);
  assert.match((await brain.reply("who is sam")).text, /Sam/);
  const zap = await brain.reply("tell me about zapmap");
  assert.equal(zap.intent, "project_detail");
  assert.match(zap.text, /EV chargers/);
  assert.match((await brain.reply("what are your skills")).text, /Elixir/);
  assert.match((await brain.reply("where did you study")).text, /Lisbon Institute/);
  assert.doesNotMatch((await brain.reply("where did you study")).text, /Yanish/);
});

test("replies never use pronouns for the owner", async () => {
  const brain = createLocalBrain(profile, { seed: SEED });
  for (const [m] of TABLE) {
    const r = await brain.reply(m, world);
    assert.doesNotMatch(r.text, /\b(he|she|his|hers|him)\b/i, `${m}: ${r.text}`);
  }
});

/* ------------------------------------------------------------------ projects + navigation verb */

test("projects with a navigation verb lead to the Project Hall in world mode", async () => {
  for (const m of ["show me your projects", "Show me the projects", "take me to the projects", "can I see your projects", "lead me to projects"]) {
    const r = await ask(m, world);
    assert.deepEqual(r.actions, [{ type: "walkTo", zone: "project-hall" }], m);
    assertShape(r, m);
  }
});

test("projects with a navigation verb open #projects in recruiter mode", async () => {
  for (const m of ["show me your projects", "take me to the projects"]) {
    const r = await ask(m, recruiter);
    assert.deepEqual(r.actions, [{ type: "openLink", url: "#projects", label: "Projects" }], m);
  }
});

test("a navigation verb + a project name walks to its stand (openProject) in world mode", async () => {
  for (const m of ["show me project bookeasy", "take me to syncboard", "show me the repoguide project"]) {
    const r = await ask(m, world);
    assert.equal(r.intent, "project_detail", m);
    const id = m.includes("bookeasy") ? "bookeasy" : m.includes("syncboard") ? "syncboard" : "repoguide";
    assert.deepEqual(r.actions, [{ type: "openProject", projectId: id }], m);
    assertShape(r, m);
  }
});

test("a project name without a navigation verb, or in recruiter mode, does not walk", async () => {
  for (const m of ["tell me about bookeasy", "what is syncboard built with"]) {
    const r = await ask(m, world);
    assert.equal(r.intent, "project_detail", m);
    assert.equal(r.actions, undefined, m);
  }
  const r = await ask("show me project bookeasy", recruiter);
  assert.equal(r.intent, "project_detail");
  assert.equal(r.actions, undefined);
});

test("education questions that name the owner are education, not about-owner", async () => {
  for (const m of [
    "where did Yanish study?", "where did he study", "where did they study", "what's his education",
    "which college", "which university", "which college did Yanish go to", "which university did Yanish attend",
  ]) {
    const r = await ask(m, world);
    assert.equal(r.intent, "education", m);
    assert.equal(r.actions, undefined, `${m}: a question, not a walk`);
    assertShape(r, m);
  }
});

test("the owner's name on its own still means about-owner", async () => {
  for (const m of ["who is Yanish", "who is Yanish?", "tell me about Yanish"]) {
    assert.equal((await ask(m, world)).intent, "about_owner", m);
  }
});

test("about the owner: the world walks to the Ghar, the recruiter page points to #about", async () => {
  for (const m of ["who is Yanish", "tell me about yanish", "about you"]) {
    const w = await ask(m, world);
    assert.equal(w.intent, "about_owner", m);
    assert.deepEqual(w.actions, [{ type: "walkTo", zone: "about" }], m);
    assertShape(w, m);
    const r = await ask(m, recruiter);
    assert.equal(r.intent, "about_owner", m);
    assert.equal(r.actions, undefined, `${m}: recruiter mode never auto-scrolls`);
    assert.ok(r.suggestions.some((s) => s.action?.type === "openLink" && s.action.url === "#about"), m);
    assert.ok(allActions(r).every((a) => a.type !== "walkTo"), m);
  }
});

test("the Ghar can be asked for by name, and the recruiter anchors match the page", async () => {
  for (const m of ["take me to the ghar", "go to the about house", "walk me to about me"]) {
    assert.deepEqual((await ask(m, world)).actions, [{ type: "walkTo", zone: "about" }], m);
  }
  const r = await ask("take me to the ghar", recruiter);
  assert.deepEqual(r.actions, [{ type: "openLink", url: "#about", label: "About" }]);
  const exp = await ask("take me to the timeline", recruiter);
  assert.equal(exp.actions?.[0]?.type === "openLink" ? exp.actions[0].url : "", "#journey");
});

test("'house' alone is not the Ghar, and self-intro questions stay with the robot", async () => {
  assert.deepEqual((await ask("go to the school house")).actions, [{ type: "walkTo", zone: "education" }]);
  assert.notDeepEqual((await ask("go to the house")).actions, [{ type: "walkTo", zone: "about" }]);
  for (const m of ["tell me about yourself", "what about you?"]) {
    const r = await ask(m);
    assert.notEqual(r.intent, "about_owner", m);
    assert.equal(r.actions, undefined, m);
  }
});

test("asking about projects without a navigation verb does not walk", async () => {
  for (const m of ["tell me about your projects", "what projects have you built", "how many projects"]) {
    for (const ctx of [world, recruiter]) {
      const r = await ask(m, ctx);
      assert.equal(r.intent, "projects_overview", m);
      assert.equal(r.actions, undefined, m);
    }
  }
});

test("workshop: other / more / github projects list the GitHub-only projects, not the featured ones", async () => {
  for (const q of ["other projects", "show me more projects", "do you have github projects?", "what's in the workshop"]) {
    const r = await ask(q, world, liveProfile);
    assert.equal(r.intent, "workshop", q);
    assert.match(r.text, /Arena Nepal, VirtualMart, Rudrakshya, Atelier Study and Dental Booking \+ AI/, q);
    assert.ok(r.suggestions.some((s) => s.action?.type === "openProject" && s.action.projectId === "workshop"), q);
    assert.ok(r.suggestions.length >= 2 && r.suggestions.length <= 4, q);
  }
  const rec = await ask("other projects", recruiter, liveProfile);
  assert.ok(rec.suggestions.some((s) => s.action?.type === "openLink" && s.action.url === "#projects"));
  assert.ok(!rec.suggestions.some((s) => s.action?.type === "openProject"));
});

test("workshop does not steal the featured projects", async () => {
  for (const q of ["show me the projects", "what projects have you built", "tell me about the projects"]) {
    const r = await ask(q, world, liveProfile);
    assert.equal(r.intent, "projects_overview", q);
  }
  const g = await ask("take me to the other projects", world, liveProfile);
  assert.equal(g.intent, "workshop");
  assert.ok(g.actions?.some((a) => a.type === "openProject" && a.projectId === "workshop"));
});

test("the journey zone is called My Journey", async () => {
  assert.equal(ZONE_LABEL.timeline, "My Journey");
});
