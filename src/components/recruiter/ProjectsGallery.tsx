"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger, useGSAP, MOTION_OK } from "./gsap-setup";
import styles from "./recruiter.module.css";

type Props = { header: React.ReactNode; children: React.ReactNode };

/**
 * Pinned horizontal-scroll gallery on desktop; a native swipe row (scroll-snap)
 * on mobile and under reduced motion.
 */
export function ProjectsGallery({ header, children }: Props) {
  const section = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  // true when every card fits on screen: then no pinned scroll, and the cards are centred
  const [fits, setFits] = useState(false);

  useEffect(() => {
    const measure = () => {
      const tr = track.current;
      if (tr) setFits(tr.scrollWidth <= window.innerWidth);
    };
    measure();
    window.addEventListener("resize", measure);
    document.fonts.ready.then(measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(`(min-width: 768px) and ${MOTION_OK}`, () => {
        const sec = section.current;
        const vp = viewport.current;
        const tr = track.current;
        if (!sec || !vp || !tr || fits) return;

        vp.style.overflow = "visible";
        const dist = () => Math.max(0, tr.scrollWidth - window.innerWidth);

        const tween = gsap.to(tr, {
          x: () => -dist(),
          ease: "none",
          scrollTrigger: {
            trigger: sec,
            pin: true,
            scrub: 1,
            start: "top top",
            end: () => "+=" + dist(),
            invalidateOnRefresh: true,
            anticipatePin: 1,
          },
        });
        if (bar.current) {
          gsap.fromTo(
            bar.current,
            { scaleX: 0 },
            { scaleX: 1, ease: "none", transformOrigin: "left center", scrollTrigger: tween.scrollTrigger },
          );
        }

        let cancelled = false;
        document.fonts.ready.then(() => {
          if (!cancelled) ScrollTrigger.refresh();
        });

        return () => {
          cancelled = true;
          vp.style.overflow = "";
        };
      });
      return () => mm.revert();
    },
    { scope: section, dependencies: [fits] },
  );

  return (
    <section ref={section} id="projects" className={styles.gallery} data-fits={fits ? "" : undefined} aria-labelledby="projects-title">
      {header}
      <div ref={viewport} className={styles.galleryViewport}>
        <ul ref={track} className={styles.galleryTrack}>
          {children}
        </ul>
      </div>
      <div className={styles.galleryProgress} aria-hidden="true">
        <div ref={bar} className={styles.galleryProgressBar} />
      </div>
    </section>
  );
}
