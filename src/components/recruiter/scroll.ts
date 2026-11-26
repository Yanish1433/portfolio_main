import type Lenis from "lenis";

let lenis: Lenis | null = null;

/** ScrollProvider registers its Lenis instance here (null under reduced motion, or after unmount). */
export function setLenis(instance: Lenis | null) {
  lenis = instance;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Smooth-scroll to an in-page "#id", clearing the fixed nav. Falls back to scrollIntoView without Lenis. */
export function scrollToHash(hash: string): boolean {
  const id = decodeURIComponent(hash.replace(/^#/, ""));
  const el = id ? document.getElementById(id) : document.documentElement;
  if (!el) return false;
  const nav = document.querySelector<HTMLElement>("[data-recruiter-nav]");
  const offset = -(nav?.offsetHeight ?? 0);
  if (lenis && !reducedMotion()) {
    if (id === "top") lenis.scrollTo(0);
    else lenis.scrollTo(el, { offset });
  } else {
    el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  }
  history.replaceState(null, "", id && id !== "top" ? `#${id}` : location.pathname + location.search);
  return true;
}
