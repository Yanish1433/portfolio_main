import { test } from "node:test";
import assert from "node:assert/strict";
import { chapterIndex, chapterOfView, dragProgress, easeTurn, hashForPage, hashToPage, leafAngle, riffleCount, shouldComplete, spreadsBetween, viewStart } from "./nav";
import type { PageMeta } from "./nav";

const pages: PageMeta[] = [
  { id: "contents", chapter: "contents", title: "Contents" },
  { id: "about", chapter: "about", title: "About" },
  { id: "barber-on-demand", chapter: "projects", title: "Barber" },
  { id: "barber-on-demand-2", chapter: "projects", title: "Barber 2" },
  { id: "goldstar-3d", chapter: "projects", title: "Goldstar" },
  { id: "skills", chapter: "skills", title: "Skills" },
  { id: "journey", chapter: "journey", title: "Journey" },
  { id: "contact", chapter: "contact", title: "Contact" },
  { id: "back", chapter: "back", title: "Back" },
];

test("chapterIndex finds the first page of a chapter", () => {
  assert.equal(chapterIndex(pages, "projects"), 2);
  assert.equal(chapterIndex(pages, "contact"), 7);
  assert.equal(chapterIndex(pages.slice(0, 2), "contact"), -1);
});

test("hashToPage: chapters, project ids, case, junk", () => {
  assert.equal(hashToPage("#about", pages), 1);
  assert.equal(hashToPage("#projects", pages), 2);
  assert.equal(hashToPage("#goldstar-3d", pages), 4);
  assert.equal(hashToPage("#Skills", pages), 5);
  assert.equal(hashToPage("#journey", pages), 6);
  assert.equal(hashToPage("#contact", pages), 7);
  assert.equal(hashToPage("#contents", pages), 0);
  assert.equal(hashToPage("", pages), null);
  assert.equal(hashToPage("#", pages), null);
  assert.equal(hashToPage("#nope", pages), null);
  assert.equal(hashToPage("#%E0%A4%A", pages), null);
});

test("hashForPage round-trips through hashToPage", () => {
  pages.forEach((p, i) => {
    const back = hashToPage(hashForPage(p), pages);
    assert.ok(back !== null);
    assert.equal(pages[back as number].chapter, p.chapter);
    if (p.id === "barber-on-demand" || p.id === "goldstar-3d") assert.equal(back, i);
  });
});

test("chapterOfView follows the first page of the view", () => {
  assert.equal(chapterOfView(pages, 4), "projects");
  assert.equal(chapterOfView(pages, 99), "back");
  assert.equal(chapterOfView(pages, -3), "contents");
});

test("views and riffles", () => {
  assert.equal(viewStart(5, 2), 4);
  assert.equal(viewStart(5, 1), 5);
  assert.equal(spreadsBetween(0, 6, 2), 3);
  assert.equal(spreadsBetween(6, 0, 2), 3);
  assert.equal(riffleCount(0, 2, 2), 0);
  assert.equal(riffleCount(0, 6, 2), 2);
  assert.equal(riffleCount(0, 400, 2), 5);
  assert.equal(riffleCount(3, 3, 1), 0);
});

test("leafAngle: front rises to 90, back lands to 0", () => {
  assert.deepEqual(leafAngle(0), { face: "front", deg: 0, theta: 0 });
  assert.equal(leafAngle(0.25).face, "front");
  assert.equal(leafAngle(0.25).deg, 45);
  assert.equal(leafAngle(0.5).deg, 90);
  assert.equal(leafAngle(0.75).face, "back");
  assert.equal(leafAngle(0.75).deg, 45);
  assert.equal(leafAngle(1).deg, 0);
  assert.equal(leafAngle(-1).theta, 0);
  assert.equal(leafAngle(9).theta, 180);
});

test("drag: follows the pointer, completes past halfway or on a flick, else springs back", () => {
  assert.equal(dragProgress(0, 300), 0);
  assert.ok(Math.abs(dragProgress(-135, 300) - 0.5) < 0.01);
  assert.equal(dragProgress(5000, 300), 1);
  assert.equal(shouldComplete(0.6), true);
  assert.equal(shouldComplete(0.4), false);
  assert.equal(shouldComplete(0.2, 1), true);
  assert.equal(shouldComplete(0.02, 5), false);
});

test("easeTurn runs 0 to 1 and is monotone", () => {
  assert.equal(easeTurn(0), 0);
  assert.equal(easeTurn(1), 1);
  let prev = 0;
  for (let i = 1; i <= 20; i++) {
    const v = easeTurn(i / 20);
    assert.ok(v >= prev);
    prev = v;
  }
});
