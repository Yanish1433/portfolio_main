import { test } from "node:test";
import assert from "node:assert/strict";
import type { Education, Experience } from "@/content/profile";
import { buildMilestones, eduDegree, eduLine, eduMeta, eduSentence, isNow, sortedEducation, yearRange } from "./journey";

const edu = (o: Partial<Education>): Education => ({ id: "x", school: "S", degree: "", field: "", start: "", end: "", grade: "", highlights: [], ...o });
const BIT = edu({ id: "bit", school: "Lincoln University", degree: "Bachelor of Information Technology (BIT)", field: "Information Technology", start: "2022", end: "2026" });
const PLUS2 = edu({ id: "p2", school: "Capital College and Research Center (CCRC)", degree: "Higher Secondary Education (+2)", start: "2020", end: "2022" });
const SCHOOL = edu({ id: "sc", school: "Universal School", degree: "Secondary Education (up to Class 10)", end: "2020" });
const NOWSCHOOL = edu({ id: "ts", school: "TechSkills Institute", end: "present" });
const JOB: Experience = { id: "j", role: "Developer", company: "Acme", start: "2027", end: "present", points: [], impact: "Made things faster." };

test("yearRange handles every empty combination", () => {
  assert.equal(yearRange("2022", "2026"), "2022–2026");
  assert.equal(yearRange("", "2020"), "until 2020");
  assert.equal(yearRange("2024", "2024"), "2024");
  assert.equal(yearRange("", "present"), "now");
  assert.equal(yearRange("2025", "Present"), "2025–now");
  assert.equal(yearRange("2025", ""), "from 2025");
  assert.equal(yearRange("", ""), "");
  assert.ok(!/until (present|now)/i.test(yearRange("", "present")));
});

test("eduDegree drops a field the degree already says", () => {
  assert.equal(eduDegree(BIT), "Bachelor of Information Technology (BIT)");
  assert.equal(eduDegree(edu({ degree: "Bachelor of Science", field: "Physics" })), "Bachelor of Science in Physics");
  assert.equal(eduDegree(edu({ degree: "", field: "Physics" })), "Physics");
  assert.equal(eduDegree(PLUS2), "Higher Secondary Education (+2)");
});

test("eduLine reads cleanly with empty fields", () => {
  assert.equal(eduLine(BIT), "Bachelor of Information Technology (BIT) · Lincoln University · 2022–2026");
  assert.equal(eduLine(SCHOOL), "Secondary Education (up to Class 10) · Universal School · until 2020");
  assert.equal(eduLine(NOWSCHOOL), "Currently studying at TechSkills Institute");
  assert.equal(eduMeta(NOWSCHOOL), "TechSkills Institute · now");
  for (const e of [BIT, PLUS2, SCHOOL, NOWSCHOOL]) assert.ok(!/ {2}|\(–|until present|·\s*·/.test(eduLine(e)), eduLine(e));
});

test("eduSentence", () => {
  assert.equal(eduSentence(NOWSCHOOL), "is currently studying at TechSkills Institute");
  assert.equal(eduSentence(SCHOOL), "Secondary Education (up to Class 10) at Universal School (until 2020)");
  assert.equal(eduSentence(BIT), "Bachelor of Information Technology (BIT) at Lincoln University (2022–2026)");
});

test("sortedEducation: present first, empty start falls back to the end year", () => {
  assert.deepEqual(sortedEducation([SCHOOL, BIT, NOWSCHOOL, PLUS2]).map((e) => e.id), ["ts", "bit", "p2", "sc"]);
  assert.ok(isNow("Present") && !isNow("2026"));
});

test("milestones: grouped by year, 'now' then 'next'; nothing invented", () => {
  const m = buildMilestones({ education: [BIT, PLUS2, SCHOOL, NOWSCHOOL], experience: [], projects: [{ name: "A", year: 2026 }, { name: "B", year: 2026 }] });
  assert.deepEqual(m.map((x) => x.key), ["2020", "2022", "2026", "now", "next"]);
  assert.deepEqual(m[2].lines, ["Lincoln University", "A", "B"]);
  assert.deepEqual(m[3].lines, ["Learning at TechSkills Institute"]);
  assert.equal(m[4].kind, "next");
  assert.deepEqual(m.map((x) => x.short), [["Class 10"], ["+2"], ["BIT", "2 projects"], ["TechSkills Institute"], ["your company?"]]);
});

test("milestones: empty profile still has the next stone; jobs slot in with impact; cap holds", () => {
  assert.deepEqual(buildMilestones({ education: [], experience: [], projects: [] }).map((x) => x.key), ["next"]);
  const withJob = buildMilestones({ education: [SCHOOL], experience: [JOB], projects: [] });
  assert.deepEqual(withJob.map((x) => x.key), ["2020", "now", "next"]);
  assert.equal(withJob[1].impact, "Made things faster.");
  const many = buildMilestones({ education: [], experience: [], projects: [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].map((year) => ({ name: `P${year}`, year })) });
  assert.ok(many.length <= 6);
  assert.equal(many[many.length - 1].key, "next");
  assert.equal(many.reduce((n, x) => n + (x.kind === "past" ? x.lines.length : 0), 0), 8);
});

test("eduRow: the title never repeats the school and TechSkills reads as asked", async () => {
  const { eduRow } = await import("./journey");
  assert.deepEqual(eduRow(NOWSCHOOL), { title: "Currently studying at TechSkills Institute", meta: "" });
  assert.deepEqual(eduRow(BIT), { title: "Bachelor of Information Technology (BIT)", meta: "Lincoln University · 2022–2026" });
  assert.deepEqual(eduRow(SCHOOL), { title: "Secondary Education (up to Class 10)", meta: "Universal School · until 2020" });
});
