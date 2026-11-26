// Canvas2D atlases: every text surface of a zone lives in ONE CanvasTexture (one draw call
// for the project posters + brass plates, one for the plaque faces + certificates, and the
// book spines share the education atlas). Drawn after the Mukta font is ready (the label
// loader suspends on it) and redrawn once more when document.fonts settles.
import type { Certificate, Course, Education, Project } from "@/content/profile";
import { FONT_FAMILY } from "../nepal/LabelSprites";

export type Rect = { x: number; y: number; w: number; h: number };

/** Simple shelf packer: left to right in rows of the given width. */
export function pack(sizes: [number, number][], width = 2048, pad = 4): { rects: Rect[]; height: number } {
  let x = 0;
  let y = 0;
  let rowH = 0;
  const rects = sizes.map(([w, h]) => {
    if (x + w > width) {
      x = 0;
      y += rowH + pad;
      rowH = 0;
    }
    const r = { x, y, w, h };
    x += w + pad;
    rowH = Math.max(rowH, h);
    return r;
  });
  return { rects, height: Math.max(4, Math.ceil((y + rowH) / 4) * 4) };
}

/** UV rectangle of a cell (CanvasTexture flipY = true: v grows upward). */
export function uvRect(r: Rect, W: number, H: number): [number, number, number, number] {
  return [r.x / W, 1 - (r.y + r.h) / H, r.w / W, r.h / H];
}

const font = (weight: number, px: number) => `${weight} ${px}px "${FONT_FAMILY}", system-ui, sans-serif`;

function fitFont(g: CanvasRenderingContext2D, text: string, weight: number, px: number, max: number, min = 14) {
  let size = px;
  g.font = font(weight, size);
  while (size > min && g.measureText(text).width > max) {
    size -= 2;
    g.font = font(weight, size);
  }
  return size;
}

/** Word wrap; returns the y after the last line. Lines beyond `maxLines` end in an ellipsis. */
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number, maxLines = 3) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > max && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    let last = shown[maxLines - 1];
    while (last.length > 1 && g.measureText(`${last}…`).width > max) last = last.slice(0, -1);
    shown[maxLines - 1] = `${last}…`;
  }
  shown.forEach((l, i) => g.fillText(l, x, y + i * lh));
  return y + shown.length * lh;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function mix(hex: string, other: string, t: number) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(other.slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** Newari lattice band: a row of small diamonds (jhyal pattern), purely geometric. */
function latticeBand(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = Math.max(1.5, h * 0.12);
  const step = h;
  for (let cx = x + step / 2; cx < x + w; cx += step) {
    g.beginPath();
    g.moveTo(cx, y);
    g.lineTo(cx + step / 2, y + h / 2);
    g.lineTo(cx, y + h);
    g.lineTo(cx - step / 2, y + h / 2);
    g.closePath();
    g.stroke();
  }
  g.restore();
}

// --- Project posters + brass name plates -----------------------------------

export function drawPoster(g: CanvasRenderingContext2D, r: Rect, p: Project, accent: string, img?: HTMLImageElement | null) {
  const { x, y, w, h } = r;
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  const grad = g.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, mix(accent, "#1a0f0a", 0.55));
  grad.addColorStop(1, "#120b08");
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  const m = Math.round(w * 0.045);
  if (img) {
    // thumbnail: cover-fit, then a band with the name so every stand still reads the same way
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const iw = img.naturalWidth * s;
    const ih = img.naturalHeight * s;
    g.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
    const band = g.createLinearGradient(x, y + h * 0.62, x, y + h);
    band.addColorStop(0, "rgba(18,11,8,0)");
    band.addColorStop(1, "rgba(18,11,8,0.92)");
    g.fillStyle = band;
    g.fillRect(x, y + h * 0.55, w, h * 0.45);
    g.fillStyle = "#fff4dc";
    fitFont(g, p.name, 600, Math.round(h * 0.11), w - m * 2);
    g.textBaseline = "alphabetic";
    g.fillText(p.name, x + m, y + h - m);
  } else {
    latticeBand(g, x + m, y + m * 0.7, w - m * 2, Math.round(h * 0.045), mix(accent, "#000000", 0.15));
    g.textBaseline = "alphabetic";
    // year pill
    g.font = font(600, Math.round(h * 0.06));
    const year = String(p.year);
    const yw = g.measureText(year).width + m;
    roundRect(g, x + w - m - yw, y + m * 1.9, yw, h * 0.085, h * 0.04);
    g.fillStyle = "rgba(255,244,220,0.12)";
    g.fill();
    g.fillStyle = "#f2d891";
    g.fillText(year, x + w - m - yw + m / 2, y + m * 1.9 + h * 0.064);
    // accent bar + name
    g.fillStyle = accent;
    g.fillRect(x + m, y + h * 0.2, w * 0.12, Math.max(4, h * 0.012));
    g.fillStyle = "#fff4dc";
    const nameY = y + h * 0.36;
    fitFont(g, p.name, 600, Math.round(h * 0.135), w - m * 2);
    g.fillText(p.name, x + m, nameY);
    g.font = font(500, Math.round(h * 0.062));
    g.fillStyle = "#e8d8b8";
    wrap(g, p.tagline, x + m, nameY + h * 0.11, w - m * 2, h * 0.078, 2);
    // stack chips, bottom up
    const chipH = Math.round(h * 0.085);
    g.font = font(600, Math.round(chipH * 0.55));
    let cx = x + m;
    let cy = y + h - m - chipH;
    const rows: { t: string; w: number }[][] = [[]];
    for (const t of p.stack) {
      const cw = g.measureText(t).width + chipH * 0.7;
      const row = rows[rows.length - 1];
      const used = row.reduce((a, c) => a + c.w + m * 0.4, 0);
      if (used + cw > w - m * 2 && row.length) rows.push([{ t, w: cw }]);
      else row.push({ t, w: cw });
    }
    for (const row of rows.slice(0, 2).reverse()) {
      cx = x + m;
      for (const c of row) {
        roundRect(g, cx, cy, c.w, chipH, chipH / 2);
        g.fillStyle = "rgba(255,244,220,0.08)";
        g.fill();
        g.strokeStyle = accent;
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = "#f6e7c6";
        g.fillText(c.t, cx + chipH * 0.35, cy + chipH * 0.7);
        cx += c.w + m * 0.4;
      }
      cy -= chipH + m * 0.35;
    }
  }
  // thin gold frame line
  g.strokeStyle = "rgba(201,162,39,0.85)";
  g.lineWidth = Math.max(2, w * 0.006);
  g.strokeRect(x + m * 0.35, y + m * 0.35, w - m * 0.7, h - m * 0.7);
  g.restore();
}

/** The carousel stand (more than MAX_STANDS projects): a list poster. */
export function drawMorePoster(g: CanvasRenderingContext2D, r: Rect, list: Project[]) {
  const { x, y, w, h } = r;
  const m = Math.round(w * 0.05);
  g.save();
  const grad = g.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, "#3a2418");
  grad.addColorStop(1, "#120b08");
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  latticeBand(g, x + m, y + m * 0.6, w - m * 2, Math.round(h * 0.045), "#8a6a1e");
  g.textBaseline = "alphabetic";
  g.fillStyle = "#fff4dc";
  fitFont(g, "More projects", 600, Math.round(h * 0.12), w - m * 2);
  g.fillText("More projects", x + m, y + h * 0.3);
  g.fillStyle = "#f2d891";
  g.font = font(600, Math.round(h * 0.075));
  g.fillText(`${list.length} on this stand`, x + m, y + h * 0.42);
  g.fillStyle = "#e8d8b8";
  g.font = font(500, Math.round(h * 0.062));
  list.slice(0, 5).forEach((p, i) => g.fillText(`· ${p.name}`, x + m, y + h * (0.54 + i * 0.085)));
  if (list.length > 5) g.fillText("…", x + m, y + h * 0.97);
  g.strokeStyle = "rgba(201,162,39,0.85)";
  g.lineWidth = 3;
  g.strokeRect(x + m * 0.35, y + m * 0.35, w - m * 0.7, h - m * 0.7);
  g.restore();
}

export function drawPlate(g: CanvasRenderingContext2D, r: Rect, text: string) {
  const { x, y, w, h } = r;
  const grad = g.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, "#8f6620");
  grad.addColorStop(0.45, "#e9c86e");
  grad.addColorStop(1, "#9a7024");
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  g.strokeStyle = "rgba(60,36,12,0.7)";
  g.lineWidth = 3;
  g.strokeRect(x + 5, y + 5, w - 10, h - 10);
  g.textAlign = "center";
  g.textBaseline = "middle";
  fitFont(g, text, 600, Math.round(h * 0.52), w - 36);
  g.fillStyle = "rgba(255,240,200,0.55)";
  g.fillText(text, x + w / 2 + 1, y + h / 2 + 2);
  g.fillStyle = "#3a2410";
  g.fillText(text, x + w / 2, y + h / 2);
  g.textAlign = "start";
  g.textBaseline = "alphabetic";
}

// --- Pathshala: plaques, certificates, book spines --------------------------

/** Carved stone face: grey speckled stone, engraved (dark with a light lip) lettering. */
export function drawPlaque(g: CanvasRenderingContext2D, r: Rect, e: Education) {
  const { x, y, w, h } = r;
  g.save();
  g.fillStyle = "#b8b0a2";
  g.fillRect(x, y, w, h);
  // speckle (deterministic)
  let seed = 7 + e.id.length * 13;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = rnd() > 0.5 ? "rgba(70,62,52,0.10)" : "rgba(255,250,240,0.10)";
    g.fillRect(x + rnd() * w, y + rnd() * h, 2 + rnd() * 3, 2 + rnd() * 3);
  }
  const m = Math.round(w * 0.07);
  g.strokeStyle = "rgba(60,52,44,0.55)";
  g.lineWidth = 4;
  g.strokeRect(x + m * 0.5, y + m * 0.5, w - m, h - m);
  latticeBand(g, x + m, y + m * 0.9, w - m * 2, Math.round(h * 0.05), "rgba(60,52,44,0.5)");
  const engrave = (text: string, px: number, weight: number, ty: number, max = w - m * 2) => {
    fitFont(g, text, weight, px, max);
    g.textAlign = "center";
    g.fillStyle = "rgba(255,250,240,0.45)";
    g.fillText(text, x + w / 2 + 1, ty + 2);
    g.fillStyle = "#3b342c";
    g.fillText(text, x + w / 2, ty);
  };
  g.textBaseline = "alphabetic";
  engrave(e.school, Math.round(h * 0.085), 600, y + h * 0.27);
  engrave(e.degree, Math.round(h * 0.07), 600, y + h * 0.42);
  engrave(e.field, Math.round(h * 0.062), 500, y + h * 0.53);
  engrave(`${e.start} – ${e.end}`, Math.round(h * 0.07), 600, y + h * 0.69);
  if (e.grade) engrave(e.grade, Math.round(h * 0.052), 500, y + h * 0.8);
  g.textAlign = "start";
  g.restore();
}

/** Parchment certificate with a gold double border and a plain red seal. */
export function drawCertificate(g: CanvasRenderingContext2D, r: Rect, c: Certificate) {
  const { x, y, w, h } = r;
  g.save();
  const grad = g.createRadialGradient(x + w / 2, y + h / 2, w * 0.1, x + w / 2, y + h / 2, w * 0.7);
  grad.addColorStop(0, "#fbf1da");
  grad.addColorStop(1, "#e6d2a6");
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  const m = Math.round(w * 0.05);
  g.strokeStyle = "#b8901f";
  g.lineWidth = 5;
  g.strokeRect(x + m * 0.6, y + m * 0.6, w - m * 1.2, h - m * 1.2);
  g.lineWidth = 2;
  g.strokeRect(x + m * 1.1, y + m * 1.1, w - m * 2.2, h - m * 2.2);
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillStyle = "#8a5a1e";
  g.font = font(600, Math.round(h * 0.075));
  g.fillText("CERTIFICATE", x + w / 2, y + h * 0.24);
  g.fillStyle = "#3a2419";
  g.font = font(600, Math.round(h * 0.1));
  wrap(g, c.name, x + w / 2, y + h * 0.42, w - m * 4, h * 0.11, 2);
  g.fillStyle = "#5a3d2a";
  g.font = font(500, Math.round(h * 0.07));
  g.fillText(`${c.issuer} · ${c.year}`, x + w / 2, y + h * 0.76);
  // seal
  g.fillStyle = "#a8322a";
  g.beginPath();
  g.arc(x + w - m * 3, y + h - m * 3, h * 0.075, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(255,220,200,0.6)";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x + w - m * 3, y + h - m * 3, h * 0.05, 0, Math.PI * 2);
  g.stroke();
  g.textAlign = "start";
  g.restore();
}

export const SPINE_COLOURS = ["#7a1f16", "#23395b", "#2f5d46", "#8a5a1e", "#5b2a4d", "#1f4f5a", "#6b3a22", "#3d4a1e"];

/**
 * Book spine: plain colour margin all round (the box's other faces sample it), gold bands,
 * vertical title.
 */
export function drawSpine(g: CanvasRenderingContext2D, r: Rect, c: Course, i: number) {
  const { x, y, w, h } = r;
  const col = SPINE_COLOURS[i % SPINE_COLOURS.length];
  g.save();
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
  g.fillStyle = "#d2ad4a";
  for (const by of [0.07, 0.11, 0.89, 0.93]) g.fillRect(x + 8, y + h * by, w - 16, Math.max(3, h * 0.012));
  g.translate(x + w / 2, y + h / 2);
  g.rotate(-Math.PI / 2);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#f6e7c6";
  const max = h * 0.72;
  const size = fitFont(g, c.name, 600, Math.round(w * 0.36), max, 18);
  if (g.measureText(c.name).width <= max || size > 18) g.fillText(c.name, 0, 0);
  else {
    // too long for one line: two lines, split at a colon or the middle word
    const words = c.name.split(/\s+/);
    let cut = words.findIndex((t) => t.endsWith(":")) + 1;
    if (cut <= 0 || cut >= words.length) cut = Math.ceil(words.length / 2);
    const a = words.slice(0, cut).join(" ");
    const b = words.slice(cut).join(" ");
    const px = Math.min(fitFont(g, a, 600, Math.round(w * 0.27), max, 12), fitFont(g, b, 600, Math.round(w * 0.27), max, 12));
    g.font = font(600, px);
    g.fillText(a, 0, -px * 0.62);
    g.fillText(b, 0, px * 0.62);
  }
  g.restore();
}
