"use client";

import s from "./landing.module.css";

/** Sun / moon button: flips data-theme on the landing wrapper and stores the same key the 3D world uses. */
export function LandingTheme() {
  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    const root = e.currentTarget.closest<HTMLElement>("[data-landing-root]");
    if (!root) return;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("world-theme", next === "dark" ? "night" : "day");
    } catch {
      /* storage blocked: the choice just lasts for this visit */
    }
  }
  return (
    <button type="button" className={s.themeBtn} onClick={toggle} aria-label="Switch between day and night colours">
      <svg className={s.iconSun} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <svg className={s.iconMoon} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    </button>
  );
}
