// Guestbook helpers (pure: no React, no three). Visitor notes live in Supabase and only show once the
// captain has approved them. We talk to the REST endpoint with fetch (no SDK). Every check here is cosmetic:
// the real protection is the database (RLS, column grants, CHECKs, flood trigger; see the step report).

export const NAME_MAX = 40;
export const MESSAGE_MAX = 140;
export const MAX_NOTES = 30;
export const COOLDOWN_MS = 10 * 60 * 1000;
export const CACHE_MS = 5 * 60 * 1000;
export const COOLDOWN_KEY = "guestbook-last-note";

export type Note = { name: string; message: string; created_at?: string };
export type Config = { url: string; key: string };
export type Result = { ok: true } | { ok: false; error: string };

/** Read at call time, but via literal `process.env.NEXT_PUBLIC_*` so Next inlines them at build time. */
export function getConfig(): Config | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

// Cc controls, bidi marks and zero-width characters. ZWNJ/ZWJ (U+200C/D) stay: Devanagari conjuncts and emoji need them.
// Ranges as code points (written as numbers so no invisible character sits in the source).
const STRIP_RANGES: [number, number][] = [[0, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x200b, 0x200b], [0x200e, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], [0x2066, 0x206f], [0xfeff, 0xfeff]];
const isStripped = (cp: number) => STRIP_RANGES.some(([a, b]) => cp >= a && cp <= b);

/** NFC, drop control / zero-width characters, collapse whitespace, trim. */
export function sanitize(s: unknown): string {
  if (typeof s !== "string") return "";
  let out = "";
  for (const ch of s.normalize("NFC")) out += isStripped(ch.codePointAt(0)!) ? " " : ch;
  return out.replace(/\s+/g, " ").trim();
}

/** Length in characters (code points, so an emoji counts once). */
export const len = (s: string) => Array.from(s).length;

const LINK = /(https?:|ftp:|www\.|:\/\/|@\S|\b[a-z0-9-]+\.(com|net|org|io|co|me|ly|app|dev|xyz|info|biz|np|gg|tv|ru|cn|top|link|site|online)\b)/i;
const BAD = ["fuck", "shit", "bitch", "asshole", "cunt", "dickhead", "bastard", "slut", "whore", "nigger", "nigga", "faggot", "porn", "rape", "madarchod", "machikne", "randi", "muji", "lauda", "raand"];
const LOOKALIKE: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", $: "s", "@": "a", "!": "i", "*": "u" };
// Look-alikes ("sh1t", "f*ck") are mapped to letters, then whole words are matched by prefix (so "Scunthorpe" and
// "assist" pass). Runs of single letters ("f u c k") are joined first.
const words = (s: string) => {
  const t = s.toLowerCase().replace(/[01345$@!*]/g, (c) => LOOKALIKE[c] ?? c).split(/[^a-z]+/).filter(Boolean);
  const out: string[] = [];
  let run = "";
  for (const w of t) {
    if (w.length === 1) run += w;
    else {
      if (run) {
        out.push(run);
        run = "";
      }
      out.push(w);
    }
  }
  if (run) out.push(run);
  return out;
};

export const hasLink = (s: string) => LINK.test(s);
export const hasProfanity = (s: string) => {
  return words(s).some((t) => BAD.some((w) => t.startsWith(w)));
};

export type Checked = { ok: true; name: string; message: string } | { ok: false; error: string };

/** Client-side validation. Returns the sanitised values to send. */
export function validate(nameRaw: unknown, messageRaw: unknown): Checked {
  const name = sanitize(nameRaw);
  const message = sanitize(messageRaw);
  if (!name) return { ok: false, error: "Please add your name." };
  if (!message) return { ok: false, error: "Please write a short note." };
  if (len(name) > NAME_MAX) return { ok: false, error: `Name is too long (max ${NAME_MAX}).` };
  if (len(message) > MESSAGE_MAX) return { ok: false, error: `Note is too long (max ${MESSAGE_MAX}).` };
  if (hasLink(name) || hasLink(message)) return { ok: false, error: "Links aren't allowed in a note." };
  if (hasProfanity(name) || hasProfanity(message)) return { ok: false, error: "Please keep it kind: no rude words." };
  return { ok: true, name, message };
}

/** Milliseconds left on the cooldown (0 = free to post). A timestamp from the future (clock change) is ignored. */
export function cooldownLeft(last: number | null, now: number, windowMs = COOLDOWN_MS): number {
  if (last === null || !Number.isFinite(last) || last > now) return 0;
  return Math.max(0, last + windowMs - now);
}

export function readLast(): number | null {
  try {
    const v = Number(window.localStorage.getItem(COOLDOWN_KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}
export function writeLast(now: number) {
  try {
    window.localStorage.setItem(COOLDOWN_KEY, String(now));
  } catch {
    /* storage blocked: the server-side limits still apply */
  }
}

export const minutes = (ms: number) => Math.max(1, Math.ceil(ms / 60000));

const headers = (c: Config) => ({ apikey: c.key, Authorization: `Bearer ${c.key}` });

/** Defensive parse of the GET response: only name + message strings, sanitised, capped. */
export function parseNotes(json: unknown): Note[] {
  if (!Array.isArray(json)) return [];
  const out: Note[] = [];
  for (const r of json) {
    if (!r || typeof r !== "object") continue;
    const name = sanitize((r as Note).name);
    const message = sanitize((r as Note).message);
    if (!name || !message) continue;
    const created = (r as Note).created_at;
    out.push({
      name: Array.from(name).slice(0, NAME_MAX).join(""),
      message: Array.from(message).slice(0, MESSAGE_MAX).join(""),
      created_at: typeof created === "string" ? created : undefined,
    });
    if (out.length >= MAX_NOTES) break;
  }
  return out;
}

/** Approved notes, newest first. Never throws: any problem gives []. Explicit columns only (no select=*). */
export async function fetchNotes(config: Config | null = getConfig(), f: typeof fetch = fetch): Promise<Note[]> {
  if (!config) return [];
  try {
    const res = await f(`${config.url}/rest/v1/guestbook?select=name,message,created_at&approved=eq.true&order=created_at.desc&limit=${MAX_NOTES}`, { headers: headers(config) });
    if (!res.ok) return [];
    return parseNotes(await res.json());
  } catch {
    return [];
  }
}

/** Send one note (it arrives unapproved: the database decides that, not us). */
export async function postNote(name: string, message: string, config: Config | null = getConfig(), f: typeof fetch = fetch): Promise<Result> {
  if (!config) return { ok: false, error: "The guestbook isn't open right now." };
  try {
    const res = await f(`${config.url}/rest/v1/guestbook`, {
      method: "POST",
      headers: { ...headers(config), "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ name, message }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: res.status === 429 || res.status >= 500 ? "The guestbook is busy. Please try again in a little while." : "Couldn't send your note. Please check it and try again." };
  } catch {
    return { ok: false, error: "Couldn't reach the guestbook. Please check your connection and try again." };
  }
}

/** A 5-minute in-memory cache around fetchNotes (one fetch per page load unless forced). */
export function createCache(load: () => Promise<Note[]>, ttl = CACHE_MS, clock: () => number = Date.now) {
  let at = -Infinity;
  let value: Note[] = [];
  let pending: Promise<Note[]> | null = null;
  return async (force = false): Promise<Note[]> => {
    if (!force && clock() - at < ttl) return value;
    if (pending) return pending;
    pending = load()
      .then((v) => {
        value = v;
        at = clock();
        return v;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}
