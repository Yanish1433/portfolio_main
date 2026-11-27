import assert from "node:assert/strict";
import { test } from "node:test";
import { cooldownLeft, createCache, fetchNotes, hasLink, hasProfanity, parseNotes, postNote, sanitize, validate, type Config } from "./guestbook";

const cfg: Config = { url: "https://x.supabase.co", key: "k" };

test("sanitize: NFC, strips control and zero-width, keeps Devanagari and emoji", () => {
  assert.equal(sanitize("  a​b\u0000c \n d  "), "a b c d");
  assert.equal(sanitize("é"), "é");
  assert.equal(sanitize("नमस्ते 🙏"), "नमस्ते 🙏");
  assert.equal(sanitize("क्‍ष"), "क्‍ष");
  assert.equal(sanitize(42), "");
});

test("validate: lengths, links, profanity", () => {
  assert.equal(validate("", "hi").ok, false);
  assert.equal(validate("Sam", "").ok, false);
  assert.equal(validate("x".repeat(41), "hi").ok, false);
  assert.equal(validate("x".repeat(40), "y".repeat(140)).ok, true);
  assert.equal(validate("Sam", "y".repeat(141)).ok, false);
  assert.equal(validate("Sam", "see www.spam.biz").ok, false);
  assert.equal(validate("Sam", "visit spam.com now").ok, false);
  assert.equal(validate("Sam", "https://a").ok, false);
  assert.equal(validate("Sam", "mail me me@x").ok, false);
  assert.equal(validate("Sam", "f u c k").ok, false);
  assert.equal(validate("Sam", "sh1t site").ok, false);
  const ok = validate("  Sita ", "Lovely town! नमस्ते 🙏");
  assert.deepEqual(ok, { ok: true, name: "Sita", message: "Lovely town! नमस्ते 🙏" });
  assert.ok(!hasLink("Great work, really.") && !hasProfanity("Classic, assist, Scunthorpe"));
});

test("emoji count once toward the limit", () => {
  assert.equal(validate("Sam", "🙏".repeat(140)).ok, true);
  assert.equal(validate("Sam", "🙏".repeat(141)).ok, false);
});

test("cooldown: 10 minutes per browser", () => {
  const now = 1_000_000_000;
  assert.equal(cooldownLeft(null, now), 0);
  assert.equal(cooldownLeft(now - 60_000, now), 9 * 60_000);
  assert.equal(cooldownLeft(now - 10 * 60_000, now), 0);
  assert.equal(cooldownLeft(now + 5000, now), 0, "future timestamp ignored");
});

test("parseNotes keeps only clean name + message, capped at 30", () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ name: `n${i}`, message: `m${i}`, extra: "x" }));
  const got = parseNotes([...rows, null, { name: 1 }]);
  assert.equal(got.length, 30);
  assert.deepEqual(Object.keys(got[0]).sort(), ["created_at", "message", "name"]);
  assert.deepEqual(parseNotes("nope"), []);
});

test("fetchNotes: explicit columns + both headers; failures give []", async () => {
  let seen: { url: string; headers: Record<string, string> } | null = null;
  const f = (async (url: string, init: { headers: Record<string, string> }) => {
    seen = { url, headers: init.headers };
    return { ok: true, json: async () => [{ name: "A", message: "B" }] };
  }) as unknown as typeof fetch;
  assert.equal((await fetchNotes(cfg, f)).length, 1);
  assert.ok(seen!.url.includes("select=name,message,created_at&approved=eq.true") && !seen!.url.includes("select=*"));
  assert.deepEqual(seen!.headers, { apikey: "k", Authorization: "Bearer k" });
  assert.deepEqual(await fetchNotes(null, f), []);
  assert.deepEqual(await fetchNotes(cfg, (async () => { throw new Error("offline"); }) as unknown as typeof fetch), []);
  assert.deepEqual(await fetchNotes(cfg, (async () => ({ ok: false })) as unknown as typeof fetch), []);
});

test("postNote sends only name + message with return=minimal (mock fetch, never a real POST)", async () => {
  let init: { method: string; headers: Record<string, string>; body: string } | null = null;
  const f = (async (_u: string, i: typeof init) => {
    init = i;
    return { ok: true, status: 201 };
  }) as unknown as typeof fetch;
  assert.deepEqual(await postNote("A", "B", cfg, f), { ok: true });
  assert.equal(init!.method, "POST");
  assert.equal(init!.headers.Prefer, "return=minimal");
  assert.deepEqual(JSON.parse(init!.body), { name: "A", message: "B" });
  const bad = await postNote("A", "B", cfg, (async () => ({ ok: false, status: 400 })) as unknown as typeof fetch);
  assert.equal(bad.ok, false);
  assert.equal((await postNote("A", "B", null, f)).ok, false);
});

test("cache: one fetch within 5 minutes, refetch after, force bypasses", async () => {
  let t = 0;
  let calls = 0;
  const get = createCache(async () => (calls++, [{ name: "a", message: "b" }]), 300_000, () => t);
  await get();
  await get();
  assert.equal(calls, 1);
  t = 299_000;
  await get();
  assert.equal(calls, 1);
  t = 301_000;
  await get();
  assert.equal(calls, 2);
  await get(true);
  assert.equal(calls, 3);
});
