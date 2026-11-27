// The chapters of the recruiter book. Server-rendered: every word is real DOM text (crawlers and screen readers read it all).
// Only existing content from profile.ts is used; nothing here invents text, numbers or links.
// Each page is a list of blocks (its direct children), so the pen can write them one after another.
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { profile } from "@/content/profile";
import type { Project } from "@/content/profile";
import { featuredProjects, taglineOf } from "@/content/showcase";
import { videoUrl } from "@/components/world/halls/showcaseView";
import { ctaState, initials } from "@/components/world/about/aboutView";
import { WORLD_HREF } from "@/components/landing/routes";
import { eduRow, eduSortKey, expPeriod, isNow } from "@/lib/robot/journey";
import { builtLine, teamCards } from "@/lib/robot/proof";
import { ContactForm } from "../ContactForm";
import { DownloadIcon, GithubIcon, LinkedinIcon, MailIcon } from "../icons";
import { isPlaceholder, isRealEmail, isRealLink } from "../links";
import type { PageDef } from "./RecruiterBook";
import type { PageMeta } from "./nav";
import { PhotoCorners, TapedMedia } from "./TapedMedia";
import { GENERIC, logoFor } from "./skillLogos";
import s from "./recruiterBook.module.css";

const isExternal = (url: string) => /^https?:/.test(url);
const mailto = (email: string) => (email.includes("@") ? `mailto:${email}` : email);
const extProps = (url: string) => (isExternal(url) ? { target: "_blank", rel: "noopener noreferrer" } : {});

const page = (meta: PageMeta, node: ReactNode): PageDef => ({ meta, node });

// Small ink doodles in the margin (decorative, not content).
function Doodle({ kind }: { kind: "pagoda" | "flags" }) {
  if (kind === "flags")
    return (
      <svg className={s.doodle} data-k="flags" viewBox="0 0 120 36" aria-hidden="true" focusable="false">
        <path d="M2 6C30 22 90 22 118 6" />
        {[["f1", 14, 12], ["f2", 36, 17], ["f3", 58, 19], ["f4", 80, 17], ["f5", 102, 12]].map(([c, x, y]) => (
          <path key={c as string} className={s[c as string]} d={`M${x} ${y}h11v12h-11z`} />
        ))}
      </svg>
    );
  return (
    <svg className={s.doodle} data-k="pagoda" viewBox="0 0 64 48" aria-hidden="true" focusable="false">
      <path d="M32 2v6M24 14c4-2 12-2 16 0l6 4H18zM21 24c6-2 16-2 22 0l5 4H16zM18 34c8-3 20-3 28 0l5 4H13z" />
      <path d="M22 18v6M42 18v6M20 28v6M44 28v6M16 38v8M48 38v8M28 38v8M36 38v8M10 46h44" />
    </svg>
  );
}

// ---------------------------------------------------------------- 2. contents

/** Three real highlights: the featured projects first, then the strongest skills. Nothing invented. */
function highlights(): { label: string; href: string }[] {
  const out = featuredProjects().slice(0, 3).map((p) => ({ label: p.name, href: `#${p.id}` }));
  for (const g of profile.skills) {
    for (const sk of g.skills) {
      if (out.length >= 3) return out;
      if (sk.level >= 80 && !out.some((o) => o.label === sk.name)) out.push({ label: sk.name, href: "#skills" });
    }
  }
  return out;
}

function Contents() {
  const { name, title, tagline, location } = profile;
  return (
    <>
      <h1>{name}</h1>
      <p className={s.tag}>
        {title}
        {!isPlaceholder(location) && <> · {location}</>}
      </p>
      <p className={s.lede}>{tagline}</p>
      <div className={s.wow}>
        <ul className={s.chips} aria-label="Highlights">
          {highlights().map((h) => (
            <li key={h.label}>
              <a href={h.href}>{h.label}</a>
            </li>
          ))}
        </ul>
        <a className={s.contactSeal} href="#contact">
          Contact me <span aria-hidden="true">→</span>
        </a>
      </div>
      <p className={s.muted}>
        <span lang="ne">छिटो परिचय</span>: too busy to explore my 3D town? Here&rsquo;s my quick portfolio. When you have time, come back and walk through the city.
      </p>
      <nav aria-label="Contents">
        <h3>Contents</h3>
        <ol className={s.contents}>
          <li><a className={s.ink} href="#about">About me</a></li>
          <li>
            <a className={s.ink} href="#projects">Projects</a>
            <ul className={s.sub}>
              {profile.projects.map((p) => (
                <li key={p.id}><a className={s.ink} href={`#${p.id}`}>{p.name}</a></li>
              ))}
            </ul>
          </li>
          <li><a className={s.ink} href="#skills">Skills</a></li>
          <li><a className={s.ink} href="#journey">My Journey</a></li>
          <li><a className={s.ink} href="#contact">Contact</a></li>
        </ol>
      </nav>
      <p className={s.muted}>Tap a ribbon to jump, or turn the page with ← →.</p>
    </>
  );
}

// ---------------------------------------------------------------- 3. about

function About({ photo }: { photo: string | null }) {
  const about = profile.about;
  if (!about) return null;
  return (
    <>
      <h2>About me</h2>
      <figure className={`${s.taped} ${s.portrait}`}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={`Portrait of ${profile.name}`} width={640} height={800} loading="lazy" decoding="async" />
        ) : (
          <span className={s.mark} role="img" aria-label={`Portrait card of ${profile.name}`}>
            {initials(profile.name)}
          </span>
        )}
        <PhotoCorners />
      </figure>
      {about.story.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
      {about.loves.length > 0 && (
        <div>
          <h3>What I love building</h3>
          <ul className={s.chips}>
            {about.loves.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      {about.funFacts && about.funFacts.length > 0 && (
        <div>
          <h3>Fun facts</h3>
          <ul className={s.chips}>
            {about.funFacts.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      {about.cta && about.cta.length > 0 && (
        <div className={s.links}>
          {about.cta.map((c) => {
            const st = ctaState(c.href);
            return st.kind === "link" ? (
              <a key={c.label} className={s.ink} href={st.href} {...extProps(st.href)}>
                {c.label}
              </a>
            ) : (
              <span key={c.label} className={s.muted} aria-disabled="true">
                {c.label} · coming soon
              </span>
            );
          })}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- 4. projects: one spread each

function ProjectText({ p }: { p: Project }) {
  return (
    <>
      <p className={s.eyebrow}>Selected work · {p.year}</p>
      <h2>{p.name}</h2>
      <p className={s.tag}>{taglineOf(p)}</p>
      {p.disclaimer && <p className={s.note}>{p.disclaimer}</p>}
      <ul className={s.chips} aria-label="Tech stack">
        {p.stack.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <ul className={s.points}>
        {p.highlights.map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
      <div className={s.links}>
        {isRealLink(p.liveUrl) && (
          <a className={s.ink} href={p.liveUrl!} {...extProps(p.liveUrl!)}>
            Live site<span className={s.srOnly}> of {p.name}</span> ➚
          </a>
        )}
        {isRealLink(p.repoUrl) && (
          <a className={s.ink} href={p.repoUrl!} {...extProps(p.repoUrl!)}>
            Code<span className={s.srOnly}> for {p.name}</span> ➚
          </a>
        )}
      </div>
    </>
  );
}

function ProjectMediaPage({ p }: { p: Project }) {
  const shot = p.media?.screenshots?.[0] ?? null;
  return (
    <>
      <h3>{p.name}</h3>
      <TapedMedia name={p.name} year={p.year} video={videoUrl(p)} poster={p.media?.poster?.trim() || null} shot={shot} />
      {p.pitch && <p>{p.pitch}</p>}
      {p.audience && (
        <p>
          <strong>Who it helps:</strong> {p.audience}
        </p>
      )}
      {p.problem && (
        <p>
          <strong>The problem:</strong> {p.problem}
        </p>
      )}
      {p.metrics && p.metrics.length > 0 && (
        <ul className={s.points}>
          {p.metrics.map((m) => (
            <li key={m.label}>
              <strong>{m.value}</strong> {m.label}
              {m.plain ? `: ${m.plain}` : ""}
            </li>
          ))}
        </ul>
      )}
      {p.architecture && p.architecture.length > 0 && (
        <p className={s.muted}>{p.architecture.map((a) => `${a.label} (${a.tech})`).join(" → ")}</p>
      )}
    </>
  );
}

function Workshop() {
  const list = profile.workshop ?? [];
  return (
    <>
      <p className={s.eyebrow}>Selected work</p>
      <h2>More on GitHub · Workshop</h2>
      {list.map((w) => (
        <div key={w.id}>
          <h3>
            {w.name} <span className={s.badge}>Code only</span>
          </h3>
          <p>{w.blurb}</p>
          <ul className={s.chips} aria-label="Tech used">
            {w.stack.slice(0, 5).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <a className={s.ink} href={w.repoUrl} target="_blank" rel="noopener noreferrer">
            View code ➚<span className={s.srOnly}> for {w.name} on GitHub (opens in a new tab)</span>
          </a>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- 5. skills: real logos printed like ink stamps

function Stamp({ name }: { name: string }) {
  const l = logoFor(name);
  if (l.kind === "brand")
    return (
      <svg className={s.stamp} style={{ "--c": `#${l.logo.hex}` } as CSSProperties} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={l.logo.path} />
      </svg>
    );
  return (
    <svg className={s.stamp} data-generic="true" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={GENERIC[l.icon]} />
    </svg>
  );
}

function Skills() {
  let n = 0;
  return (
    <>
      <h2>Skills</h2>
      {profile.skills.map((group) => (
        <div key={group.category}>
          <h3>{group.label}</h3>
          <ul className={s.wheels}>
            {group.skills.map((sk) => (
              <li key={sk.name} className={s.wheel} style={{ "--r": `${[-1.2, 0.8, -0.5, 1.4, -1.6, 0.4][n++ % 6]}deg` } as CSSProperties}>
                <Stamp name={sk.name} />
                <span>
                  {sk.name}
                  <span className={s.srOnly}>, {sk.level} out of 100</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className={s.footnote}>Logos are trademarks of their owners.</p>
      <Doodle kind="flags" />
    </>
  );
}

// ---------------------------------------------------------------- 6. journey: an ink line that draws itself

type Milestone = { id: string; kind: "Experience" | "Education"; heading: string; org: string; period: string; points: string[]; sort: number };

/** Newest first. Empty fields are left out (see lib/robot/journey.ts). */
function milestones(): Milestone[] {
  const exp: Milestone[] = profile.experience.map((e) => ({
    id: e.id,
    kind: "Experience",
    heading: e.role,
    org: e.company,
    period: expPeriod(e),
    points: e.points,
    sort: isNow(e.end) ? 10000 : Number.parseInt(e.start, 10) || 0,
  }));
  const edu: Milestone[] = profile.education.map((e) => {
    const { title, meta } = eduRow(e);
    return { id: e.id, kind: "Education", heading: title, org: meta, period: "", points: [e.grade, ...e.highlights].filter(Boolean), sort: eduSortKey(e) };
  });
  return [...exp, ...edu].sort((a, b) => b.sort - a.sort);
}

function Journey() {
  const items = milestones();
  const noJobs = profile.experience.length === 0;
  let i = 0;
  return (
    <>
      <p className={s.eyebrow}>Path so far</p>
      <h2>My Journey</h2>
      <div className={s.tl}>
        <svg className={s.tlLine} viewBox="0 0 14 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path pathLength="1" d="M7 0 C 12 8, 2 14, 7 22 S 12 36, 7 44 S 2 58, 7 66 S 12 82, 7 100" />
        </svg>
        <ol>
          {noJobs && (
            <li className={s.tlItem} style={{ "--i": i++ } as CSSProperties}>
              <p>
                <span className={s.badge}>Next</span> My first role
              </p>
              <h3>Your company could be my first: let&apos;s talk</h3>
              <p>No jobs yet: the proof is the projects.</p>
              <a className={s.ink} href="#contact">Send a message →</a>
            </li>
          )}
          {items.map((m) => (
            <li key={m.id} className={s.tlItem} style={{ "--i": i++ } as CSSProperties}>
              <p>
                <span className={s.badge}>{m.kind}</span> {m.period}
              </p>
              <h3>{m.heading}</h3>
              {m.org && <p>{m.org}</p>}
              {m.points.length > 0 && (
                <ul className={s.points}>
                  {m.points.map((pt) => (
                    <li key={pt}>{pt}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

/** Proof, certificates and courses: only when there is something to show. */
function More() {
  const built = builtLine(profile);
  const cards = teamCards(profile);
  const open = profile.openTo ?? [];
  const learning = profile.education.find((e) => isNow(e.end));
  return (
    <>
      <p className={s.eyebrow}>Path so far</p>
      <h2>Proof and learning</h2>
      {built && (
        <div>
          <h3>What I&apos;ve built</h3>
          <p>{built}.</p>
        </div>
      )}
      {cards.length > 0 && (
        <div>
          <h3>What I can do for your team</h3>
          <ul className={s.points}>
            {cards.map((c) => (
              <li key={c.id}>
                <strong>{c.title}</strong>: {c.evidence}
              </li>
            ))}
          </ul>
        </div>
      )}
      {open.length > 0 && (
        <div>
          <h3>Open to</h3>
          <ul className={s.chips}>
            {open.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
      )}
      {learning && (
        <p>
          Currently learning at <strong>{learning.school}</strong>
        </p>
      )}
      {profile.certificates.length > 0 && (
        <div>
          <h3>Certificates</h3>
          <ul className={s.points}>
            {profile.certificates.map((c) => (
              <li key={c.id}>
                <a className={s.ink} href={c.url} {...extProps(c.url)}>
                  {c.name}
                </a>{" "}
                · {c.issuer}, {c.year}
              </li>
            ))}
          </ul>
        </div>
      )}
      {profile.courses.length > 0 && (
        <div>
          <h3>Courses</h3>
          {profile.courses.map((c) => (
            <div key={c.id}>
              <p>
                <strong>{c.name}</strong> · {c.provider}
              </p>
              <ul className={s.points}>
                {c.learned.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- 7. contact + 8. back cover

function Contact() {
  const { links } = profile;
  return (
    <>
      <p className={s.eyebrow}>Let&apos;s talk</p>
      <h2>Contact</h2>
      <p>{profile.summary}</p>
      <div>
        <ContactForm variant="panel" githubUrl={isRealLink(links.github) ? links.github : undefined} />
      </div>
      <div className={s.links}>
        {isRealEmail(links.email) && (
          <a className={s.ink} href={mailto(links.email)}>
            <MailIcon /> Email
          </a>
        )}
        {isRealLink(links.github) && (
          <a className={s.ink} href={links.github} {...extProps(links.github)}>
            <GithubIcon /> GitHub
          </a>
        )}
        {isRealLink(links.linkedin) && (
          <a className={s.ink} href={links.linkedin} {...extProps(links.linkedin)}>
            <LinkedinIcon /> LinkedIn
          </a>
        )}
        {isRealLink(links.resumeUrl) && (
          <a className={s.ink} href={links.resumeUrl} download>
            <DownloadIcon /> Download Resume
          </a>
        )}
      </div>
      <Doodle kind="pagoda" />
    </>
  );
}

function BackCover() {
  return (
    <>
      <h2>{profile.name}</h2>
      <p>{profile.title}</p>
      <p>
        <Link href={WORLD_HREF} className={s.seal}>
          Walk the town <span aria-hidden="true">→</span>
        </Link>
      </p>
      <p>© {new Date().getFullYear()} {profile.name}</p>
    </>
  );
}

/** All pages in book order. Projects get a text page and a media page each, so a spread = one project. */
export function buildPages(photo: string | null): PageDef[] {
  const out: PageDef[] = [page({ id: "contents", chapter: "contents", title: "Contents" }, <Contents />)];
  if (profile.about) out.push(page({ id: "about", chapter: "about", title: "About me" }, <About photo={photo} />));
  for (const p of profile.projects) {
    out.push(page({ id: p.id, chapter: "projects", title: p.name }, <ProjectText p={p} />));
    out.push(page({ id: `${p.id}-media`, chapter: "projects", title: `${p.name}, in pictures` }, <ProjectMediaPage p={p} />));
  }
  if ((profile.workshop ?? []).length > 0) out.push(page({ id: "workshop", chapter: "projects", title: "Workshop" }, <Workshop />));
  out.push(page({ id: "skills", chapter: "skills", title: "Skills" }, <Skills />));
  out.push(page({ id: "journey", chapter: "journey", title: "My Journey" }, <Journey />));
  const hasMore = !!builtLine(profile) || teamCards(profile).length > 0 || (profile.openTo ?? []).length > 0 || profile.certificates.length > 0 || profile.courses.length > 0;
  if (hasMore) out.push(page({ id: "journey-more", chapter: "journey", title: "Proof and learning" }, <More />));
  out.push(page({ id: "contact", chapter: "contact", title: "Contact" }, <Contact />));
  out.push(page({ id: "back", chapter: "back", title: "Back cover" }, <BackCover />));
  return out;
}
