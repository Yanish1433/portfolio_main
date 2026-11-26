import { initialTheme, useWorld } from "@/store/world";
import type { Theme } from "@/store/world";

/** Recruiter Mode says light/dark, the 3D world says day/night. This file is the only place that maps them. */
export type Mode = "light" | "dark";

export const THEME_COLOR: Record<Mode, string> = { light: "#faf6ef", dark: "#070b16" };

export const toMode = (t: Theme): Mode => (t === "night" ? "dark" : "light");
export const toTheme = (m: Mode): Theme => (m === "dark" ? "night" : "day");

export const THEME_EVENT = "themechange";

const wrapper = () => document.querySelector<HTMLElement>("[data-recruiter-root]");

/** What the inline script put on the wrapper, or (if it never ran, e.g. client-side navigation) the same rule in code. */
export function readMode(): Mode {
  const set = wrapper()?.dataset.theme;
  return set === "light" || set === "dark" ? set : toMode(initialTheme());
}

function setMetaThemeColor(mode: Mode) {
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.content = THEME_COLOR[mode];
  });
}

let fadeTimer: number | undefined;

/**
 * Applies a mode to the wrapper, <html> (via the world store, so the 3D world keeps the choice) and theme-color.
 * `persist` writes localStorage "world-theme"; `animate` turns on the 300 ms colour fade.
 */
export function applyMode(mode: Mode, opts: { persist: boolean; animate?: boolean }) {
  const el = wrapper();
  if (el) {
    if (opts.animate) {
      el.dataset.animating = "";
      window.clearTimeout(fadeTimer);
      fadeTimer = window.setTimeout(() => delete el.dataset.animating, 350);
    }
    el.dataset.theme = mode;
  }
  useWorld.getState().setTheme(toTheme(mode), opts.persist);
  document.documentElement.dataset.theme = mode;
  setMetaThemeColor(mode);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: mode }));
}
