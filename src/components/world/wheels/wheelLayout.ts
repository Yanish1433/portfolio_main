// Prayer-wheel gallery layout: one wheel per skill group, from profile.skills. Pure maths (no three.js, no
// React), so it can be unit-tested for 1 to 8 groups.
//  - ONE row along x (wheels face +z, the walkable lane is in front); the pitch comes from the data, capped
//    so the whole row never gets wider than GALLERY.maxSpan
//  - each wheel carries its group's skills (plain levels) and an accent colour
import type { Skill, SkillCategory, SkillGroup } from "@/content/profile";
import { GALLERY } from "../zones";

/** A skill as drawn: `display` is only set by ?debug&groups=N copies, `name` always matches projects. */
export type WheelSkill = Skill & { display?: string };
export type WheelGroup = { category: SkillCategory; label: string; skills: WheelSkill[] };

export type WheelSpec = {
  /** Position in the row (also the InstancedMesh instanceId). */
  index: number;
  category: SkillCategory;
  groupLabel: string;
  skills: WheelSkill[];
  x: number;
  z: number;
  /** Radius of the drum (m). */
  radius: number;
  colour: string;
};

/** Accent per group: Frontend terracotta, Backend deep green, Database indigo, DevOps ochre, 3D/AI gold. */
export const ACCENT: Record<SkillCategory, string> = {
  frontend: "#c4623a",
  backend: "#2d6a4f",
  database: "#3f4a9c",
  devops: "#c8872a",
  "3d/ai": "#e9b62e",
};
export const accentOf = (c: string) => ACCENT[c as SkillCategory] ?? "#b5663f";

/** Drum proportions of the authored lathe (WheelGallery.tsx makeDrumGeo). */
export const DRUM_R = 0.3;
export const DRUM_H = 1.0;
export const DRUM_Y = 0.62;
/** step13b: the drums are drawn this much wider / taller than authored (instance scale), so they read from the walk-up view. */
export const DRUM_GROW_XZ = 1.4;
export const DRUM_GROW_Y = 1.4;
/** Widest a drum gets (m), and where its top sits above the ground (before the finial). */
export const DRUM_MAX_R = DRUM_R * DRUM_GROW_XZ;
export const DRUM_TOP = DRUM_Y + DRUM_H * DRUM_GROW_Y;

// ---------------------------------------------------------------- the skill-name ring

/** Cell (px) and world size (m) of one name on the glowing ring (step13b: ~40 % bigger, 480 px cells for crisp letters). */
export const RING_CELL: [number, number] = [480, 152];
export const RING_W = 2.1;
export const RING_H = RING_W * (RING_CELL[1] / RING_CELL[0]);

/** step14b/15 signboard: atlas cell (px) of a carved dark-wood board, and the font size range of the group name (Kalam Bold, px of the cell). */
export const SIGN_CELL: [number, number] = [640, 320];
export const SIGN_NAME_MAX = 150;
export const SIGN_NAME_FLOOR = 96;
/** On-screen height (px) of the name's font size, from the board width (m), the size in cell px and the px per metre of the camera. */
export const signNamePx = (boardW: number, namePx: number, pxPerM: number) => (namePx / SIGN_CELL[0]) * boardW * pxPerM;
/** Text-free margin (px, each side) inside a signboard cell: wood border plus breathing room. */
export const SIGN_PAD = 30;
/** Usable text width (px) inside a signboard cell. */
export const SIGN_INNER_W = SIGN_CELL[0] - 2 * SIGN_PAD;

/**
 * Fit a label into `maxW` px: the biggest size in [floor, max] (step 4) that fits in one line, else two
 * balanced lines. `measure(text, size)` is the canvas measureText width (injected, so this stays pure).
 * If even the floor is too wide, it returns the floor with the narrowest split and `fits: false`.
 */
export function fitLabel(text: string, maxW: number, measure: (t: string, size: number) => number, max = SIGN_NAME_MAX, floor = SIGN_NAME_FLOOR): { size: number; lines: string[]; width: number; fits: boolean } {
  const words = text.split(/\s+/).filter(Boolean);
  const splits: string[][] = [[words.join(" ")]];
  for (let i = 1; i < words.length; i++) splits.push([words.slice(0, i).join(" "), words.slice(i).join(" ")]);
  const widthOf = (lines: string[], size: number) => Math.max(...lines.map((l) => measure(l, size)));
  for (let size = max; size >= floor; size -= 4) {
    let pick: string[] | null = null;
    let pickW = Infinity;
    for (const lines of splits) {
      const w = widthOf(lines, size);
      if (w <= maxW && (lines.length === 1 || w < pickW)) {
        if (!pick || pick.length > 1 || lines.length === 1) {
          pick = lines;
          pickW = w;
        }
        if (lines.length === 1) break;
      }
    }
    if (pick) return { size, lines: pick, width: pickW, fits: true };
  }
  let best = splits[0];
  for (const lines of splits) if (widthOf(lines, floor) < widthOf(best, floor)) best = lines;
  return { size: floor, lines: best, width: widthOf(best, floor), fits: false };
}

/** Every other name is lifted by this much, so neighbours never overlap. */
export const RING_LIFT = 1.1;

/** Where the k-th of m ring names sits (offsets from the wheel's x and the ring's base y): a shallow arc, zig-zagged. */
export function ringSlot(k: number, m: number): { dx: number; dy: number } {
  const t = m === 1 ? 0.5 : k / (m - 1);
  const zig = m > 3;
  const span = (m - 1) * (zig ? 1.1 : RING_W + 0.1); // zig-zag: neighbours share a row two apart; else one row, side by side
  return { dx: (t - 0.5) * span, dy: (1 - (2 * t - 1) ** 2) * 0.3 + (zig && k % 2 ? RING_LIFT : 0) };
}

// ---------------------------------------------------------------- plain words

export const STRONG_AT = 75;
export const GOOD_AT = 50;
export type Strength = "Strong" | "Good" | "Learning";
export const strengthWord = (level: number): Strength => (level >= STRONG_AT ? "Strong" : level >= GOOD_AT ? "Good" : "Learning");

/** Group names in plain words, with the technical word in brackets. */
const PLAIN_GROUP: Record<SkillCategory, { plain: string; tech: string }> = {
  frontend: { plain: "Websites & apps", tech: "frontend" },
  backend: { plain: "Servers & logic", tech: "backend" },
  database: { plain: "Saving data", tech: "database" },
  devops: { plain: "Launching & running", tech: "devops" },
  "3d/ai": { plain: "3D & smart tools", tech: "3D & AI" },
};

export function plainGroup(category: string, label: string): { plain: string; tech: string } {
  return PLAIN_GROUP[category as SkillCategory] ?? { plain: label, tech: "" };
}
/** "Websites & apps (frontend)" */
export function plainGroupName(category: string, label: string): string {
  const { plain, tech } = plainGroup(category, label);
  return tech ? `${plain} (${tech})` : plain;
}

/** "5 skills · used in 3 projects" */
export function wheelSummary(skillCount: number, projectCount: number): string {
  const skills = `${skillCount} ${skillCount === 1 ? "skill" : "skills"}`;
  return `${skills} · ${projectCount > 0 ? `used in ${projectCount} ${projectCount === 1 ? "project" : "projects"}` : "used in learning projects"}`;
}

/**
 * The de-duplicated union (in first-seen order) of the projects of each skill in a group.
 * `projectsOf` is `projectsForSkill` in the app; it is passed in so this stays pure.
 */
export function projectsForGroup<P extends { id: string }>(skills: { name: string }[], projectsOf: (skill: string) => P[]): P[] {
  const seen = new Set<string>();
  const out: P[] = [];
  for (const s of skills) {
    for (const p of projectsOf(s.name)) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

/** The names shown on the glowing ring: the strongest few, strongest first. */
export const RING_MAX = 8;
export function ringSkills<S extends { level: number }>(skills: S[], max = RING_MAX): S[] {
  return [...skills].sort((a, b) => b.level - a.level).slice(0, max);
}

// ---------------------------------------------------------------- test override

/**
 * ?debug&groups=N: exactly N wheels (1 to 8). Real groups come first; beyond the real count the groups repeat
 * with a "2", "3" ... suffix on their label and skill names (`name` keeps matching projects, `display` is shown).
 */
export function resizeGroups(groups: SkillGroup[], n: number | null): WheelGroup[] {
  if (n === null || !groups.length) return groups;
  const out: WheelGroup[] = [];
  for (let i = 0; i < Math.min(n, GALLERY.maxWheels); i++) {
    const g = groups[i % groups.length];
    const copy = Math.floor(i / groups.length);
    out.push(copy === 0 ? g : { category: g.category, label: `${g.label} ${copy + 1}`, skills: g.skills.map((s) => ({ ...s, display: `${s.name} ${copy + 1}` })) });
  }
  return out;
}

// ---------------------------------------------------------------- layout

/** Distance between two neighbouring wheels for `n` wheels. */
export const pitchFor = (n: number) => Math.min(GALLERY.maxPitch, GALLERY.maxSpan / Math.max(1, n));
/** Width of the covered frame for `n` wheels. */
export const frameWidth = (n: number) => n * pitchFor(n) + 0.9;

export function layoutWheels(groups: WheelGroup[]): WheelSpec[] {
  const rows = groups.filter((g) => g.skills.length > 0).slice(0, GALLERY.maxWheels);
  const n = rows.length;
  const pitch = pitchFor(n);
  const radius = Math.min(DRUM_MAX_R, pitch * 0.34);
  return rows.map((g, i) => ({
    index: i,
    category: g.category,
    groupLabel: g.label,
    skills: g.skills,
    x: GALLERY.x + (i - (n - 1) / 2) * pitch,
    z: GALLERY.z,
    radius,
    colour: accentOf(g.category),
  }));
}

/** The wheel nearest to (x, z) within `maxD` metres, or -1. Used for the walk-up highlight and E. */
export function nearestWheel(wheels: { x: number; z: number }[], x: number, z: number, maxD: number): number {
  let best = -1;
  let bestD = maxD;
  wheels.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** Filter chips: All plus one per category that has a wheel. */
export const FILTERS: { id: "all" | SkillCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "frontend", label: "Frontend" },
  { id: "backend", label: "Backend" },
  { id: "database", label: "Database" },
  { id: "devops", label: "DevOps" },
  { id: "3d/ai", label: "3D & AI" },
];
