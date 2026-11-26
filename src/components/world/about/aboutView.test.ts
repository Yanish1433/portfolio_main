import assert from "node:assert/strict";
import { test } from "node:test";
import { gharHint, ctaPlan, ctaState, initials, introLine, takeOnce } from "./aboutView";

const links = { github: "https://g", linkedin: "#", email: "#", resumeUrl: "#" };

test("ctaState: placeholders are 'soon', real links are links", () => {
  for (const h of ["#", "", "  ", undefined, null]) assert.equal(ctaState(h).kind, "soon");
  assert.deepEqual(ctaState("https://x.dev"), { kind: "link", href: "https://x.dev", external: true });
  assert.deepEqual(ctaState("mailto:a@b.c"), { kind: "link", href: "mailto:a@b.c", external: false });
});

test("ctaPlan: Contact/Hire walk to the mailbox, resume needs a real url", () => {
  assert.equal(ctaPlan({ label: "Contact", href: "#" }, links).type, "walkMailbox");
  assert.equal(ctaPlan({ label: "Hire me", href: "" }, links).type, "walkMailbox");
  assert.equal(ctaPlan({ label: "Download resume", href: "#" }, links).type, "soon");
  assert.equal(ctaPlan({ label: "Download resume", href: "#" }, { ...links, resumeUrl: "/cv.pdf" }).type, "resume");
  assert.equal(ctaPlan({ label: "Contact", href: "mailto:a@b.c" }, links).type, "link");
});

test("initials and introLine", () => {
  assert.equal(initials("Yanish Gurung"), "YG");
  assert.equal(initials("Sam"), "S");
  assert.equal(introLine({ name: "Yanish Gurung", title: "Full-Stack Developer", location: "Placeholder City, Country" }), "Welcome to Yanish's Ghar! Yanish is a Full-Stack Developer.");
  assert.match(introLine({ name: "Yanish Gurung", title: "Full-Stack Developer", location: "Pokhara, Nepal" }), /based in Pokhara, Nepal/);
  assert.doesNotMatch(introLine({ name: "Yanish Gurung", title: "Placeholder", location: "Placeholder" }), /Placeholder|\b(he|she|his|her)\b/i);
});

test("gharHint uses the name, never a pronoun", () => {
  assert.equal(gharHint("Yanish Gurung"), "This is Yanish's home. Walk in to meet Yanish.");
});

test("takeOnce: true once, then false; blocked storage never throws", () => {
  const m = new Map<string, string>();
  const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  assert.equal(takeOnce("k", st), true);
  assert.equal(takeOnce("k", st), false);
  const bad = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
  assert.doesNotThrow(() => takeOnce("k", bad));
});
