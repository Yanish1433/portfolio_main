// Procedural trees (step9b): deterministic, within the triangle budget, cards inside their crown, leaf atlas sane.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { TREES } from "../zones";
import { chautariLeaves } from "./placesGeo";
import { growTree, leafAtlasPixels, leafGeometry, TOWN_TREE_KINDS, type TreeId } from "./trees";

const IDS: TreeId[] = ["peepal", "broadleaf", "ashoka", "chautari"];

const hash = (a: ArrayLike<number>) => {
  let h = 2166136261;
  for (let i = 0; i < a.length; i++) h = Math.imul(h ^ Math.round(a[i] * 1e4), 16777619) >>> 0;
  return h;
};
const signature = (t: ReturnType<typeof growTree>) => [hash(t.bark.attributes.position.array), hash(t.bark.attributes.color.array), hash(t.cards.flatMap((c) => [c.c.x, c.c.y, c.c.z, c.col.r, c.u.x]))];

test("trees are deterministic (seeded, no Math.random)", () => {
  const real = Math.random;
  // three.js itself uses Math.random for object ids; a changing stub proves OUR output never depends on it
  let spin = 0.123;
  Math.random = () => (spin = (spin * 9301 + 0.49297) % 1);
  try {
    for (const id of IDS) assert.deepEqual(signature(growTree(id, 3)), signature(growTree(id, 3)), id);
  } finally {
    Math.random = real;
  }
  assert.notDeepEqual(signature(growTree("peepal", 1)), signature(growTree("peepal", 2)));
});

test("triangle counts per tree stay inside the step9b budget", () => {
  const rows: string[] = [];
  const cap: Record<TreeId, { bark: number; cards: number }> = {
    peepal: { bark: 650, cards: 300 },
    broadleaf: { bark: 650, cards: 280 },
    ashoka: { bark: 650, cards: 240 },
    chautari: { bark: 2000, cards: 950 },
  };
  for (const id of IDS) {
    const t = growTree(id, 3);
    rows.push(`${id}: bark ${t.barkTris} tris, ${t.cards.length} cards (${t.cards.length * 2} tris)`);
    assert.ok(t.barkTris <= cap[id].bark, `${id} bark ${t.barkTris} > ${cap[id].bark}`);
    assert.ok(t.cards.length <= cap[id].cards, `${id} cards ${t.cards.length} > ${cap[id].cards}`);
  }
  // worst view (zoom 36, everything in frame): bark is in the shadow-casting wood bucket (drawn twice), the chautari leaves too
  let est = 0;
  for (const k of TOWN_TREE_KINDS) est += growTree(k, 3).barkTris * 2 + growTree(k, 3).cards.length * 2;
  const ch = growTree("chautari", 3);
  est += ch.barkTris * 2 + ch.cards.length * 4;
  rows.push(`worst-view estimate (4 town trees as listed + chautari, incl. shadow pass): ${est} tris`);
  if (process.env.TREES) console.log("\n" + rows.join("\n"));
  assert.ok(est <= 17000, `trees cost ${est} tris at the worst view`);
});

test("leaf cards sit inside their crown and the geometry is well formed", () => {
  for (const id of IDS) {
    const t = growTree(id, 3);
    for (const c of t.cards) {
      const r = Math.hypot(c.c.x / t.crown.rx, (c.c.y - t.crown.cy) / t.crown.ry, c.c.z / t.crown.rx);
      assert.ok(r <= 1.06, `${id}: card outside the crown (${r.toFixed(2)})`);
      assert.ok(Math.abs(c.n.length() - 1) < 1e-3 && Math.abs(c.u.length() - 1) < 1e-3 && Math.abs(c.n.dot(c.u)) < 1e-3);
    }
  }
  const g = leafGeometry(TREES.map(([x, z, s], i) => ({ tree: growTree(TOWN_TREE_KINDS[i], 3), x, y: 0, z, rot: i, scale: s })));
  const n = g.attributes.position.count;
  for (const k of ["normal", "color", "uv", "aCentre", "aFlut"]) assert.equal(g.attributes[k].count, n, k);
  assert.equal(g.index!.count, (n / 4) * 6);
  for (let i = 0; i < g.attributes.uv.count; i++) assert.ok(g.attributes.uv.getX(i) >= 0 && g.attributes.uv.getX(i) <= 1 && g.attributes.uv.getY(i) >= 0 && g.attributes.uv.getY(i) <= 1);
  assert.ok(chautariLeaves().attributes.position.count > 0);
});

test("the trunk is tapered and the bark has vertex-colour noise", () => {
  for (const id of IDS) {
    const t = growTree(id, 3);
    assert.ok(t.trunkRadiusAt(0) > t.trunkRadiusAt(1) * 1.1, `${id} has no root flare/taper`);
    const col = t.bark.attributes.color;
    let lo = 9;
    let hi = 0;
    for (let i = 0; i < col.count; i++) {
      lo = Math.min(lo, col.getX(i));
      hi = Math.max(hi, col.getX(i));
    }
    assert.ok(hi / lo > 1.15, `${id} bark colour is flat`);
    const bb = new THREE.Box3().setFromBufferAttribute(t.bark.attributes.position as THREE.BufferAttribute);
    assert.ok(bb.min.y > -0.3 && bb.max.y <= t.height + 0.3, `${id} bark extents ${bb.min.y.toFixed(2)}..${bb.max.y.toFixed(2)}`);
  }
});

test("leaf atlas: four cells, each partly transparent (alpha-cut, not a solid square)", () => {
  const S = 512;
  const px = leafAtlasPixels(S);
  assert.equal(px.length, S * S * 4);
  for (let cell = 0; cell < 4; cell++) {
    let solid = 0;
    const x0 = (cell % 2) * (S / 2);
    const y0 = Math.floor(cell / 2) * (S / 2);
    for (let y = 0; y < S / 2; y++) for (let x = 0; x < S / 2; x++) if (px[((y0 + y) * S + x0 + x) * 4 + 3] > 107) solid++;
    const frac = solid / ((S / 2) * (S / 2));
    assert.ok(frac > 0.12 && frac < 0.6, `cell ${cell} coverage ${frac.toFixed(2)}`);
    // the gutter around each cell stays empty so mip levels do not bleed between cells
    assert.equal(px[((y0 + 1) * S + x0 + 1) * 4 + 3], 0);
  }
});
