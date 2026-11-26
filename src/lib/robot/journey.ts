// Pure helpers for the captain's journey (education, jobs, projects). Used by the world (scroll,
// path stones, panels), Recruiter Mode and the robot, so empty fields are handled in ONE place:
// no "in  at", no "(–2020)", no "BIT in Information Technology", no "until present".
// No React, no three.js, no window: safe in node tests.
import type { Education, Experience, Project } from "@/content/profile";

const NOW = /^(present|now|current|currently|ongoing)$/i;
export const isNow = (end: string | undefined | null): boolean => NOW.test((end ?? "").trim());

const t = (s: string | undefined | null) => (s ?? "").trim();

/** "2022–2026", "2022" (same year), "until 2020" (no start), "2022–now", "now", "from 2022" or "". */
export function yearRange(start: string | undefined, end: string | undefined): string {
  const s = t(start);
  const e = t(end);
  if (isNow(e)) return s ? `${s}–now` : "now";
  if (s && e) return s === e ? s : `${s}–${e}`;
  if (e) return `until ${e}`;
  if (s) return `from ${s}`;
  return "";
}

/** Degree plus field, without saying the field twice ("Bachelor of Information Technology (BIT)" already has it). */
export function eduDegree(e: Pick<Education, "degree" | "field">): string {
  const d = t(e.degree);
  const f = t(e.field);
  if (!f) return d;
  if (!d) return f;
  return d.toLowerCase().includes(f.toLowerCase()) ? d : `${d} in ${f}`;
}

/** The plain line: "Bachelor of Information Technology (BIT) · Lincoln University · 2022–2026". */
export function eduLine(e: Education): string {
  const deg = eduDegree(e);
  if (!deg && isNow(e.end)) return `Currently studying at ${t(e.school)}`;
  return [deg, t(e.school), yearRange(e.start, e.end)].filter(Boolean).join(" · ");
}

/** Short second line for a row or a panel: "TechSkills Institute · now" or "Lincoln University · 2022–2026". */
export function eduMeta(e: Education): string {
  return [t(e.school), yearRange(e.start, e.end)].filter(Boolean).join(" · ");
}

/** Row text of the scroll, the panel and Recruiter Mode: a headline and a second line that never repeats the school. */
export function eduRow(e: Education): { title: string; meta: string } {
  const deg = eduDegree(e);
  const title = deg || (isNow(e.end) ? `Currently studying at ${t(e.school)}` : t(e.school));
  const years = yearRange(e.start, e.end);
  // the headline already names the school: no second line (a current study needs no "now" either)
  const meta = title.includes(t(e.school)) ? (isNow(e.end) ? "" : years) : [t(e.school), years].filter(Boolean).join(" · ");
  return { title, meta };
}

/** A phrase for the robot, continuing "<Name> ...": "is currently studying at X" / "Bachelor ... at X (2022–2026)". */
export function eduSentence(e: Education): string {
  const deg = eduDegree(e);
  const yrs = yearRange(e.start, e.end);
  if (!deg) return isNow(e.end) ? `is currently studying at ${t(e.school)}` : `studied at ${t(e.school)}${yrs ? ` (${yrs})` : ""}`;
  return `${deg} at ${t(e.school)}${yrs ? ` (${yrs})` : ""}`;
}

/** Newest first. "present" sorts first; an empty start falls back to the end year. */
export function eduSortKey(e: Pick<Education, "start" | "end">): number {
  if (isNow(e.end)) return 10000;
  return Number.parseInt(e.end, 10) || Number.parseInt(e.start, 10) || 0;
}
export const sortedEducation = <T extends Education>(list: readonly T[]): T[] =>
  [...list].sort((a, b) => eduSortKey(b) - eduSortKey(a) || (Number.parseInt(b.start, 10) || 0) - (Number.parseInt(a.start, 10) || 0));

export const expPeriod = (e: Pick<Experience, "start" | "end">) => yearRange(e.start, e.end);

// --- the path: milestones from real data only -----------------------------------------------

export type Milestone = {
  /** "2020", "now" or "next". */
  key: string;
  /** Big caption on the stone: "2022", "Now" or "Next milestone". */
  head: string;
  /** Short lines, each from profile data. */
  lines: string[];
  /** At most 2 very short lines for the stone's caption ("BIT", "2 projects"). */
  short: string[];
  /** One plain "impact" line (jobs only). */
  impact?: string;
  kind: "past" | "now" | "next";
};

export const NEXT_MILESTONE_TEXT = "Your company could be my first: let's talk";
/** The path holds at most this many stones including "next" (older years are folded into the first). */
export const MAX_STONES = 6;

type JourneyData = { education: readonly Education[]; experience: readonly Experience[]; projects: readonly Pick<Project, "name" | "year">[] };

/** "(BIT)" gives "BIT", "(up to Class 10)" gives "Class 10"; without brackets the degree, else the school. */
export function eduShort(e: Education): string {
  const m = /\(([^)]+)\)/.exec(t(e.degree));
  if (m) return m[1].replace(/^up to\s+/i, "").trim();
  return t(e.degree) || t(e.school);
}

/** Stones, oldest first: items grouped by year, "now" (current study or job) then the "Next milestone" stone. */
export function buildMilestones(d: JourneyData): Milestone[] {
  const byYear = new Map<number, { lines: string[]; short: string[]; projects: number; impact?: string }>();
  const add = (year: number, line: string, impact?: string, short?: string, project = false) => {
    if (!year) return;
    const g = byYear.get(year) ?? { lines: [], short: [], projects: 0 };
    g.lines.push(line);
    if (project) g.projects++;
    else if (short) g.short.push(short);
    if (impact && !g.impact) g.impact = impact;
    byYear.set(year, g);
  };
  const nowLines: string[] = [];
  const nowShort: string[] = [];
  for (const e of d.education) {
    if (isNow(e.end)) {
      nowLines.push(`Learning at ${t(e.school)}`);
      nowShort.push(t(e.school));
    }
    else add(Number.parseInt(e.end, 10) || Number.parseInt(e.start, 10), t(e.school), undefined, eduShort(e));
  }
  let nowImpact: string | undefined;
  for (const x of d.experience) {
    const line = `${t(x.role)} at ${t(x.company)}`;
    if (isNow(x.end)) {
      nowLines.push(line);
      nowShort.push(`${t(x.role)} · ${t(x.company)}`);
      nowImpact ??= x.impact;
    } else add(Number.parseInt(x.start, 10) || Number.parseInt(x.end, 10), line, x.impact, `${t(x.role)} · ${t(x.company)}`);
  }
  for (const p of d.projects) add(p.year, p.name, undefined, undefined, true);

  const years = [...byYear.keys()].sort((a, b) => a - b);
  const room = MAX_STONES - 1 - (nowLines.length ? 1 : 0);
  const capShort = (g: { short: string[]; projects: number }): string[] => {
    const lines = [...(g.short.length ? [g.short.join(" · ")] : []), ...(g.projects ? [`${g.projects} ${g.projects === 1 ? "project" : "projects"}`] : [])];
    return lines.slice(0, 2);
  };
  type G = { key: string; head: string; lines: string[]; short: string[]; impact?: string };
  let groups: G[] = years.map((y) => ({ key: String(y), head: String(y), lines: byYear.get(y)!.lines, short: capShort(byYear.get(y)!), impact: byYear.get(y)!.impact }));
  if (groups.length > room && room > 0) {
    const cut = groups.length - room + 1;
    const folded = years.slice(0, cut).map((y) => byYear.get(y)!);
    const merged = { short: folded.flatMap((g) => g.short), projects: folded.reduce((n, g) => n + g.projects, 0) };
    groups = [{ key: String(years[0]), head: `${years[0]}–${years[cut - 1]}`, lines: folded.flatMap((g) => g.lines), short: capShort(merged) }, ...groups.slice(cut)];
  }
  const out: Milestone[] = groups.map((g) => ({ key: g.key, head: g.head, lines: g.lines, short: g.short, impact: g.impact, kind: "past" }));
  if (nowLines.length) out.push({ key: "now", head: "Now", lines: nowLines, short: [nowShort.join(" · ")].filter(Boolean).slice(0, 2), impact: nowImpact, kind: "now" });
  out.push({ key: "next", head: "Next milestone", lines: ["your company?"], short: ["your company?"], kind: "next" });
  return out;
}
