import type { Metadata } from "next";
import Image from "next/image";
import { profile, type Project } from "@/content/profile";
import { featuredProjects, leadProject } from "@/content/showcase";
import { ExploreDoor, ReadDoor } from "@/components/landing/Doors";
import { Greeting } from "@/components/landing/Greeting";
import { PagodaBg } from "@/components/landing/PagodaBg";
import { RECRUITER_HREF } from "@/components/landing/routes";
import s from "@/components/landing/landing.module.css";
import TimePill from "@/lib/time/TimePill";
import { TIME_SCRIPT } from "@/lib/time/timeScript";

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

/** The three proof photos: flagships first, then any other project that has a poster. Cards without one are left out. */
function proofProjects(): Project[] {
  const flags = featuredProjects();
  const rest = profile.projects.filter((p) => !flags.includes(p) && p.media?.poster);
  return [...flags, ...rest].filter((p) => p.media?.poster).slice(0, 3);
}

export default function Landing() {
  const proof = proofProjects();
  return (
    // The inline script sets data-theme (day|night) and --glow on this wrapper before first paint, so React must not complain.
    <div className={s.root} data-time-root data-landing-root suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: TIME_SCRIPT }} />
      <link rel="preload" href="/fonts/Kalam-Regular-devanagari.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <PagodaBg />
      <TimePill className={s.timeCorner} />
      <i className={s.sparks} aria-hidden="true">
        <b /><b /><b /><b /><b /><b />
      </i>
      <main className={s.main}>
        <Greeting>
          <p className={s.namaste} lang="ne">नमस्ते</p>
          <h1 className={s.welcome}>Welcome to my portfolio</h1>
          <p className={s.who}>
            {profile.name} · {profile.title}
          </p>
        </Greeting>
        <div className={s.doors}>
          <ExploreDoor />
          <ReadDoor />
        </div>
        {proof.length > 0 && (
          <ul className={s.proof} aria-label="A few projects">
            {proof.map((p, i) => (
              <li key={p.id} className={s.photo} style={{ "--tilt": `${[-2, 1.5, -1][i]}deg` } as React.CSSProperties}>
                <a href={`${RECRUITER_HREF}#${p.id}`}>
                  <Image src={p.media!.poster!} alt="" width={1600} height={760} sizes="(min-width: 900px) 220px, 30vw" loading="lazy" />
                  <span>{p.name}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
