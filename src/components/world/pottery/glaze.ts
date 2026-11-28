// Pure glaze + medallion helpers (step24). NO imports on purpose: cornerGeo / clayMaterial use them at load, and the skill logos
// (skillLogos.ts) stay lazy. A skill's brand hex (Simple Icons, no "#") -> the pot's glaze colours and the round decal's colours.
export type Rgb = [number, number, number]; // sRGB 0..1

export const TERRA = "#c4663a";
const CREAM = "#f3e6cc";
const DARK_FILL = "#2a1a10";
const SLATE = "#3a3a42";
const TERRA_INK = "#8a3f1f";

export const BODY_MIX = 0.88; // terracotta -> brand. Mostly the brand colour: 0.4-0.55 went grey/muddy on blues/greens (complementary colours cancel)
export const MIN_CONTRAST = 3; // WCAG contrast of the brand-coloured logo vs the cream medallion; below it the medallion goes dark with a white logo
export const DARK_MIX = 0.6; // very dark brands: a fixed warm charcoal tint instead
export const LIGHT_LUM = 0.8;
export const DARK_LUM = 0.12;

// Band positions along uv.y (0 = foot, 1 = rim). The GLSL in clayMaterial.ts and the shelf's vertex colours both read these.
export const RIM_FROM = 0.88;
export const RIM_TO = 0.93;
export const BELLY_FROM = 0.15;
export const BELLY_TO = 0.17;
export const BELLY_END = 0.23;
export const BELLY_END_TO = 0.25;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Parse "61DAFB" / "#61dafb" / "fa0" -> sRGB 0..1, or null when it is not a hex colour. */
export function parseHex(hex: string | null | undefined): Rgb | null {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** WCAG relative luminance 0..1 (linear light). */
export function luminance(c: Rgb): number {
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

/** WCAG contrast ratio (1..21) of two colours. */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Mix a -> b by t (clamped 0..1), in sRGB space (what the eye reads). */
export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** "#rrggbb" (channels clamped + rounded). */
export function toCss(c: Rgb): string {
  const h = (n: number) => Math.round(clamp01(n) * 255).toString(16).padStart(2, "0");
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

const T = parseHex(TERRA) as Rgb;

export type Medal = { fill: string; ring: string; ink: string };
export type Glaze = { kind: "none" | "normal" | "dark" | "light"; body: Rgb; rim: Rgb; medal: Medal };

/** The glaze + medallion colours for a brand hex (null / bad hex = plain terracotta). */
export function glazeFor(hex: string | null | undefined): Glaze {
  const c = parseHex(hex);
  if (!c) return { kind: "none", body: T, rim: mixRgb(T, [0, 0, 0], 0.25), medal: { fill: CREAM, ring: toCss(mixRgb(T, [0, 0, 0], 0.25)), ink: TERRA_INK } };
  const lum = luminance(c);
  if (lum < DARK_LUM) {
    // black brands (Express, GitHub, Next.js): blending toward black makes a mud-brown pot, so a fixed warm slate tint; logo black on cream
    const slate = parseHex(SLATE) as Rgb;
    return { kind: "dark", body: mixRgb(T, slate, DARK_MIX), rim: mixRgb(slate, [0, 0, 0], 0.4), medal: { fill: CREAM, ring: toCss(mixRgb(slate, [0, 0, 0], 0.4)), ink: "#141414" } };
  }
  if (lum > LIGHT_LUM) {
    const rim = mixRgb(c, [0, 0, 0], 0.45); // a darkened variant so the rim still reads
    return { kind: "light", body: mixRgb(T, c, BODY_MIX), rim, medal: { fill: DARK_FILL, ring: toCss(rim), ink: "#ffffff" } };
  }
  const body = mixRgb(T, c, BODY_MIX);
  const rim = mixRgb(c, [0, 0, 0], 0.2); // a slightly darker shade of the brand for the rim lip + band
  // brand-coloured logo on cream when that reads (contrast >= 3); otherwise (yellow, cyan, light blue...) white on a dark circle with a brand ring
  if (contrast(c, parseHex(CREAM) as Rgb) < MIN_CONTRAST) return { kind: "normal", body, rim, medal: { fill: DARK_FILL, ring: toCss(c), ink: "#ffffff" } };
  return { kind: "normal", body, rim, medal: { fill: CREAM, ring: toCss(c), ink: toCss(c) } };
}

/** 0..1 weight of the full-colour glaze (rim lip + one belly band) at height fraction v (uv.y). The GLSL mirrors this. */
export function bandWeight(v: number): number {
  const rim = smooth(RIM_FROM, RIM_TO, v);
  const belly = smooth(BELLY_FROM, BELLY_TO, v) * (1 - smooth(BELLY_END, BELLY_END_TO, v));
  return Math.max(rim, belly);
}

/** The cooling cross-fade: heat 1 -> 0 brings the glaze in first and the medallion a little later. */
export function coolAmounts(heat: number): { glaze: number; decal: number } {
  const k = 1 - clamp01(heat);
  return { glaze: k, decal: clamp01((k - 0.3) / 0.7) };
}

/** Medallion diameter (metres of pot surface): ~65% of the height, never more than 40% of the way round the pot. */
export function medallionDiameter(h: number, rMid: number): number {
  return Math.min(h * 0.65, 0.4 * 2 * Math.PI * Math.max(rMid, 0.01));
}

/** Up to two capital initials ("Three.js" -> "TJ", "Node.js" -> "NJ", "Python" -> "PY"). */
export function initials(name: string): string {
  const w = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!w.length) return "?";
  return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase();
}
