// Procedural Canvas2D textures shared by the whole town. Nothing is loaded
// from the network: bricks, paving, tiles, lattice and wood are drawn here.
// Every texture tiles seamlessly; UVs in the geometry are in metres.
import * as THREE from "three";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 0..1 hash of a 2D point (used so wrapped bricks keep their colour). */
function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function canvas(w: number, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, seed: number, alpha = 0.08) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const v = r() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * r()})`;
    ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

function tex(c: HTMLCanvasElement, srgb: boolean, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Running-bond wall bricks: 1 texture = 1 m, 14 courses of 4 bricks. */
function brickWall() {
  const S = 512;
  const [c, ctx] = canvas(S);
  const [hc, hctx] = canvas(S);
  const rows = 14;
  const per = 4;
  const rh = S / rows;
  const bw = S / per;
  const mortar = 3;
  ctx.fillStyle = "#6e3a2c";
  ctx.fillRect(0, 0, S, S);
  hctx.fillStyle = "#3a3a3a";
  hctx.fillRect(0, 0, S, S);
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bw / 2 : 0;
    for (let b = -1; b < per; b++) {
      const x = b * bw + off;
      const h = hash2(((b + per) % per) + (r % 2) * 0.5, r);
      const l = 36 + h * 12;
      ctx.fillStyle = `hsl(${9 + h * 7}, ${52 + h * 10}%, ${l}%)`;
      ctx.fillRect(x + mortar / 2, r * rh + mortar / 2, bw - mortar, rh - mortar);
      // subtle face shading on each brick
      const g = ctx.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
      g.addColorStop(0, "rgba(255,220,190,0.10)");
      g.addColorStop(1, "rgba(40,10,0,0.14)");
      ctx.fillStyle = g;
      ctx.fillRect(x + mortar / 2, r * rh + mortar / 2, bw - mortar, rh - mortar);
      hctx.fillStyle = `rgb(${200 + h * 40},${200 + h * 40},${200 + h * 40})`;
      hctx.fillRect(x + mortar / 2, r * rh + mortar / 2, bw - mortar, rh - mortar);
    }
  }
  speckle(ctx, S, S, 2500, 7, 0.12);
  speckle(hctx, S, S, 1500, 8, 0.2);
  return { map: tex(c, true), bump: tex(hc, false) };
}

/**
 * Herringbone paving. Bricks are 2u x 1u; the pattern lattice is (1,1),(2,-2)
 * rotated 45°, so the canvas holds exactly 8 x 4 periods and wraps cleanly.
 * One texture = 8*sqrt(2)*0.11 m ≈ 1.24 m.
 */
export const HERRINGBONE_METRES = 8 * Math.SQRT2 * 0.11;
function herringbone() {
  const S = 512;
  const u = S / (8 * Math.SQRT2);
  const [c, ctx] = canvas(S);
  const [hc, hctx] = canvas(S);
  ctx.fillStyle = "#b89878";
  ctx.fillRect(0, 0, S, S);
  hctx.fillStyle = "#404040";
  hctx.fillRect(0, 0, S, S);
  const gap = 2.2;
  const cos = Math.SQRT1_2;
  const draw = (bx: number, by: number, w: number, h: number) => {
    // centre in canvas space, wrapped, decides the colour
    const cx = bx + w / 2;
    const cy = by + h / 2;
    const px = (((cx - cy) * cos) % S + S) % S;
    const py = (((cx + cy) * cos) % S + S) % S;
    const hsh = hash2(Math.round(px / 4), Math.round(py / 4));
    const l = 40 + hsh * 14;
    ctx.fillStyle = `hsl(${14 + hsh * 10}, ${30 + hsh * 12}%, ${l}%)`;
    ctx.fillRect(bx + gap / 2, by + gap / 2, w - gap, h - gap);
    hctx.fillStyle = `rgb(${195 + hsh * 50},${195 + hsh * 50},${195 + hsh * 50})`;
    hctx.fillRect(bx + gap / 2, by + gap / 2, w - gap, h - gap);
  };
  ctx.save();
  hctx.save();
  // canvas = R(+45°) * lattice space
  ctx.rotate(Math.PI / 4);
  hctx.rotate(Math.PI / 4);
  const span = Math.ceil((S * 1.5) / u);
  for (let k = -span; k <= span; k++) {
    for (let t = -span * 2; t <= span * 2; t++) {
      const ox = t + 2 * k;
      const oy = t - 2 * k;
      // skip bricks far outside the canvas
      const cx = (ox * cos - oy * cos) * u;
      const cy = (ox * cos + oy * cos) * u;
      if (cx < -3 * u || cx > S + 3 * u || cy < -3 * u || cy > S + 3 * u) continue;
      draw(ox * u, oy * u, 2 * u, u); // horizontal
      draw(ox * u, (oy + 1) * u, u, 2 * u); // vertical
    }
  }
  ctx.restore();
  hctx.restore();
  speckle(ctx, S, S, 3000, 21, 0.12);
  return { map: tex(c, true), bump: tex(hc, false) };
}

/** Irregular stone slabs: 1 texture = 2 m. */
function slabs() {
  const S = 512;
  const [c, ctx] = canvas(S);
  const [hc, hctx] = canvas(S);
  const r = rng(99);
  ctx.fillStyle = "#4a4641";
  ctx.fillRect(0, 0, S, S);
  hctx.fillStyle = "#202020";
  hctx.fillRect(0, 0, S, S);
  const heights = [118, 136, 128, 130];
  let y = 0;
  heights.forEach((h, ri) => {
    let x = (ri * 61) % 97;
    const lengths: number[] = [];
    let total = 0;
    while (total < S - 140) {
      const l = 110 + r() * 120;
      lengths.push(l);
      total += l;
    }
    lengths.push(S - total);
    for (const l of lengths) {
      const v = r();
      ctx.fillStyle = `hsl(${30 + v * 12}, ${6 + v * 6}%, ${55 + v * 12}%)`;
      hctx.fillStyle = `rgb(${190 + v * 60},${190 + v * 60},${190 + v * 60})`;
      for (const dx of [0, -S]) {
        ctx.fillRect(x + dx + 2, y + 2, l - 4, h - 4);
        hctx.fillRect(x + dx + 2, y + 2, l - 4, h - 4);
      }
      x += l;
    }
    y += h;
  });
  speckle(ctx, S, S, 5000, 5, 0.14);
  speckle(hctx, S, S, 3000, 6, 0.25);
  return { map: tex(c, true), bump: tex(hc, false) };
}

/** Jhingati-style roof tiles: 1 texture = 1 m (8 rows, fluted). */
function roofTiles() {
  const S = 256;
  const [c, ctx] = canvas(S);
  const [hc, hctx] = canvas(S);
  const rows = 8;
  const cols = 8;
  const rh = S / rows;
  const cw = S / cols;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const h = hash2(k, r);
      const x = k * cw + (r % 2 ? cw / 2 : 0);
      for (const dx of [0, -S]) {
        const g = ctx.createLinearGradient(x + dx, 0, x + dx + cw, 0);
        const l = 17 + h * 7;
        g.addColorStop(0, `hsl(14, 22%, ${l - 5}%)`);
        g.addColorStop(0.5, `hsl(16, 26%, ${l + 6}%)`);
        g.addColorStop(1, `hsl(14, 22%, ${l - 7}%)`);
        ctx.fillStyle = g;
        ctx.fillRect(x + dx, r * rh, cw, rh);
        const hg = hctx.createLinearGradient(x + dx, 0, x + dx + cw, 0);
        hg.addColorStop(0, "#202020");
        hg.addColorStop(0.5, "#e0e0e0");
        hg.addColorStop(1, "#202020");
        hctx.fillStyle = hg;
        hctx.fillRect(x + dx, r * rh, cw, rh);
      }
    }
    // overlap shadow at the lower lip of each row
    ctx.fillStyle = "rgba(20,8,4,0.45)";
    ctx.fillRect(0, (r + 1) * rh - 4, S, 4);
    hctx.fillStyle = "#000";
    hctx.fillRect(0, (r + 1) * rh - 3, S, 3);
  }
  speckle(ctx, S, S, 1200, 31, 0.1);
  return { map: tex(c, true), bump: tex(hc, false) };
}

/** Ankhi jhyal lattice: diagonal net of dark wood, transparent holes. */
function lattice() {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = "#3a2418";
  ctx.lineWidth = 7;
  const step = S / 6;
  for (let i = -6; i <= 12; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step + S, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i * step, S);
    ctx.lineTo(i * step + S, 0);
    ctx.stroke();
  }
  // carved little studs at the crossings
  ctx.fillStyle = "#5a3a26";
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 6; j++) {
      ctx.beginPath();
      ctx.arc(i * step, j * step, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const t = tex(c, true);
  return t;
}

/** Dark carved wood: grain + small carved panels (as bump). 1 texture = 0.5 m. */
function wood() {
  const S = 256;
  const [c, ctx] = canvas(S);
  const [hc, hctx] = canvas(S);
  const r = rng(4);
  ctx.fillStyle = "#c9b7a6";
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const x = r() * S;
    ctx.fillStyle = `rgba(60,35,20,${0.08 + r() * 0.12})`;
    ctx.fillRect(x, 0, 1 + r() * 2, S);
  }
  hctx.fillStyle = "#808080";
  hctx.fillRect(0, 0, S, S);
  // carved rosettes and panel grooves
  hctx.strokeStyle = "#303030";
  hctx.lineWidth = 4;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const cx = S / 4 + (i * S) / 2;
      const cy = S / 4 + (j * S) / 2;
      hctx.strokeRect(cx - S / 5, cy - S / 5, (S * 2) / 5, (S * 2) / 5);
      for (let p = 0; p < 8; p++) {
        const a = (p / 8) * Math.PI * 2;
        hctx.beginPath();
        hctx.ellipse(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14, 9, 4, a, 0, Math.PI * 2);
        hctx.stroke();
      }
      hctx.beginPath();
      hctx.arc(cx, cy, 6, 0, Math.PI * 2);
      hctx.stroke();
    }
  }
  return { map: tex(c, true), bump: tex(hc, false) };
}

/** Soft radial glow used by the additive light sprites. */
function glow() {
  const S = 64;
  const [c, ctx] = canvas(S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Banner cloth: plain with a darker hem and a pale border stripe. */
function cloth() {
  const [c, ctx] = canvas(64, 256);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 64, 256);
  ctx.fillStyle = "#e9d9b0";
  ctx.fillRect(0, 0, 6, 256);
  ctx.fillRect(58, 0, 6, 256);
  ctx.fillStyle = "#c9a227";
  for (let y = 18; y < 256; y += 48) ctx.fillRect(10, y, 44, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export type TextureSet = ReturnType<typeof createTextures>;

function createTextures() {
  const ground = herringbone();
  ground.map.repeat.set(1 / HERRINGBONE_METRES, 1 / HERRINGBONE_METRES);
  ground.bump.repeat.copy(ground.map.repeat);
  const slab = slabs();
  slab.map.repeat.set(0.5, 0.5);
  slab.bump.repeat.set(0.5, 0.5);
  const w = wood();
  w.map.repeat.set(2, 2);
  w.bump.repeat.set(2, 2);
  return {
    brick: brickWall(),
    ground,
    slab,
    roof: roofTiles(),
    lattice: lattice(),
    wood: w,
    glow: glow(),
    cloth: cloth(),
  };
}

let cache: TextureSet | null = null;
export function getTextures(): TextureSet {
  if (!cache) cache = createTextures();
  return cache;
}
