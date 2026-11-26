// Text helpers: normalisation, slang, stopwords, fuzzy matching, seeded RNG.

/** Chat slang, expanded token by token BEFORE any fuzzy matching. */
export const SLANG: Record<string, string> = {
  u: "you",
  ur: "your",
  r: "are",
  pls: "please",
  plz: "please",
  plss: "please",
  wat: "what",
  wut: "what",
  wht: "what",
  whats: "what is",
  wats: "what is",
  whatsup: "what is up",
  wassup: "what is up",
  hows: "how is",
  whos: "who is",
  wheres: "where is",
  im: "i am",
  ive: "i have",
  dont: "do not",
  cant: "can not",
  wont: "will not",
  isnt: "is not",
  doesnt: "does not",
  didnt: "did not",
  edu: "education",
  exp: "experience",
  proj: "project",
  projs: "projects",
  prj: "project",
  thx: "thanks",
  thnx: "thanks",
  tnx: "thanks",
  thanx: "thanks",
  thnks: "thanks",
  ty: "thanks",
  thankyou: "thank you",
  ya: "you",
  yea: "yes",
  yeah: "yes",
  yep: "yes",
  yup: "yes",
  k: "ok",
  kk: "ok",
  okay: "ok",
  hv: "have",
  hav: "have",
  abt: "about",
  bout: "about",
  hw: "how",
  cuz: "because",
  gonna: "going to",
  wanna: "want to",
  lemme: "let me",
  gimme: "give me",
  cv: "resume",
  cert: "certificate",
  certs: "certificates",
  uni: "university",
  info: "information",
  dev: "developer",
  devs: "developers",
  ppl: "people",
  cya: "see you",
  seeya: "see you",
  gud: "good",
  hii: "hi",
  heyy: "hey",
  hiya: "hi",
  n: "and",
};

export const STOPWORDS: ReadonlySet<string> = new Set(
  (
    "a an the is are am was were be been being to of in on at for and or but it its this that these those " +
    "me my mine i you your yours he she him her they them their we us our do does did done can could would " +
    "will shall should may might please so just with about there here what who whom whose when where why how " +
    "which any some if then than too very also as by from into up out not no yes ok tell show give let get " +
    "have has had want like need much many one"
  ).split(" "),
);

/** Lowercase, strip diacritics, strip punctuation, protect tech names such as C++ or Node.js. */
export function normalizeBase(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’‘´`]/g, "")
    .replace(/\bc\+\+/g, "cpp")
    .replace(/\bc#/g, "csharp")
    .replace(/\bci\s*\/\s*cd\b/g, "cicd")
    .replace(/\.net\b/g, "dotnet")
    .replace(/\b([a-z0-9]+)\.js\b/g, "$1js")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/(\p{L})\1{2,}/gu, "$1$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same as normalizeBase, but with chat slang expanded. */
export function normalize(input: string): string {
  const base = normalizeBase(input);
  if (!base) return "";
  return base
    .split(" ")
    .map((t) => SLANG[t] ?? t)
    .join(" ");
}

export function tokenize(norm: string): string[] {
  return norm ? norm.split(" ") : [];
}

export function contentTokens(tokens: string[]): string[] {
  return tokens.filter((t) => !STOPWORDS.has(t));
}

/** Damerau-Levenshtein (optimal string alignment): insert, delete, replace, transpose. */
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (!la) return lb;
  if (!lb) return la;
  const d: number[][] = [];
  for (let i = 0; i <= la; i++) {
    d.push(new Array<number>(lb + 1).fill(0));
    d[i][0] = i;
  }
  for (let j = 0; j <= lb; j++) d[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[la][lb];
}

/**
 * Fuzzy equality. Tokens of 3 letters or fewer must match exactly.
 * Distance <= 1 when the shorter word has <= 5 letters (and the first letter agrees), otherwise <= 2.
 */
export function fuzzyMatch(token: string, target: string): boolean {
  if (token === target) return true;
  const min = Math.min(token.length, target.length);
  if (min < 4) return false;
  const allowed = min <= 5 ? 1 : 2;
  if (Math.abs(token.length - target.length) > allowed) return false;
  if (min <= 5 && token[0] !== target[0]) return false;
  return damerauLevenshtein(token, target) <= allowed;
}

/** Small, fast, seedable PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True when most letters are not Latin (for example Nepali/Devanagari input). */
export function isMostlyNonLatin(input: string): boolean {
  const letters = input.match(/\p{L}/gu);
  if (!letters || letters.length === 0) return false;
  const nonLatin = letters.filter((ch) => !/\p{Script=Latin}/u.test(ch)).length;
  return nonLatin > letters.length / 2;
}
