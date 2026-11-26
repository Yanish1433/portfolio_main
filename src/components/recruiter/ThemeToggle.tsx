"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import styles from "./recruiter.module.css";
import { applyMode, readMode } from "./theme";
import type { Mode } from "./theme";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Sun/moon button. Also mirrors the wrapper's theme to <html> and the world store after hydration. */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode | null>(null);

  useIsoLayoutEffect(() => {
    const m = readMode();
    setMode(m);
    applyMode(m, { persist: false });
  }, []);

  function toggle() {
    const next: Mode = (mode ?? readMode()) === "dark" ? "light" : "dark";
    setMode(next);
    applyMode(next, { persist: true, animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches });
  }

  return (
    <button
      type="button"
      className={styles.themeBtn}
      onClick={toggle}
      aria-label={mode ? `Switch to ${mode === "dark" ? "light" : "dark"} theme` : "Switch colour theme"}
    >
      <svg className={styles.iconSun} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <svg className={styles.iconMoon} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    </button>
  );
}
