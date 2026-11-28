// Draws a skill's logo onto a canvas (the pot's stamped decal). Lazy-loaded: it pulls in skillLogos.ts (the Simple Icons paths),
// so the town's first load never pays for them.
import { GENERIC, logoFor } from "@/components/recruiter/book/skillLogos";
import { ATLAS } from "./cornerGeo";
import { type Clay } from "./clayProfile";
import { glazeFor, initials, medallionDiameter, type Glaze } from "./glaze";

export * from "./glaze";
import type { SavedPot } from "./save";

const TWO_PI = Math.PI * 2;

/** A skill's brand hex (Simple Icons, no "#"), or null for a generic icon. The shelf's glaze colour derives from this, so no save change is needed. */
export function hexFor(skill: string): string | null {
  const l = logoFor(skill);
  return l.kind === "brand" ? l.logo.hex : null;
}

/** Draw `skill`'s logo in `ink`, centred at (cx, cy) in a wPx x hPx box. No logo -> its initials (unmapped skills) or a neat generic icon. */
export function drawLogo(ctx: CanvasRenderingContext2D, skill: string, cx: number, cy: number, wPx: number, hPx: number, ink: string): void {
  const l = logoFor(skill);
  ctx.save();
  ctx.translate(cx - wPx / 2, cy - hPx / 2);
  ctx.scale(wPx / 24, hPx / 24);
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  if (l.kind === "brand") {
    ctx.fill(new Path2D(l.logo.path));
  } else if (l.icon === "code" && /[a-z0-9]/i.test(skill)) {
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials(skill), 12, 12.5);
  } else {
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(new Path2D(GENERIC[l.icon]));
  }
  ctx.restore();
}

/** The medallion's box (px) in a cw x ch cell: u wraps round the middle of the pot, v is the height, so rx/ry differ to look round on the pot. */
function medalBox(clay: Pick<Clay, "r" | "h">, cw: number, ch: number): { rx: number; ry: number; vy: number } {
  const rMid = clay.r[Math.floor(clay.r.length / 2)];
  const d = medallionDiameter(clay.h, rMid);
  return { rx: (d / 2) * (cw / (TWO_PI * rMid)), ry: (d / 2) * (ch / clay.h), vy: 0.55 };
}

/** The round decal: filled circle + thin brand ring, logo inside in its brand colour. */
function drawMedallion(ctx: CanvasRenderingContext2D, skill: string, cx: number, cy: number, rx: number, ry: number, gl: Glaze): void {
  const ring = Math.max(2, Math.min(rx, ry) * 0.12);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TWO_PI);
  ctx.fillStyle = gl.medal.fill;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - ring / 2, ry - ring / 2, 0, 0, TWO_PI);
  ctx.lineWidth = ring;
  ctx.strokeStyle = gl.medal.ring;
  ctx.stroke();
  drawLogo(ctx, skill, cx, cy, rx * 1.5, ry * 1.5, gl.medal.ink);
}

/** The wheel clay's decal: one medallion at the front (u = 0.5). Transparent elsewhere (the shader reads alpha as the mask). */
export function stampDecal(canvas: HTMLCanvasElement, skill: string, clay: Pick<Clay, "r" | "h">): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const b = medalBox(clay, canvas.width, canvas.height);
  drawMedallion(ctx, skill, canvas.width / 2, (1 - b.vy) * canvas.height, b.rx, b.ry, glazeFor(hexFor(skill)));
}

/** The shelf atlas: pot i's medallion in cell i. */
export function drawAtlas(canvas: HTMLCanvasElement, pots: readonly SavedPot[]): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  pots.forEach((p, i) => {
    const b = medalBox(p, ATLAS.cellW, ATLAS.cellH);
    drawMedallion(ctx, p.skill, i * ATLAS.cellW + ATLAS.cellW / 2, (1 - b.vy) * ATLAS.cellH, b.rx, b.ry, glazeFor(hexFor(p.skill)));
  });
}
