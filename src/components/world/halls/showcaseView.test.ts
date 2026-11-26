import { test } from "node:test";
import assert from "node:assert/strict";
import { blockKind, BLOCK_SIZE, dioramaBlocks, MAX_BLOCKS, flowSentence, formatMetric, groupStack, parseMetric, pickLiveScreen, posterUrl, screenPose, videoUrl } from "./showcaseView";

test("parseMetric splits prefix, number and suffix and formats back to the original", () => {
  for (const v of ["40", "1.2k", "-30%", "$4,000", "99.95%", "+12", "3x", "2,500+"]) {
    const p = parseMetric(v);
    assert.ok(p, v);
    assert.equal(formatMetric(p, p.num), v, v);
  }
  assert.deepEqual(parseMetric("1.2k"), { prefix: "", num: 1.2, decimals: 1, suffix: "k", grouped: false });
  assert.deepEqual(parseMetric("-30%"), { prefix: "-", num: 30, decimals: 0, suffix: "%", grouped: false });
  assert.equal(formatMetric(parseMetric("$4,000")!, 1234.4), "$1,234");
  assert.equal(parseMetric("n/a"), null);
  assert.equal(parseMetric(""), null);
});

test("groupStack groups the stack in plain words, languages last-seen as Languages", () => {
  assert.deepEqual(groupStack(["Next.js", "TypeScript", "PostgreSQL", "Stripe"]), [
    { group: "Website", items: ["Next.js"] },
    { group: "Languages", items: ["TypeScript"] },
    { group: "Database", items: ["PostgreSQL"] },
    { group: "Payments", items: ["Stripe"] },
  ]);
  assert.deepEqual(groupStack(["React", "Tailwind CSS"]), [{ group: "Website", items: ["React", "Tailwind CSS"] }]);
  assert.deepEqual(groupStack(["Kafka"]), [{ group: "Other", items: ["Kafka"] }]);
  assert.deepEqual(groupStack([]), []);
});

test("flowSentence reads the diagram in plain words", () => {
  assert.equal(
    flowSentence([{ label: "Website" }, { label: "Server" }, { label: "Database" }]),
    "A visitor's click on the website travels to the server, then the database.",
  );
  assert.equal(flowSentence([{ label: "Server" }, { label: "Database" }]), "A visitor's request starts at the server, then travels to the database.");
  assert.equal(
    flowSentence([{ label: "Website" }, { label: "Server" }, { label: "Database" }, { label: "Payments" }]),
    "A visitor's click on the website travels to the server, then the database, then payments.",
  );
  assert.equal(flowSentence([{ label: "Website" }]), "Everything runs in one place: the website.");
  assert.equal(flowSentence([]), "");
});

test("posterUrl follows the documented fallback order", () => {
  const files = { showcasePosters: new Set(["b"]), thumbs: new Set(["b", "c"]) };
  assert.equal(posterUrl({ id: "a", media: { poster: "/x.webp" } }, files), "/x.webp");
  assert.equal(posterUrl({ id: "b" }, files), "/showcase/b/poster.webp");
  assert.equal(posterUrl({ id: "c" }, files), "/projects/c.webp");
  assert.equal(posterUrl({ id: "d" }, files), null);
});

test("videoUrl accepts mp4 and webm from media.video, then demoVideo", () => {
  assert.equal(videoUrl({ media: { video: "/showcase/a/demo.webm" }, demoVideo: null }), "/showcase/a/demo.webm");
  assert.equal(videoUrl({ media: {}, demoVideo: "/v/demo.mp4" }), "/v/demo.mp4");
  assert.equal(videoUrl({ demoVideo: "#" }), null);
  assert.equal(videoUrl({ media: { video: "/showcase/a/poster.webp" }, demoVideo: null }), null);
});

test("screenPose stands in front of the screen and fits it", () => {
  const { pos, look } = screenPose({ x: 2, y: 1.4, z: -13, w: 1.36, h: 1.05 }, 45, 16 / 10);
  assert.deepEqual(look, [2, 1.4, -13]);
  assert.equal(pos[0], 2);
  assert.equal(pos[1], 1.4);
  const d = pos[2] + 13;
  const halfV = Math.tan((45 * Math.PI) / 360);
  assert.ok(d * halfV >= 1.05 / 2 && d * halfV * 1.6 >= 1.36 / 2, "screen fits");
  // narrow (phone) aspect: width decides, so the camera stands further back
  const phone = screenPose({ x: 0, y: 1.4, z: 0, w: 1.36, h: 1.05 }, 45, 0.5);
  assert.ok(phone.pos[2] > d);
});

test("pickLiveScreen: nearest on-screen stand within range, else none", () => {
  const list = [
    { id: "a", dist: 3, onScreen: true },
    { id: "b", dist: 2, onScreen: false },
    { id: "c", dist: 5.5, onScreen: true },
  ];
  assert.equal(pickLiveScreen(list, 6), "a");
  assert.equal(pickLiveScreen(list, 2.5), null);
  assert.equal(pickLiveScreen([], 6), null);
});

test("blockKind maps plain layers to Newari buildings", () => {
  assert.equal(blockKind("Website"), "shop");
  assert.equal(blockKind("Server"), "pagoda");
  assert.equal(blockKind("Database"), "granary");
  assert.equal(blockKind("Payments"), "house");
  assert.equal(blockKind("Live link"), "house");
  assert.equal(blockKind("AI helper"), "house");
});

test("dioramaBlocks spreads blocks in order, inside the plinth, without overlap", () => {
  const layers = ["Website", "Server", "Database", "Payments"].map((label) => ({ label, tech: label + " tech" }));
  const b = dioramaBlocks(layers, 1.2);
  assert.deepEqual(b.map((k) => k.kind), ["shop", "pagoda", "granary", "house"]);
  for (let i = 1; i < b.length; i++) assert.ok(b[i].x - b[i - 1].x >= BLOCK_SIZE * b[i].s, "no overlap");
  assert.ok(b[0].x - (BLOCK_SIZE * b[0].s) / 2 >= -0.6 && b[3].x + (BLOCK_SIZE * b[3].s) / 2 <= 0.6, "inside");
  assert.ok(Math.abs(b[0].x + b[3].x) < 1e-9, "centred");
  assert.deepEqual(dioramaBlocks([], 1.2), []);
});

test("dioramaBlocks folds extra layers into a last '+N more' block", () => {
  const layers = Array.from({ length: 8 }, (_, i) => ({ label: `L${i}`, tech: "t" }));
  const b = dioramaBlocks(layers, 1.2);
  assert.equal(b.length, MAX_BLOCKS);
  assert.equal(b[MAX_BLOCKS - 1].label, "+4 more");
  assert.ok(b.every((k) => k.s >= 0.6));
});
