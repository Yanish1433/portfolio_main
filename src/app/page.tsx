import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { profile, type Project } from "@/content/profile";
import { featuredProjects, leadProject, taglineOf } from "@/content/showcase";
import { ExploreLink } from "@/components/landing/ExploreLink";
import { Himalaya } from "@/components/landing/Himalaya";
import { LandingTheme } from "@/components/landing/LandingTheme";
import { LeadSwap } from "@/components/landing/LeadSwap";
import { CarvedFrame, DhakaBand, NewariBand, PagodaRoof } from "@/components/landing/Ornaments";
import { Parallax } from "@/components/landing/Parallax";
import { PrayerFlags } from "@/components/landing/PrayerFlags";
import { DHAKA_URL } from "@/components/landing/art";
import { RECRUITER_HREF, WORLD_HREF } from "@/components/landing/routes";
import s from "@/components/landing/landing.module.css";

const lead = leadProject();
const posterOf = (p: Project) => p.media?.poster ?? `/showcase/${p.id}/poster.webp`;
const description = `${profile.name}: ${profile.title}. ${profile.tagline} Walk through my 3D Bhaktapur-style town, or take the quick view.`;

export const metadata: Metadata = {
  title: `${profile.name} · ${profile.title}`,
  description,
  openGraph: {
    type: "website",
    title: `${profile.name} · ${profile.title}`,
    description,
    images: lead ? [{ url: posterOf(lead), width: 1600, height: 760, alt: `${lead.name}, a project by ${profile.name}` }] : undefined,
  },
  twitter: { card: "summary_large_image", title: `${profile.name} · ${profile.title}`, description },
};

// Applies the same choice the toggle makes (?theme, then localStorage "world-theme"), else the system theme, before first paint.
const THEME_SCRIPT = `(function(){try{var d=document.currentScript.parentElement;var t=new URLSearchParams(location.search).get("theme");if(t!=="day"&&t!=="night"){try{t=localStorage.getItem("world-theme")}catch(e){t=null}}if(t!=="day"&&t!=="night"){t=matchMedia("(prefers-color-scheme: dark)").matches?"night":"day"}d.dataset.theme=t==="night"?"dark":"light"}catch(e){}})();`;

/** One short line from the summary: the first clause, ending in a full stop. */
function oneLine(text: string): string {
  const cut = text.length > 110 && text.includes(":") ? text.split(":")[0] : text;
  return /[.!?]$/.test(cut) ? cut : `${cut}.`;
}

function ProjectCard({ p }: { p: Project }) {
  return (
    <li className={s.card}>
      <div className={s.cardMedia}>
        <Image
          src={posterOf(p)}
          alt={`${p.name}: screenshot of the project`}
          width={1600}
          height={760}
          sizes="(min-width: 900px) 540px, calc(100vw - 40px)"
          className={s.cardImg}
        />
        <span className={s.cardYear}>{p.year}</span>
      </div>
      <div className={s.cardBody}>
        <h3 className={s.cardTitle}>{p.name}</h3>
        <p className={s.cardPitch}>{p.pitch ?? taglineOf(p)}</p>
        {p.disclaimer && <p className={s.cardNote}>{p.disclaimer}</p>}
        <div className={s.cardActions}>
          {p.liveUrl && (
            <a className={`${s.btn} ${s.btnSolid}`} href={p.liveUrl} target="_blank" rel="noopener noreferrer">
              Live<span className={s.srOnly}> demo of {p.name}</span>
            </a>
          )}
          {p.repoUrl && (
            <a className={`${s.btn} ${s.btnLine}`} href={p.repoUrl} target="_blank" rel="noopener noreferrer">
              Code<span className={s.srOnly}> for {p.name}</span>
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

export default function Landing() {
  const flagships = featuredProjects();
  const about = profile.about;
  const story = about?.story.slice(0, 2) ?? [];
  const photo = about?.photo;
  return (
    <div className={s.root} data-landing-root suppressHydrationWarning style={{ "--dhaka": DHAKA_URL } as React.CSSProperties}>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      {/* The one Devanagari weight (the name) and the Latin file, fetched early so the name never flashes in a fallback. */}
      <link rel="preload" href="/fonts/Mukta-SemiBold-devanagari.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <link rel="preload" href="/fonts/Mukta-SemiBold-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />

      <Parallax className={s.hero}>
        <Himalaya variant="full" />
        <PrayerFlags />
        <div className={s.topRight}>
          <LandingTheme />
        </div>
        <div className={s.heroInner}>
          <p className={s.namaste} lang="ne">
            नमस्ते
          </p>
          <h1 className={s.name}>
            {profile.name}
            <span className={s.nameNe} lang="ne">
              यानिश गुरुङ
            </span>
          </h1>
          <p className={s.title}>{profile.title}</p>
          <p className={s.tagline}>{oneLine(profile.summary)}</p>
          <div className={s.heroActions}>
            <ExploreLink href={WORLD_HREF} className={`${s.cta} ${s.ctaPrimary}`}>
              <PagodaRoof className={s.ctaIcon} />
              <span>
                Explore my 3D town
                <small lang="ne">मेरो सहर घुम्नुहोस्</small>
              </span>
            </ExploreLink>
            <Link href={RECRUITER_HREF} className={`${s.cta} ${s.ctaSecondary}`}>
              <span>
                Quick view
                <small lang="ne">छिटो परिचय</small>
              </span>
            </Link>
          </div>
        </div>
      </Parallax>

      <DhakaBand className={s.divider} />

      <main className={s.below}>
        <section className={s.section} aria-labelledby="work-title">
          <div className={s.head}>
            <PagodaRoof className={s.headRoof} />
            <p className={s.eyebrow} lang="ne">मेरो काम</p>
            <h2 id="work-title" className={s.h2}>Featured work</h2>
          </div>
          <ul className={s.cards}>
            <LeadSwap ids={flagships.map((p) => p.id)}>
              {flagships.map((p) => (
                <ProjectCard key={p.id} p={p} />
              ))}
            </LeadSwap>
          </ul>
        </section>

        <section className={`${s.section} ${s.aboutSec}`} aria-labelledby="about-title">
          <div className={s.aboutGrid}>
            <div className={s.photo}>
              <CarvedFrame>
                {photo ? (
                  <Image src={photo} alt={`Portrait of ${profile.name}`} width={640} height={800} sizes="(min-width: 760px) 300px, 70vw" className={s.photoImg} />
                ) : (
                  <div className={s.photoFallback} role="img" aria-label={`Portrait card of ${profile.name}`}>
                    {profile.name.split(" ").map((w) => w[0]).join("")}
                  </div>
                )}
              </CarvedFrame>
            </div>
            <div className={s.aboutText}>
              <PagodaRoof className={s.headRoof} />
              <p className={s.eyebrow} lang="ne">मेरो बारेमा</p>
              <h2 id="about-title" className={s.h2}>About me</h2>
              {story.map((line) => (
                <p key={line} className={s.aboutLine}>{line}</p>
              ))}
              <div className={s.links}>
                <a className={`${s.btn} ${s.btnSolid}`} href={profile.links.github} target="_blank" rel="noopener noreferrer">GitHub</a>
                <Link className={`${s.btn} ${s.btnLine}`} href={`${RECRUITER_HREF}#contact`}>Contact</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <DhakaBand className={s.divider} />
        <NewariBand />
        <p className={s.copy}>© {new Date().getFullYear()} {profile.name} · <span lang="ne">भक्तपुरको शैलीमा बनाइएको</span></p>
      </footer>
    </div>
  );
}
