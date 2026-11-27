import { test } from "node:test";
import assert from "node:assert/strict";
import { blockKind, BLOCK_SIZE, dioramaBlocks, MAX_BLOCKS, posterUrl, screenPose, videoStateFor, videoUrl } from "./showcaseView";

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

test("videoStateFor: plays only on a stand's ring (+0.3 m), one at a time", () => {
  const stands = [
    { key: "a", ring: [0, 0] as [number, number] },
    { key: "b", ring: [3, 0] as [number, number] },
  ];
  assert.equal(videoStateFor([0, 0], stands), "a");
  assert.equal(videoStateFor([0.79, 0], stands), "a");
  assert.equal(videoStateFor([0.85, 0], stands), null);
  assert.equal(videoStateFor([5, 5], stands), null);
  assert.equal(videoStateFor([3, 0.2], stands), "b");
  assert.equal(videoStateFor([0, 0], []), null);
  // overlapping rings: the nearer one wins
  assert.equal(videoStateFor([1.4, 0], [{ key: "x", ring: [1, 0] }, { key: "y", ring: [1.6, 0] }]), "y");
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
