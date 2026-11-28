// Understanding: normalise, tokenise, fuzzy-match, detect entities from the profile, score intents.

import type { Profile } from "@/content/profile";
import {
  AMBIGUOUS_ALIASES,
  AMBIGUOUS_CUES,
  GENERIC_NAME_WORDS,
  INTENTS,
  SYNONYM_GROUPS,
  TECH_VOCAB,
} from "./intents";
import {
  contentTokens,
  fuzzyMatch,
  isMostlyNonLatin,
  normalize,
  normalizeBase,
  STOPWORDS,
  tokenize,
} from "./text";
import type { IntentId, ZoneId } from "./types";

/** Below this confidence the robot admits it is not sure (fallback intent). */
export const FALLBACK_THRESHOLD = 0.3;

/** Score that maps to confidence 1. */
const FULL_SCORE = 4;

/* ------------------------------------------------------------------ entity index */

export interface Alias {
  text: string;
  joined: string;
  amb: boolean;
}

export interface TechEntity {
  key: string;
  name: string;
  owned: boolean;
  level?: number;
  groupLabel?: string;
  projectIdxs: number[];
  aliases: Alias[];
}

interface NamedEntity {
  idx: number;
  aliases: Alias[];
}

export interface EntityIndex {
  techs: TechEntity[];
  projects: NamedEntity[];
  schools: NamedEntity[];
  companies: NamedEntity[];
  certificates: NamedEntity[];
  courses: NamedEntity[];
  skillGroups: NamedEntity[];
  ownerTokens: string[];
}

const ZONE_ALIASES: Record<ZoneId, string[]> = {
  plaza: ["plaza", "square", "start", "spawn", "hub", "center", "centre", "lobby", "home"],
  "project-hall": ["project", "projects", "project hall", "hall", "gallery", "showroom"],
  education: ["education", "school", "university", "college", "classroom", "campus", "academy"],
  "skills-lab": ["skills", "skill", "skills lab", "lab", "laboratory", "workshop"],
  timeline: ["timeline", "time line", "journey", "career", "history", "experience"],
  about: ["ghar", "about me", "about page", "about house"],
  mailbox: ["mailbox", "mail box", "mail", "contact", "post", "letterbox"],
  kiosk: ["kiosk", "booth", "terminal", "desk"],
  pottery: ["pottery", "potter", "pot", "pots", "potters corner", "pottery wheel", "clay"],
};

const joinedOf = (s: string): string => s.replace(/ /g, "");

function makeAlias(text: string): Alias {
  return { text, joined: joinedOf(text), amb: AMBIGUOUS_ALIASES.has(text) };
}

function uniqueAliases(list: string[]): Alias[] {
  const seen = new Set<string>();
  const out: Alias[] = [];
  for (const t of list) {
    const text = t.trim();
    if (!text || seen.has(joinedOf(text))) continue;
    seen.add(joinedOf(text));
    out.push(makeAlias(text));
  }
  return out;
}

const CANON = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) {
  for (const member of group) {
    CANON.set(member, group);
    CANON.set(joinedOf(member), group);
  }
}

function techKey(norm: string): { key: string; group?: string[] } {
  const group = CANON.get(norm) ?? CANON.get(joinedOf(norm));
  return group ? { key: group[0], group } : { key: joinedOf(norm) };
}

function techAliases(norm: string, group?: string[]): Alias[] {
  if (group) return uniqueAliases(group);
  const tokens = tokenize(norm);
  const list = [norm];
  if (tokens.length > 1 && GENERIC_NAME_WORDS.has(tokens[tokens.length - 1])) {
    list.push(tokens.slice(0, -1).join(" "));
  }
  return uniqueAliases(list);
}

/** Aliases for a school/company/course name: full name, its parts around ":" and distinctive words. */
function nameAliases(name: string): Alias[] {
  const list: string[] = [normalizeBase(name)];
  for (const part of name.split(/:|\s[-–—]\s|\|/)) list.push(normalizeBase(part));
  for (const tok of tokenize(normalizeBase(name))) {
    if (tok.length >= 5 && !GENERIC_NAME_WORDS.has(tok) && !STOPWORDS.has(tok)) list.push(tok);
  }
  return uniqueAliases(list);
}

function dropSharedAliases(groups: NamedEntity[][]): void {
  const owners = new Map<string, Set<number>>();
  groups.forEach((g, gi) => {
    for (const e of g) {
      for (const a of e.aliases) {
        const set = owners.get(a.joined) ?? new Set<number>();
        set.add(gi);
        owners.set(a.joined, set);
      }
    }
  });
  for (const g of groups) {
    for (const e of g) e.aliases = e.aliases.filter((a) => (owners.get(a.joined)?.size ?? 0) <= 1);
  }
}

export function buildEntityIndex(profile: Profile): EntityIndex {
  const techMap = new Map<string, TechEntity>();
  const addTech = (display: string, owned: boolean, level?: number, groupLabel?: string, projectIdx?: number): void => {
    const norm = normalizeBase(display);
    if (!norm) return;
    const { key, group } = techKey(norm);
    let t = techMap.get(key);
    if (!t) {
      t = { key, name: display, owned: false, projectIdxs: [], aliases: techAliases(norm, group) };
      techMap.set(key, t);
    }
    if (owned && !t.owned) {
      t.owned = true;
      t.name = display;
      t.level = level;
      t.groupLabel = groupLabel;
    }
    if (projectIdx !== undefined && !t.projectIdxs.includes(projectIdx)) t.projectIdxs.push(projectIdx);
  };

  for (const g of profile.skills) for (const s of g.skills) addTech(s.name, true, s.level, g.label);
  profile.projects.forEach((p, i) => p.stack.forEach((s) => addTech(s, false, undefined, undefined, i)));
  for (const v of TECH_VOCAB) addTech(v, false);

  const projects: NamedEntity[] = profile.projects.map((p, idx) => ({
    idx,
    aliases: uniqueAliases([normalizeBase(p.name), normalizeBase(p.id)]),
  }));
  const schools: NamedEntity[] = profile.education.map((e, idx) => ({ idx, aliases: nameAliases(e.school) }));
  const companies: NamedEntity[] = profile.experience.map((e, idx) => ({ idx, aliases: nameAliases(e.company) }));
  const certificates: NamedEntity[] = profile.certificates.map((c, idx) => ({ idx, aliases: nameAliases(c.name) }));
  const courses: NamedEntity[] = profile.courses.map((c, idx) => ({ idx, aliases: nameAliases(c.name) }));
  dropSharedAliases([schools, companies, certificates, courses]);

  const skillGroups: NamedEntity[] = profile.skills.map((g, idx) => ({
    idx,
    aliases: uniqueAliases([
      normalizeBase(g.label),
      normalizeBase(g.category),
      ...tokenize(normalizeBase(g.label)).filter((t) => t.length >= 4),
    ]),
  }));

  const ownerTokens = tokenize(normalizeBase(profile.name)).filter((t) => t.length >= 3);
  return {
    techs: [...techMap.values()],
    projects,
    schools,
    companies,
    certificates,
    courses,
    skillGroups,
    ownerTokens,
  };
}

/* ------------------------------------------------------------------ analysis */

export type Ordinal = number | "next" | "prev" | "last";

export interface Analysis {
  raw: string;
  norm: string;
  tokens: string[];
  content: string[];
  empty: boolean;
  nonLatin: boolean;
  navigate: boolean;
  /** A "show me / take me / go to" verb is present (used to turn a topic question into a walk). */
  goVerb: boolean;
  zones: ZoneId[];
  projectIdxs: number[];
  techs: TechEntity[];
  schoolIdxs: number[];
  companyIdxs: number[];
  certIdxs: number[];
  courseIdxs: number[];
  groupIdxs: number[];
  ownerHit: boolean;
  ordinal?: Ordinal;
}

const NAV_PATTERNS: RegExp[] = [
  /\b(take|bring|lead|guide|walk|escort|teleport|send|carry) (me|us)\b/,
  /\b(go|head|walk|run|jump|move|navigate|teleport|travel|fly) (over )?(to|into|towards?)\b/,
  /\bshow me (the way|where|to)\b/,
  /\b(lets|let us) (go|visit)\b/,
  /\bwhere (is|are)\b/,
  /\b(visit|goto)\b/,
];
/** "show me / see / take me / lead me / go to" in front of a topic: the visitor wants to be taken there, not just told. */
const GO_VERB = /\b(show|see|take|bring|lead|guide|walk|escort) (me|us|the|all|your|his|her|their)\b|\b(go|head) (to|over)\b/;
/** Questions about the past ("where did you go", "which college did Yanish go to") are not walk commands. */
const NAV_EXCLUDE = /\b(you|u) (go|went|attend|attended|study|studied|graduated)\b|\b(did|does) \S+ (go|attend|study|graduate)\b/;

const ORDINALS: Record<string, Ordinal> = {
  first: 0, "1st": 0, second: 1, "2nd": 1, third: 2, "3rd": 2, fourth: 3, "4th": 3, fifth: 4, "5th": 4,
  last: "last", next: "next", another: "next", previous: "prev", prev: "prev",
};

/** Position of the first n-gram (joined without spaces) that equals, or is a typo of, the alias. */
function hitPos(joinedPos: Map<string, number>, alias: Alias, allowFuzzy: boolean): number {
  const exact = joinedPos.get(alias.joined);
  if (exact !== undefined) return exact;
  if (!allowFuzzy || alias.amb || alias.joined.length < 6) return -1;
  let best = -1;
  for (const [gram, pos] of joinedPos) {
    if (gram.length >= 6 && fuzzyMatch(gram, alias.joined) && (best === -1 || pos < best)) best = pos;
  }
  return best;
}

function matchNamed(joinedPos: Map<string, number>, list: NamedEntity[], fuzzy = true): number[] {
  const hits: { idx: number; pos: number }[] = [];
  for (const e of list) {
    let pos = -1;
    for (const a of e.aliases) {
      const p = hitPos(joinedPos, a, fuzzy);
      if (p !== -1 && (pos === -1 || p < pos)) pos = p;
    }
    if (pos !== -1) hits.push({ idx: e.idx, pos });
  }
  return hits.sort((x, y) => x.pos - y.pos).map((h) => h.idx);
}

export function analyze(text: string, index: EntityIndex): Analysis {
  const raw = text ?? "";
  const norm = normalize(raw);
  const tokens = tokenize(norm);
  const content = contentTokens(tokens);
  const base: Analysis = {
    raw, norm, tokens, content,
    empty: raw.trim().length === 0,
    nonLatin: isMostlyNonLatin(raw),
    navigate: false, goVerb: false, zones: [], projectIdxs: [], techs: [], schoolIdxs: [], companyIdxs: [],
    certIdxs: [], courseIdxs: [], groupIdxs: [], ownerHit: false,
  };
  if (base.empty || base.nonLatin || tokens.length === 0) return base;

  // n-grams (1..3 tokens) joined without spaces, so "book easy" and "bookeasy" both hit.
  const joinedPos = new Map<string, number>();
  for (let n = 1; n <= 3; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const g = tokens.slice(i, i + n).join("");
      if (!joinedPos.has(g)) joinedPos.set(g, i);
    }
  }

  const hasAmbCue = tokens.some((t) => AMBIGUOUS_CUES.has(t));
  base.navigate = NAV_PATTERNS.some((re) => re.test(norm)) && !NAV_EXCLUDE.test(norm);

  base.goVerb = GO_VERB.test(norm) && !NAV_EXCLUDE.test(norm);

  const zoneHits: { zone: ZoneId; pos: number }[] = [];
  for (const zone of Object.keys(ZONE_ALIASES) as ZoneId[]) {
    let pos = -1;
    for (const alias of ZONE_ALIASES[zone]) {
      const p = hitPos(joinedPos, makeAlias(alias), true);
      if (p !== -1 && (pos === -1 || p < pos)) pos = p;
    }
    if (pos !== -1) zoneHits.push({ zone, pos });
  }
  base.zones = zoneHits.sort((x, y) => x.pos - y.pos).map((z) => z.zone);

  base.projectIdxs = matchNamed(joinedPos, index.projects);
  base.schoolIdxs = matchNamed(joinedPos, index.schools);
  base.companyIdxs = matchNamed(joinedPos, index.companies);
  base.certIdxs = matchNamed(joinedPos, index.certificates);
  base.courseIdxs = matchNamed(joinedPos, index.courses);
  base.groupIdxs = matchNamed(joinedPos, index.skillGroups, false);

  const techHits: { t: TechEntity; pos: number }[] = [];
  for (const t of index.techs) {
    let pos = -1;
    for (const a of t.aliases) {
      if (a.amb && !hasAmbCue) continue;
      const p = hitPos(joinedPos, a, true);
      if (p !== -1 && (pos === -1 || p < pos)) pos = p;
    }
    if (pos !== -1) techHits.push({ t, pos });
  }
  base.techs = techHits.sort((x, y) => x.pos - y.pos).map((h) => h.t);

  base.ownerHit = index.ownerTokens.some((tok) => tokens.some((t) => fuzzyMatch(t, tok)));

  for (const t of tokens) {
    if (t in ORDINALS) {
      base.ordinal = ORDINALS[t];
      break;
    }
  }
  return base;
}

/* ------------------------------------------------------------------ follow-ups */

export type FollowUp = { kind: "affirm" | "decline" | "more" | "ordinal"; ordinal?: Ordinal };

const AFFIRM_CORE = new Set(["yes", "ok", "sure", "absolutely", "definitely", "certainly", "alright", "fine", "y", "ye", "please", "sounds"]);
const AFFIRM_FILLER = new Set([
  "let", "lets", "us", "go", "ahead", "do", "it", "that", "there", "take", "me", "show", "lead", "the", "way", "walk",
  "thanks", "thank", "you", "now", "then", "i", "would", "like", "to", "want", "great", "good", "why", "not", "and",
  "yes", "ok", "sure", "absolutely", "definitely", "certainly", "alright", "fine", "y", "ye", "please", "sounds", "cool",
]);
const AFFIRM_PHRASES = /\b(go ahead|do it|lets go|let us go|why not|lead the way)\b/;
const DECLINE_CORE = new Set(["no", "nope", "nah", "pass", "nevermind"]);
const DECLINE_FILLER = new Set(["thanks", "thank", "you", "maybe", "later", "not", "now", "i", "am", "good", "fine", "its", "ok", "never", "mind", "no", "nope", "nah", "pass", "nevermind"]);
const MORE_RE = /\b(more|details?|elaborate|continue|go on|what else|anything else)\b/;
const FOLLOW_FILLER = new Set([
  "and", "the", "one", "ones", "project", "that", "it", "this", "please", "what", "how", "about", "now", "then", "tell",
  "me", "more", "details", "detail", "elaborate", "continue", "go", "on", "else", "anything", "also", "too", "so", "ok",
  "other", "show", "give", "can", "you", "i", "get", "some", "any", "of", "its", "them", "those",
]);

export function detectFollowUp(a: Analysis, hasOffer: boolean): FollowUp | null {
  const t = a.tokens;
  if (t.length === 0 || a.nonLatin) return null;
  const hasCore = t.some((w) => AFFIRM_CORE.has(w)) || AFFIRM_PHRASES.test(a.norm);
  const motion = t.some((w) => ["take", "show", "lead", "walk", "go"].includes(w));
  const negated = t.includes("not") && !a.norm.includes("why not");
  if (t.every((w) => AFFIRM_FILLER.has(w)) && !negated && !t.some((w) => DECLINE_CORE.has(w))) {
    if (hasCore) return { kind: "affirm" };
    if (hasOffer && motion && t.includes("me")) return { kind: "affirm" };
  }
  if (t.every((w) => DECLINE_FILLER.has(w)) && t.some((w) => DECLINE_CORE.has(w) || (w === "not" && t.includes("now")) || (w === "maybe" && t.includes("later")))) {
    return { kind: "decline" };
  }
  if (a.ordinal !== undefined) {
    const rest = t.filter((w) => !(w in ORDINALS) && !FOLLOW_FILLER.has(w));
    if (rest.length === 0) return { kind: "ordinal", ordinal: a.ordinal };
  }
  if (MORE_RE.test(a.norm)) {
    const rest = t.filter((w) => !FOLLOW_FILLER.has(w) && !MORE_RE.test(w));
    if (rest.length === 0) return { kind: "more" };
  }
  return null;
}

/* ------------------------------------------------------------------ scoring */

interface KeywordEntry {
  word: string;
  intent: IntentId;
  weight: number;
}

const KEYWORDS: KeywordEntry[] = INTENTS.flatMap((def) =>
  Object.entries(def.keywords).map(([word, weight]) => ({ word, intent: def.id, weight })),
);

export interface Scored {
  intent: IntentId;
  score: number;
}

export function scoreIntents(a: Analysis): Scored[] {
  const padded = ` ${a.norm} `;
  const scores = new Map<IntentId, number>();
  const add = (intent: IntentId, w: number): void => {
    scores.set(intent, (scores.get(intent) ?? 0) + w);
  };

  const used = new Set<string>();
  for (const tok of a.content) {
    // best weight per intent for this token: exact first, then fuzzy (4+ letters only)
    const best = new Map<IntentId, { word: string; w: number }>();
    for (const k of KEYWORDS) {
      let w = 0;
      if (tok === k.word) w = k.weight;
      else if (tok.length >= 4 && k.word.length >= 4 && fuzzyMatch(tok, k.word)) w = k.weight * 0.75;
      if (w > 0 && w > (best.get(k.intent)?.w ?? 0)) best.set(k.intent, { word: k.word, w });
    }
    for (const [intent, { word, w }] of best) {
      const id = `${intent}:${word}`;
      if (used.has(id)) continue;
      used.add(id);
      add(intent, w);
    }
  }

  for (const def of INTENTS) {
    for (const [phrase, w] of Object.entries(def.phrases)) {
      if (padded.includes(` ${phrase} `)) add(def.id, w);
    }
  }

  if (a.schoolIdxs.length) add("education", 3);
  if (a.companyIdxs.length) add("experience", 3);
  if (a.certIdxs.length) add("certificates", 3);
  if (a.courseIdxs.length) add("courses", 3);
  if (a.groupIdxs.length) add("skills_overview", 2);
  // The owner's name is usually just the subject ("where did Yanish study?"): it only means
  // "tell me about the owner" when no topic keyword carries the message.
  if (a.ownerHit) {
    let topic = 0;
    for (const [intent, s] of scores) if (intent !== "about_owner") topic = Math.max(topic, s);
    add("about_owner", topic >= 2 ? 1 : 2.5);
  }

  return INTENTS.map((d) => ({ intent: d.id, score: scores.get(d.id) ?? 0 })).sort((x, y) => y.score - x.score);
}

/* ------------------------------------------------------------------ classification */

export interface MatchResult {
  intent: IntentId;
  confidence: number;
  variant?: string;
  zone?: ZoneId;
  /** projects_overview / project_detail: the visitor used a navigation verb, so lead them there. */
  go?: boolean;
  projectIdx?: number;
  ordinal?: Ordinal;
  techs?: TechEntity[];
  schoolIdxs?: number[];
  companyIdxs?: number[];
  certIdxs?: number[];
  courseIdxs?: number[];
  groupIdx?: number;
}

const HARD_WINS: ReadonlySet<IntentId> = new Set([
  "hire_availability", "contact", "resume", "goodbye", "thanks", "who_are_you", "joke",
]);

const has = (a: Analysis, ...words: string[]): boolean => words.some((w) => a.tokens.includes(w));

function projectVariant(a: Analysis): string | undefined {
  if (has(a, "stack", "tech", "technologies", "technology", "built", "using", "made", "tools", "framework", "frameworks")) return "stack";
  if (has(a, "link", "links", "live", "demo", "github", "repo", "source", "website", "visit", "code", "url")) return "links";
  if (has(a, "more", "details", "detail", "highlights", "features", "problem", "why", "elaborate")) return "more";
  return undefined;
}

/** "other / more / github projects", "the workshop": the GitHub-only projects, never the featured ones. */
const WORKSHOP_RE = /\b(?:other|more|extra|additional|github|unfinished|undeployed|not deployed|code only) (?:projects?|work)\b|\bprojects? (?:on|in|from) github\b|\bworkshop\b/;

/** Decide the intent for one message. Precedence: navigate > project entity > skill entity > scored intents. */
export function classify(a: Analysis): MatchResult {
  if (WORKSHOP_RE.test(a.norm)) return { intent: "workshop", confidence: 0.9, ...(a.goVerb ? { go: true } : {}) };
  if (a.navigate && a.zones.length > 0) {
    return { intent: "navigate", zone: a.zones[0], confidence: 0.95 };
  }
  if (a.ordinal !== undefined && has(a, "project")) {
    return { intent: "project_detail", ordinal: a.ordinal, confidence: 0.85, variant: projectVariant(a), ...(a.goVerb ? { go: true } : {}) };
  }
  if (a.projectIdxs.length > 0) {
    return { intent: "project_detail", projectIdx: a.projectIdxs[0], confidence: 0.9, variant: projectVariant(a), ...(a.goVerb ? { go: true } : {}) };
  }

  const scored = scoreIntents(a);
  const top = scored[0];

  if (a.techs.length > 0 && !(HARD_WINS.has(top.intent) && top.score >= 3)) {
    const projects = has(a, "project", "projects", "built", "portfolio", "used", "using");
    return { intent: "skill_check", techs: a.techs, confidence: 0.9, variant: projects ? "projects" : undefined };
  }

  const confidence = Math.min(1, top.score / FULL_SCORE);
  if (confidence < FALLBACK_THRESHOLD || top.score === 0) {
    return { intent: "fallback", confidence };
  }

  const res: MatchResult = { intent: top.intent, confidence };
  if (top.intent === "education" && a.schoolIdxs.length) res.schoolIdxs = a.schoolIdxs;
  if (top.intent === "experience" && a.companyIdxs.length) res.companyIdxs = a.companyIdxs;
  if (top.intent === "certificates" && a.certIdxs.length) res.certIdxs = a.certIdxs;
  if (top.intent === "courses" && a.courseIdxs.length) res.courseIdxs = a.courseIdxs;
  if (top.intent === "skills_overview" && a.groupIdxs.length) res.groupIdx = a.groupIdxs[0];
  if (top.intent === "navigate" && a.zones.length) res.zone = a.zones[0];
  if (top.intent === "projects_overview" && a.goVerb) res.go = true;
  return res;
}
