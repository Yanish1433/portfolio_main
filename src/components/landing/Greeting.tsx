"use client";

import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { inkWrite } from "@/components/book";
import s from "./landing.module.css";

/** The greeting: the book kit's pen writes each line. Real text from the start; a tap or key shows it all; none under reduced motion. */
export function Greeting({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const w = inkWrite(el, Array.from(el.children) as HTMLElement[]);
    const skip = () => w.finish();
    window.addEventListener("pointerdown", skip, { once: true });
    window.addEventListener("keydown", skip, { once: true });
    return () => {
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
      w.cancel();
    };
  }, []);
  return (
    <div ref={host} className={s.greeting}>
      {children}
    </div>
  );
}
