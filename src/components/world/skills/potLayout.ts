// Pottery Square layout: one pot per skill, from profile.skills. Pure maths (no three.js, no React),
// so it can be unit-tested for 3 to 30 skills.
//  - one ROW per skill group (the rows keep the old x span, evenly spread for any group count)
//  - pot height and girth grow with `level`; the girth is capped by the row spacing so pots never overlap
//  - glaze colour comes from the group
import type { Skill, SkillCategory, SkillGroup } from "@/content/profile";
import { POT_ROW_Z, POT_ROWS_X } from "../zones";

/** A skill as drawn: `display` is only set by the ?debug&skills=N copies ("React 2"), `name` always matches projects. */
export type PotSkill = Skill & { display?: string };
export type PotGroup = { category: SkillCategory; label: string; skills: PotSkill[] };

export type PotSpec = {
  /** Position in the flat list (also the InstancedMesh instanceId). */
  index: number;
  /** Row number (one row per non-empty group). */
  row: number;
  category: SkillCategory;
  groupLabel: string;
  /** Used to find the projects (matches profile names). */
  name: string;
  /** Shown to the visitor. */
  display: string;
  level: number;
  years?: number;
  x: number;
  z: number;
  /** Scale across (x, z) and up (y) of the unit pot (0.6 m wide, 0.58 m tall). */
  girth: number;
  height: number;
  colour: string;
};

/** Glaze per group: Frontend terracotta, Backend deep green, Database indigo, DevOps ochre, 3D/AI gold. */
export const GLAZE: Record<SkillCategory, string> = {
  frontend: "#c4623a",
  backend: "#2d6a4f",
  database: "#3f4a9c",
  devops: "#c8872a",
  "3d/ai": "#f0c53a",
};
export const glazeOf = (c: string) => GLAZE[c as SkillCategory] ?? "#b5663f";

/** Pot proportions at scale 1 (the lathe profile in potGeo.ts). */
export const POT_W = 0.6;
export const POT_H = 0.58;

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

/** "React: 3 years · used in 2 projects" (years only when known). */
export function potSummary(name: string, years: number | undefined, projectCount: number): string {
  const parts: string[] = [];
  if (years !== undefined && years > 0) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  parts.push(projectCount > 0 ? `used in ${projectCount} ${projectCount === 1 ? "project" : "projects"}` : "used in learning projects");
  return `${name}: ${parts.join(" · ")}`;
}

// ---------------------------------------------------------------- test override

/**
 * ?debug&skills=N: exactly N skills (3 to 40). Skills are taken round-robin across the groups, so a
 * small N still has several rows; above the real count the list repeats with "2", "3" ... suffixes.
 * Groups that end up empty are dropped.
 */
export function resizeSkills(groups: SkillGroup[], n: number | null): PotGroup[] {
  if (n === null) return groups;
  const longest = Math.max(0, ...groups.map((g) => g.skills.length));
  const order: { gi: number; s: Skill }[] = [];
  for (let k = 0; k < longest; k++) groups.forEach((g, gi) => g.skills[k] && order.push({ gi, s: g.skills[k] }));
  if (!order.length) return groups;
  const out: PotGroup[] = groups.map((g) => ({ category: g.category, label: g.label, skills: [] }));
  for (let i = 0; i < n; i++) {
    const { gi, s } = order[i % order.length];
    const copy = Math.floor(i / order.length);
    out[gi].skills.push(copy === 0 ? s : { ...s, display: `${s.name} ${copy + 1}` });
  }
  return out.filter((g) => g.skills.length > 0);
}

// ---------------------------------------------------------------- layout

const X0 = POT_ROWS_X[0];
const X1 = POT_ROWS_X[POT_ROWS_X.length - 1];
const Z_SPAN = POT_ROW_Z[1] - POT_ROW_Z[0];

/** x of row `row` out of `rows` (the old five-row x positions when there are five). */
export const rowX = (row: number, rows: number) => (rows <= 1 ? (X0 + X1) / 2 : X0 + ((X1 - X0) * row) / (rows - 1));

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function layoutPots(groups: PotGroup[]): PotSpec[] {
  const rows = groups.filter((g) => g.skills.length > 0);
  const pitchX = rows.length > 1 ? (X1 - X0) / (rows.length - 1) : 1.8;
  const out: PotSpec[] = [];
  rows.forEach((g, row) => {
    const n = g.skills.length;
    const pitchZ = Z_SPAN / n;
    // the widest pot (diameter POT_W * girth) takes at most 84% of the tighter spacing
    const maxGirth = (0.84 * Math.min(pitchZ, pitchX)) / POT_W;
    g.skills.forEach((s, i) => {
      const l = clamp01(s.level / 100);
      const girth0 = 0.55 + 0.5 * l;
      const height0 = 0.55 + 0.75 * l;
      const k = Math.min(1, maxGirth / girth0);
      out.push({
        index: out.length,
        row,
        category: g.category,
        groupLabel: g.label,
        name: s.name,
        display: s.display ?? s.name,
        level: s.level,
        years: s.years,
        x: rowX(row, rows.length),
        z: POT_ROW_Z[0] + (Z_SPAN * (i + 0.5)) / n,
        girth: Math.max(0.2, girth0 * k),
        height: Math.max(0.2, height0 * k),
        colour: glazeOf(g.category),
      });
    });
  });
  return out;
}

/** One entry per row: the plain group name and where its label floats (the row's x, north end). */
export function rowsOf(pots: PotSpec[]): { row: number; category: SkillCategory; label: string; x: number }[] {
  const seen = new Map<number, { row: number; category: SkillCategory; label: string; x: number }>();
  for (const p of pots) if (!seen.has(p.row)) seen.set(p.row, { row: p.row, category: p.category, label: p.groupLabel, x: p.x });
  return [...seen.values()];
}

/** The pot nearest to (x, z) within `maxD` metres, or -1. Used for the walk-up highlight. */
export function nearestPot(pots: { x: number; z: number }[], x: number, z: number, maxD: number): number {
  let best = -1;
  let bestD = maxD;
  pots.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** Filter chips: All plus one per category that has a row. */
export const FILTERS: { id: "all" | SkillCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "frontend", label: "Frontend" },
  { id: "backend", label: "Backend" },
  { id: "database", label: "Database" },
  { id: "devops", label: "DevOps" },
  { id: "3d/ai", label: "3D & AI" },
];
