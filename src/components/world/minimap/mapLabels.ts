// Pure label layout for the mini-map: each place gets a chip (icon + short word) near its spot, and no two chips overlap.
// No React: node:test covers it (mapLabels.test.ts).

export type Box = { x: number; y: number; w: number; h: number };
export type LabelIn = { id: string; x: number; y: number; text: string };
export type LabelOut = LabelIn & Box;

const INK = "#2b1d14";
export const CHIP_BG = "#fbf3df";
export const LABEL_INK = INK;

/** Short wording for a section label: "About (Ghar)" -> "About". Nothing is invented; it only drops the bracket. */
export const shortLabel = (label: string) => label.replace(/\s*\(.*?\)\s*/g, "").trim();

/** Chip size in px for a given text and font size (icon + gap + text + padding). Slightly generous so it never under-estimates. */
export function chipSize(text: string, fontPx: number): { w: number; h: number } {
  const icon = Math.round(fontPx * 1.15);
  return { w: Math.ceil(icon + 3 + text.length * fontPx * 0.58 + 10), h: Math.ceil(fontPx * 1.15 + 6) };
}

const overlap = (a: Box, b: Box, pad = 2) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

/**
 * Place chips for a map `size` px wide. `anchors` are in map units (0..200). Each chip is tried centred on its spot first,
 * then pushed out in rings of offsets; the first spot inside `bounds` that touches no earlier chip wins.
 */
export function placeLabels(anchors: readonly LabelIn[], size: number, fontPx: number, bounds: Box): LabelOut[] {
  const placed: LabelOut[] = [];
  // places with the least room first (the busiest corner), so the rest flow around them
  const order = [...anchors].sort((a, b) => a.y - b.y);
  for (const a of order) {
    const { w, h } = chipSize(a.text, fontPx);
    const cx = (a.x / 200) * size;
    const cy = (a.y / 200) * size;
    let best: Box | null = null;
    let bestCost = Infinity;
    for (let ring = 0; ring <= 14 && !best; ring++) {
      const r = ring * (h * 0.55);
      const steps = ring === 0 ? 1 : 16;
      for (let k = 0; k < steps; k++) {
        const ang = (k / steps) * Math.PI * 2;
        const dx = Math.cos(ang) * r * 1.6; // chips are wide: let them slide sideways further
        const dy = Math.sin(ang) * r;
        const box = { x: cx + dx - w / 2, y: cy + dy - h / 2, w, h };
        if (box.x < bounds.x || box.y < bounds.y || box.x + w > bounds.x + bounds.w || box.y + h > bounds.y + bounds.h) continue;
        if (placed.some((p) => overlap(box, p))) continue;
        const cost = Math.hypot(dx, dy);
        if (cost < bestCost) {
          bestCost = cost;
          best = box;
        }
      }
    }
    if (!best) best = { x: Math.min(Math.max(cx - w / 2, bounds.x), bounds.x + bounds.w - w), y: Math.min(Math.max(cy - h / 2, bounds.y), bounds.y + bounds.h - h), w, h };
    placed.push({ ...a, ...best });
  }
  return placed;
}

/** Room the chips may use around a map of `size` px: a little spill to the left and below (the map sits in the top-right corner). */
export const boundsFor = (size: number, spillLeft: number): Box => ({ x: -spillLeft, y: -2, w: size + spillLeft + 6, h: size + 4 });

/** WCAG contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
