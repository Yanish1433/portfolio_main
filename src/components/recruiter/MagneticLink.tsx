"use client";

import { useRef } from "react";
import { gsap, useGSAP, HOVER_MOTION_OK } from "./gsap-setup";
import styles from "./recruiter.module.css";

type Props = {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost";
  download?: boolean;
  label?: string;
};

/** Link-styled button that is gently pulled toward the cursor (hover devices only). */
export function MagneticLink({ href, children, variant = "ghost", download, label }: Props) {
  const ref = useRef<HTMLAnchorElement>(null);
  const external = /^https?:/.test(href);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(HOVER_MOTION_OK, () => {
        const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3" });
        const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3" });
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          xTo((e.clientX - (r.left + r.width / 2)) * 0.3);
          yTo((e.clientY - (r.top + r.height / 2)) * 0.4);
        };
        const leave = () => {
          xTo(0);
          yTo(0);
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerleave", leave);
        return () => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerleave", leave);
        };
      });
      return () => mm.revert();
    },
    { scope: ref },
  );

  return (
    <a
      ref={ref}
      href={href}
      className={`${styles.btn} ${variant === "primary" ? styles.btnPrimary : styles.btnGhost}`}
      download={download ? "" : undefined}
      aria-label={label}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}
