"use client";

import { useRef } from "react";
import { gsap, SplitText, useGSAP, MOTION_OK } from "./gsap-setup";

type WrapProps = { children: React.ReactNode; className?: string };

/** Hero: letter-by-letter name reveal (SplitText), then fades, plus a scroll parallax. */
export function HeroMotion({ children, className }: WrapProps) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, (ctx) => {
        let cancelled = false;
        const name = el.querySelector<HTMLElement>("[data-hero-name]");
        const fades = el.querySelectorAll<HTMLElement>("[data-hero-fade]");

        document.fonts.ready.then(() => {
          if (cancelled) return;
          ctx.add(() => {
            if (name) {
              SplitText.create(name, {
                type: "chars",
                autoSplit: true,
                aria: "auto",
                onSplit(self) {
                  return gsap.from(self.chars, {
                    opacity: 0,
                    yPercent: 60,
                    rotateX: -70,
                    transformOrigin: "50% 100%",
                    duration: 0.7,
                    ease: "power3.out",
                    stagger: 0.045,
                  });
                },
              });
            }
            gsap.from(fades, {
              opacity: 0,
              y: 22,
              duration: 0.8,
              ease: "power2.out",
              stagger: 0.14,
              delay: name ? 0.75 : 0,
            });
          });
        });

        gsap.to(el, {
          yPercent: -10,
          opacity: 0.25,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top top",
            end: "bottom top",
            scrub: true,
          },
        });

        return () => {
          cancelled = true;
        };
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}

/** Generic scroll reveal: animates [data-reveal] descendants (or itself) with a stagger. */
export function Reveal({ children, className }: WrapProps) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const found = el.querySelectorAll("[data-reveal]");
        const targets = found.length ? Array.from(found) : [el];
        gsap.from(targets, {
          opacity: 0,
          y: 40,
          duration: 0.8,
          ease: "power3.out",
          stagger: 0.1,
          scrollTrigger: { trigger: el, start: "top 85%", once: true },
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}

/** Skills: chips fly in with a stagger and snap into the grid; rings fill to their level. */
export function SkillsMotion({ children, className }: WrapProps) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        el.querySelectorAll<HTMLElement>("[data-skill-group]").forEach((group) => {
          const chips = group.querySelectorAll<HTMLElement>("[data-skill]");
          const rings = group.querySelectorAll<SVGCircleElement>("[data-ring]");
          const tl = gsap.timeline({
            scrollTrigger: { trigger: group, start: "top 82%", once: true },
          });
          tl.from(group, { opacity: 0, y: 30, duration: 0.5, ease: "power2.out" });
          tl.from(
            chips,
            {
              x: () => gsap.utils.random(-220, 220),
              y: () => gsap.utils.random(-140, 140),
              rotation: () => gsap.utils.random(-25, 25),
              scale: 0.4,
              opacity: 0,
              duration: 0.9,
              ease: "back.out(1.5)",
              stagger: 0.08,
            },
            "<0.1",
          );
          rings.forEach((ring, i) => {
            const target = Number(ring.dataset.offset);
            const full = Number(ring.dataset.full);
            tl.fromTo(
              ring,
              { strokeDashoffset: full },
              { strokeDashoffset: target, duration: 1.3, ease: "power2.out" },
              0.5 + i * 0.08,
            );
          });
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}

/** Timeline: the line draws itself while scrolling; milestones pop in. */
export function TimelineMotion({ children, className }: WrapProps) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const line = el.querySelector("[data-tl-line]");
        if (line) {
          gsap.fromTo(
            line,
            { scaleY: 0 },
            {
              scaleY: 1,
              ease: "none",
              transformOrigin: "top center",
              scrollTrigger: {
                trigger: el,
                start: "top 70%",
                end: "bottom 60%",
                scrub: 0.6,
              },
            },
          );
        }
        el.querySelectorAll<HTMLElement>("[data-tl-item]").forEach((item) => {
          gsap.from(item, {
            opacity: 0,
            y: 50,
            scale: 0.94,
            duration: 0.7,
            ease: "back.out(1.4)",
            scrollTrigger: { trigger: item, start: "top 85%", once: true },
          });
          const dot = item.querySelector("[data-tl-dot]");
          if (dot) {
            gsap.from(dot, {
              scale: 0,
              duration: 0.5,
              ease: "back.out(3)",
              scrollTrigger: { trigger: item, start: "top 85%", once: true },
            });
          }
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
