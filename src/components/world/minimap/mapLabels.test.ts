import { test } from "node:test";
import assert from "node:assert/strict";
import { boundsFor, CHIP_BG, chipSize, contrast, LABEL_INK, placeLabels, shortLabel } from "./mapLabels";
import { ZONE_TARGETS } from "./mapData";

const anchors = ZONE_TARGETS.map((t) => ({ id: t.id, x: t.x, y: t.y, text: shortLabel(t.name) }));

for (const [size, font, spill] of [[180, 12, 40], [120, 12, 100], [420, 14, 0]] as const) {
  test(`labels at ${size}px do not overlap and stay in bounds`, () => {
    const b = boundsFor(size, spill);
    const out = placeLabels(anchors, size, font, b);
    assert.equal(out.length, anchors.length);
    for (const o of out) {
      assert.ok(o.x >= b.x && o.y >= b.y && o.x + o.w <= b.x + b.w && o.y + o.h <= b.y + b.h, `${o.id} out of bounds`);
    }
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const c = out[j];
        const hit = a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h;
        assert.ok(!hit, `${a.id} overlaps ${c.id}`);
      }
  });
}

test("label text is at least 4.5:1 against the chip paper", () => {
  assert.ok(contrast(LABEL_INK, CHIP_BG) >= 4.5);
  assert.ok(contrast("#fbe9b7", "#3e2416") >= 4.5); // caption / button
});

test("short labels drop the bracket and chips grow with the text", () => {
  assert.equal(shortLabel("About (Ghar)"), "About");
  assert.ok(chipSize("Education", 12).w > chipSize("Skills", 12).w);
});
