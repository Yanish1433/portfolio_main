import Link from "next/link";
import type { CSSProperties } from "react";
import { profile } from "@/content/profile";
import { taglineOf } from "@/content/showcase";
import type { Project } from "@/content/profile";
import styles from "./recruiter.module.css";
import { ContactForm } from "./ContactForm";
import { DownloadIcon, GithubIcon, LinkedinIcon, MailIcon } from "./icons";
import { MagneticLink } from "./MagneticLink";
import { HeroMotion, Reveal, SkillsMotion, TimelineMotion } from "./motion";
import { Particles } from "./Particles";
import { ThemeToggle } from "./ThemeToggle";
import { ProjectsGallery } from "./ProjectsGallery";
import { LeadOrder } from "./LeadOrder";
import { TiltCard } from "./TiltCard";
import { eduRow, eduSortKey, expPeriod, isNow } from "@/lib/robot/journey";
import { ctaState, initials } from "@/components/world/about/aboutView";
import { Himalaya } from "@/components/landing/Himalaya";
import { CarvedFrame, PagodaRoof } from "@/components/landing/Ornaments";
import { isPlaceholder, isRealEmail, isRealLink } from "./links";
import { WORLD_HREF } from "@/components/landing/routes";
import { builtLine, teamCards } from "@/lib/robot/proof";

const isExternal = (url: string) => /^https?:/.test(url);
const mailto = (email: string) => (email.includes("@") ? `mailto:${email}` : email);
const extProps = (url: string) =>
  isExternal(url) ? { target: "_blank", rel: "noopener noreferrer" } : {};

function SectionHead({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <div className={styles.sectionHead} data-reveal>
      <PagodaRoof className={styles.roofMark} />
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2 id={id} className={styles.h2}>
        {title}
      </h2>
    </div>
  );
}

/* ───────────────────────── Hero ───────────────────────── */

export function TopNav() {
  return (
    <nav className={styles.topbar} aria-label="Page" data-recruiter-nav>
      <Link href={WORLD_HREF} className={styles.backLink}>
        <span aria-hidden="true">←</span> Back to 3D world
      </Link>
      <div className={styles.topRight}>
        <ul className={styles.topLinks}>
          <li><a href="#about">About</a></li>
          <li><a href="#projects">Projects</a></li>
          <li><a href="#skills">Skills</a></li>
          <li><a href="#journey">My Journey</a></li>
          <li><a href="#contact">Contact</a></li>
        </ul>
        <ThemeToggle />
      </div>
    </nav>
  );
}

export function Hero() {
  const { name, title, tagline, location, links } = profile;
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <Himalaya variant="band" />
      <Particles />
      <HeroMotion className={styles.heroInner}>
        <p className={styles.heroSub} data-hero-fade>
          <span lang="ne">छिटो परिचय</span>
          {!isPlaceholder(location) && (
            <>
              <span className={styles.heroSubDot} aria-hidden="true" />
              <span>{location}</span>
            </>
          )}
        </p>
        <h1 id="hero-title" className={styles.heroName} data-hero-name>
          {name}
        </h1>
        <p className={styles.heroTitle} data-hero-fade>{title}</p>
        <p className={styles.heroTag} data-hero-fade>{tagline}</p>
        <div className={styles.heroActions} data-hero-fade>
          {isRealLink(links.resumeUrl) && (
            <MagneticLink href={links.resumeUrl} variant="primary" download>
              <DownloadIcon /> Download Resume
            </MagneticLink>
          )}
          <MagneticLink href="#contact" variant={isRealLink(links.resumeUrl) ? "ghost" : "primary"}>
            <MailIcon /> Contact
          </MagneticLink>
          {isRealEmail(links.email) && (
            <MagneticLink href={mailto(links.email)}>
              <MailIcon /> Email
            </MagneticLink>
          )}
          {isRealLink(links.github) && (
            <MagneticLink href={links.github}>
              <GithubIcon /> GitHub
            </MagneticLink>
          )}
          {isRealLink(links.linkedin) && (
            <MagneticLink href={links.linkedin}>
              <LinkedinIcon /> LinkedIn
            </MagneticLink>
          )}
        </div>
      </HeroMotion>
      <a href="#projects" className={styles.scrollHint} aria-label="Scroll to projects">
        <span aria-hidden="true">↓</span>
      </a>
    </section>
  );
}

/* ───────────────────────── Projects ───────────────────────── */

function ProjectCard({ project, index }: { project: Project; index: number }) {
  const hue = (index * 55 + 165) % 360;
  const mediaStyle = {
    "--h1": `${hue}`,
    "--h2": `${(hue + 60) % 360}`,
  } as CSSProperties;
  return (
    <li className={styles.cardItem}>
      <TiltCard>
        <div className={styles.cardMedia} style={mediaStyle}>
          {project.demoVideo ? (
            <video
              className={styles.cardVideo}
              src={project.demoVideo}
              muted
              loop
              playsInline
              preload="none"
              aria-label={`${project.name} demo video`}
            />
          ) : (
            <span className={styles.cardMediaMark} aria-hidden="true">
              {project.name.slice(0, 2)}
            </span>
          )}
          <span className={styles.cardYear}>{project.year}</span>
        </div>
        <div className={styles.cardBody}>
          <h3 className={styles.cardTitle}>{project.name}</h3>
          <p className={styles.cardTag}>{taglineOf(project)}</p>
          {project.disclaimer && <p className={styles.cardNote}>{project.disclaimer}</p>}
          <ul className={styles.chips} aria-label="Tech stack">
            {project.stack.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <ul className={styles.highlights}>
            {project.highlights.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
          <div className={styles.cardActions}>
            {project.liveUrl && (
              <a className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} href={project.liveUrl} {...extProps(project.liveUrl)}>
                Live<span className={styles.srOnly}> demo of {project.name}</span>
              </a>
            )}
            {project.repoUrl && (
              <a className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} href={project.repoUrl} {...extProps(project.repoUrl)}>
                Code<span className={styles.srOnly}> for {project.name}</span>
              </a>
            )}
            {project.caseStudyUrl && (
              <a className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} href={project.caseStudyUrl} {...extProps(project.caseStudyUrl)}>
                Case study<span className={styles.srOnly}> for {project.name}</span>
              </a>
            )}
          </div>
        </div>
      </TiltCard>
    </li>
  );
}

export function Projects() {
  return (
    <>
      <ProjectsGallery header={<SectionHead id="projects-title" eyebrow="Selected work" title="Projects" />}>
        <LeadOrder>
          {profile.projects.map((p, i) => (
            <ProjectCard key={p.id} project={p} index={i} />
          ))}
        </LeadOrder>
      </ProjectsGallery>
      <Workshop />
    </>
  );
}

/** GitHub-only projects: compact "Code only" cards. */
function Workshop() {
  const list = profile.workshop ?? [];
  if (!list.length) return null;
  return (
    <section id="workshop" className={styles.section} aria-labelledby="workshop-title">
      <Reveal>
        <h3 className={styles.h3} id="workshop-title" data-reveal>
          More on GitHub · Workshop
        </h3>
        <ul className={styles.workshopGrid}>
          {list.map((w) => (
            <li key={w.id} data-reveal>
              <article className={styles.workCard}>
                <div className={styles.workFoot}>
                  <h4>{w.name}</h4>
                  <span className={styles.badge}>Code only</span>
                </div>
                <p>{w.blurb}</p>
                <ul className={styles.chips} aria-label="Tech used">
                  {w.stack.slice(0, 5).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <a className={styles.workLink} href={w.repoUrl} target="_blank" rel="noopener">
                  View code <span aria-hidden="true">↗</span>
                  <span className={styles.srOnly}> for {w.name} on GitHub (opens in a new tab)</span>
                </a>
              </article>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}

/* ───────────────────────── Skills ───────────────────────── */

const R = 22;
const CIRC = 2 * Math.PI * R;

function SkillRing({ level }: { level: number }) {
  const offset = CIRC * (1 - level / 100);
  return (
    <svg className={styles.ring} width="56" height="56" viewBox="0 0 56 56" aria-hidden="true" focusable="false">
      <circle cx="28" cy="28" r={R} className={styles.ringTrack} />
      <circle
        cx="28"
        cy="28"
        r={R}
        className={styles.ringBar}
        strokeDasharray={CIRC}
        strokeDashoffset={offset}
        data-ring
        data-offset={offset}
        data-full={CIRC}
        transform="rotate(-90 28 28)"
      />
      <text x="28" y="32" textAnchor="middle" className={styles.ringText}>
        {level}
      </text>
    </svg>
  );
}

export function About({ photo = null }: { photo?: string | null }) {
  const about = profile.about;
  if (!about) return null;
  return (
    <section id="about" className={styles.section} aria-labelledby="about-title">
      <Reveal>
        <SectionHead id="about-title" eyebrow="Meet me" title="About" />
        <div className={styles.aboutGrid} data-reveal>
          {photo ? (
            <CarvedFrame className={styles.aboutFrame}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt={`Portrait of ${profile.name}`} width={640} height={800} loading="lazy" decoding="async" />
            </CarvedFrame>
          ) : (
            <div className={styles.aboutCard} role="img" aria-label={`Portrait card of ${profile.name}`}>
              {initials(profile.name)}
            </div>
          )}
          <div className={styles.aboutStory}>
            {about.story.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
            {about.loves.length > 0 && (
              <>
                <h3 className={styles.h3}>What I love building</h3>
                <ul className={styles.aboutChips}>
                  {about.loves.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </>
            )}
            {about.funFacts && about.funFacts.length > 0 && (
              <>
                <h3 className={styles.h3}>Fun facts</h3>
                <ul className={styles.aboutChips}>
                  {about.funFacts.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </>
            )}
            {about.cta && about.cta.length > 0 && (
              <div className={styles.aboutBtns}>
                {about.cta.map((c) => {
                  const st = ctaState(c.href);
                  return st.kind === "link" ? (
                    <a key={c.label} className={styles.aboutBtn} href={st.href} {...extProps(st.href)}>
                      {c.label}
                    </a>
                  ) : (
                    <span key={c.label} className={`${styles.aboutBtn} ${styles.aboutBtnOff}`} aria-disabled="true">
                      {c.label} · coming soon
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function Skills() {
  return (
    <section id="skills" className={styles.section} aria-labelledby="skills-title">
      <Reveal>
        <SectionHead id="skills-title" eyebrow="Toolbox" title="Skills" />
      </Reveal>
      <SkillsMotion className={styles.skillGrid}>
        {profile.skills.map((group) => (
          <div key={group.category} className={styles.skillGroup} data-skill-group>
            <h3 className={styles.h3}>{group.label}</h3>
            <ul className={styles.skillList}>
              {group.skills.map((s) => (
                <li key={s.name} className={styles.skill} data-skill>
                  <SkillRing level={s.level} />
                  <span className={styles.skillName}>
                    {s.name}
                    <span className={styles.srOnly}>, {s.level} out of 100</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </SkillsMotion>
    </section>
  );
}

/* ───────────────────── Education & Experience ───────────────────── */

type Milestone = {
  id: string;
  kind: "Experience" | "Education";
  heading: string;
  org: string;
  period: string;
  points: string[];
  sort: number;
};

/** Newest first, like the world's scroll. Empty fields are left out (see lib/robot/journey.ts). */
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
    return {
      id: e.id,
      kind: "Education",
      heading: title,
      org: meta,
      period: "",
      points: [e.grade, ...e.highlights].filter(Boolean),
      sort: eduSortKey(e),
    };
  });
  return [...exp, ...edu].sort((a, b) => b.sort - a.sort);
}

/** Proof instead of job titles: derived from the projects (lib/robot/proof.ts), so nothing is invented. */
function JourneyProof() {
  const built = builtLine(profile);
  const cards = teamCards(profile);
  const open = profile.openTo ?? [];
  const learning = profile.education.find((e) => isNow(e.end));
  if (!built && !cards.length && !open.length && !learning) return null;
  return (
    <Reveal className={styles.proof}>
      {built && (
        <div data-reveal>
          <h3 className={styles.h3}>What I&apos;ve built</h3>
          <p className={styles.proofBuilt}>{built}.</p>
        </div>
      )}
      {cards.length > 0 && (
        <div data-reveal>
          <h3 className={styles.h3}>What I can do for your team</h3>
          <ul className={styles.proofGrid}>
            {cards.map((c) => (
              <li key={c.id} className={styles.proofCard}>
                <h4>{c.title}</h4>
                <p>{c.evidence}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {open.length > 0 && (
        <div className={styles.proofRow} data-reveal>
          <strong>Open to</strong>
          <ul className={styles.chips}>
            {open.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
      )}
      {learning && (
        <p className={styles.proofLearning} data-reveal>
          Currently learning at <strong>{learning.school}</strong>
        </p>
      )}
    </Reveal>
  );
}

export function Journey() {
  const items = milestones();
  const noJobs = profile.experience.length === 0;
  // #experience / #education point at the first entry of each kind (the list is newest first).
  const firstOf = (kind: Milestone["kind"]) => items.find((m) => m.kind === kind)?.id;
  const anchorId = (m: Milestone) =>
    m.id === firstOf(m.kind) ? (m.kind === "Experience" ? "experience" : "education") : undefined;
  return (
    <section id="journey" className={styles.section} aria-labelledby="journey-title">
      <Reveal>
        <SectionHead id="journey-title" eyebrow="Path so far" title="My Journey" />
      </Reveal>
      <JourneyProof />
      <TimelineMotion className={styles.timeline}>
        <div className={styles.tlTrack} aria-hidden="true">
          <div className={styles.tlLine} data-tl-line />
        </div>
        <ol className={styles.tlList}>
          {noJobs && (
            <li id="experience" className={styles.tlItem} data-tl-item>
              <span className={styles.tlDot} data-tl-dot aria-hidden="true" />
              <div className={styles.tlCard}>
                <p className={styles.tlPeriod}>
                  <span className={styles.badge}>Next</span> My first role
                </p>
                <h3 className={styles.tlTitle}>Your company could be my first: let&apos;s talk</h3>
                <p className={styles.tlOrg}>No jobs yet: the proof is the projects above.</p>
                <p>
                  <a className={styles.tlOrg} href="#contact">Send a message →</a>
                </p>
              </div>
            </li>
          )}
          {items.map((m) => (
            <li key={m.id} id={anchorId(m)} className={styles.tlItem} data-tl-item>
              <span className={styles.tlDot} data-tl-dot aria-hidden="true" />
              <div className={styles.tlCard}>
                <p className={styles.tlPeriod}>
                  <span className={styles.badge}>{m.kind}</span> {m.period}
                </p>
                <h3 className={styles.tlTitle}>{m.heading}</h3>
                {m.org && <p className={styles.tlOrg}>{m.org}</p>}
                {m.points.length > 0 && (
                  <ul className={styles.highlights}>
                    {m.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      </TimelineMotion>

      {profile.certificates.length > 0 && (
      <Reveal className={styles.subBlock}>
        <h3 className={styles.h3} data-reveal>Certificates</h3>
        <ul className={styles.certGrid}>
          {profile.certificates.map((c) => (
            <li key={c.id} data-reveal>
              <a className={styles.cert} href={c.url} {...extProps(c.url)}>
                <span className={styles.certYear}>{c.year}</span>
                <span className={styles.certName}>{c.name}</span>
                <span className={styles.certIssuer}>{c.issuer}</span>
              </a>
            </li>
          ))}
        </ul>
      </Reveal>
      )}

      {profile.courses.length > 0 && (
      <Reveal className={styles.subBlock}>
        <h3 className={styles.h3} data-reveal>Courses</h3>
        <ul className={styles.books}>
          {profile.courses.map((c, i) => (
            <li key={c.id} data-reveal>
              <details className={styles.book} style={{ "--h1": `${(i * 70 + 170) % 360}` } as CSSProperties}>
                <summary>
                  <span className={styles.bookName}>{c.name}</span>
                  <span className={styles.bookProvider}>{c.provider}</span>
                </summary>
                <div className={styles.bookPages}>
                  <p className={styles.bookLearned}>What I learned</p>
                  <ul className={styles.highlights}>
                    {c.learned.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Reveal>
      )}
    </section>
  );
}

/* ───────────────────────── Contact + footer ───────────────────────── */

export function Contact() {
  return (
    <section id="contact" className={styles.section} aria-labelledby="contact-title">
      <Reveal>
        <SectionHead id="contact-title" eyebrow="Let's talk" title="Contact" />
        <div className={styles.contactGrid}>
          <p className={styles.contactLead} data-reveal>
            {profile.summary}
          </p>
          <div data-reveal>
            <ContactForm githubUrl={profile.links.github} />
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function Footer() {
  const { name, links } = profile;
  return (
    <footer className={styles.footer}>
      <p>© {new Date().getFullYear()} {name}</p>
      <ul className={styles.footLinks}>
        {isRealLink(links.github) && <li><a href={links.github} {...extProps(links.github)}>GitHub</a></li>}
        {isRealLink(links.linkedin) && <li><a href={links.linkedin} {...extProps(links.linkedin)}>LinkedIn</a></li>}
        {isRealEmail(links.email) && <li><a href={mailto(links.email)}>Email</a></li>}
        <li><Link href={WORLD_HREF}>Back to 3D world</Link></li>
      </ul>
    </footer>
  );
}
