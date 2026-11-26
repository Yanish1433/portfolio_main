import { create } from "zustand";
import type { CharacterId } from "@/components/world/characters";
import type { SkillCategory } from "@/content/profile";

export type Vec2 = [number, number];
export type Theme = "day" | "night";

/** What the shared info panel shows (Project Hall stands, plaques, certificates, books). */
export type InfoKind = "project" | "more" | "education" | "certificate" | "course" | "about" | "contact" | "workshop";
/** The contact form panel of the mailbox (opened by walking up, tapping the mailbox or E). */
export const CONTACT_INFO: InfoRef = { kind: "contact", id: "contact", spot: "mailbox" };
/** The About panel of Yanish's Ghar (opened by walking up, tapping the house or E). */
export const ABOUT_INFO: InfoRef = { kind: "about", id: "about", spot: "about" };
export type InfoRef = {
  kind: InfoKind;
  /** Item id in profile.ts ("more": the carousel stand). */
  id: string;
  /** Walk-up spot it belongs to (halls/layout.ts); walking away from it closes the panel. */
  spot: string;
};

/**
 * Cinema mode (the full-screen case study). `follow`: the Player's follow camera drives the view;
 * `cinema`: the camera is flying into / parked at a stand's screen; `returning`: flying back.
 * The Player only writes the camera in `follow`.
 */
export type CameraMode = "follow" | "cinema" | "returning";

const THEME_KEY = "world-theme";
const CHARACTER_KEY = "world-character";

/** The saved character, if it is one of the available ones. */
export function savedCharacter(available: CharacterId[]): CharacterId | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(CHARACTER_KEY) as CharacterId | null;
    return saved && available.includes(saved) ? saved : null;
  } catch {
    return null;
  }
}

/** ?theme= wins (for screenshots), then a saved choice, then local time (night 18:00–06:00). */
export function initialTheme(): Theme {
  if (typeof window === "undefined") return "day";
  const q = new URLSearchParams(window.location.search).get("theme");
  if (q === "day" || q === "night") return q;
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "day" || saved === "night") return saved;
  } catch {
    // storage blocked: fall through
  }
  const h = new Date().getHours();
  return h >= 18 || h < 6 ? "night" : "day";
}

function applyTheme(theme: Theme) {
  if (typeof document !== "undefined") document.documentElement.dataset.theme = theme === "night" ? "dark" : "light";
}

/**
 * Low-frequency world state. Per-frame data (position, heading, camera) lives in
 * refs inside Player.tsx; the store only gets throttled writes.
 */
type WorldState = {
  /** Avatar position, updated at ~10 Hz. */
  position: Vec2;
  /** Final click-to-walk target, or null when idle. */
  target: Vec2 | null;
  activeZone: string | null;
  /** True once the scene (fonts, models) has rendered. */
  loaded: boolean;
  /** True after the visitor first moved (hides the help hint). */
  moved: boolean;
  /** Detail panel of the active zone card is open. */
  panelOpen: boolean;
  setPosition: (p: Vec2) => void;
  setTarget: (t: Vec2 | null) => void;
  setActiveZone: (id: string | null) => void;
  setLoaded: (v: boolean) => void;
  setMoved: () => void;
  setPanelOpen: (v: boolean) => void;
  /** Target theme; the 3D scene blends toward it over ~2 s. Shared with overlays / Recruiter Mode. */
  theme: Theme;
  setTheme: (t: Theme, persist?: boolean) => void;
  toggleTheme: () => void;

  /** Chosen character (null until the visitor picks one or a saved choice is restored). */
  character: CharacterId | null;
  pickerOpen: boolean;
  /** Bumped on every pick; the avatar respawns at the plaza and dances. */
  spawnSeq: number;
  setCharacter: (id: CharacterId, persist?: boolean) => void;
  setPickerOpen: (v: boolean) => void;
  /** Bumped to play the Dance emote once. */
  danceSeq: number;
  dance: () => void;
  /** Bumped by any manual input (ground click, keys, joystick, chat): cancels tours and robot-led walks. */
  interruptSeq: number;
  interrupt: () => void;
  /** Bumped when an auto-walk reaches its end. */
  arrivedSeq: number;
  arrive: () => void;
  tourActive: boolean;
  setTourActive: (v: boolean) => void;
  /** Project highlighted in the Project Hall card (robot "openProject"). */
  focusProject: string | null;
  setFocusProject: (id: string | null) => void;
  /** Open info panel (project / degree / certificate / course), or null. */
  info: InfoRef | null;
  /** Spot whose panel the visitor closed (Escape / Close): it won't auto-reopen until they walk away. */
  infoDismissed: string | null;
  openInfo: (ref: InfoRef) => void;
  /** `dismiss`: the visitor closed it (vs. walking away). */
  closeInfo: (dismiss?: boolean) => void;
  clearInfoDismissed: () => void;
  toast: { text: string; id: number } | null;
  showToast: (text: string) => void;
  /** Project whose case study is open (cinema mode), or null. Movement and the robot bubble pause while set. */
  cinema: string | null;
  /** The fly-in has finished: the overlay is on screen and the 3D scene is paused. */
  cinemaReady: boolean;
  cameraMode: CameraMode;
  openCinema: (id: string) => void;
  closeCinema: () => void;
  setCinemaReady: (v: boolean) => void;
  setCameraMode: (m: CameraMode) => void;

  /** The Ghar hint is on screen (the top-centre "Click anywhere" hint steps aside). */
  gharHint: boolean;
  setGharHint: (v: boolean) => void;

  /** Prayer-wheel gallery. Wheels are numbered by their position in the row (wheels/wheelData.ts), one per skill group. */
  /** Row filter chip: other rows dim. */
  skillFilter: SkillFilter;
  setSkillFilter: (f: SkillFilter) => void;
  /** Wheel under the mouse (fine pointers only), or null. */
  wheelHover: number | null;
  /** Wheel the avatar stands next to, or null. */
  wheelNear: number | null;
  /** Chosen wheel (clicked, tapped or picked with E): its skill ring, threads and card are open. */
  wheelSelected: number | null;
  /** performance.now() when it was chosen (the threads fade 8 s later). */
  wheelSelectedAt: number;
  setWheelHover: (i: number | null) => void;
  setWheelNear: (i: number | null) => void;
  /** Choose a wheel (restarts its threads), or null to clear. */
  selectWheel: (i: number | null) => void;
};

/** The Skills filter chips: everything, or one group. */
export type SkillFilter = "all" | SkillCategory;

export const useWorld = create<WorldState>((set, get) => ({
  position: [0, 8.5],
  target: null,
  activeZone: null,
  loaded: false,
  moved: false,
  panelOpen: false,
  setPosition: (position) => set({ position }),
  setTarget: (target) => set({ target }),
  setActiveZone: (activeZone) => set({ activeZone, panelOpen: false }),
  setLoaded: (loaded) => set({ loaded }),
  setMoved: () => set((s) => (s.moved ? s : { moved: true })),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  theme: "day",
  setTheme: (theme, persist = true) => {
    applyTheme(theme);
    if (persist) {
      try {
        window.localStorage.setItem(THEME_KEY, theme);
      } catch {
        // ignore
      }
    }
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === "night" ? "day" : "night"),

  character: null,
  pickerOpen: false,
  spawnSeq: 0,
  setCharacter: (character, persist = true) => {
    if (persist) {
      try {
        window.localStorage.setItem(CHARACTER_KEY, character);
      } catch {
        // ignore
      }
    }
    set((s) => ({ character, pickerOpen: false, spawnSeq: s.spawnSeq + 1 }));
  },
  setPickerOpen: (pickerOpen) => set({ pickerOpen }),
  danceSeq: 0,
  dance: () => set((s) => ({ danceSeq: s.danceSeq + 1 })),
  interruptSeq: 0,
  interrupt: () => set((s) => ({ interruptSeq: s.interruptSeq + 1 })),
  arrivedSeq: 0,
  arrive: () => set((s) => ({ arrivedSeq: s.arrivedSeq + 1 })),
  tourActive: false,
  setTourActive: (tourActive) => set({ tourActive }),
  focusProject: null,
  setFocusProject: (focusProject) => set({ focusProject }),
  info: null,
  infoDismissed: null,
  openInfo: (info) =>
    set((s) => ({
      info,
      infoDismissed: s.infoDismissed === info.spot ? null : s.infoDismissed,
      focusProject: info.kind === "project" ? info.id : s.focusProject,
    })),
  closeInfo: (dismiss = false) =>
    set((s) => (s.info ? { info: null, infoDismissed: dismiss ? s.info.spot : s.infoDismissed } : s)),
  clearInfoDismissed: () => set((s) => (s.infoDismissed ? { infoDismissed: null } : s)),
  toast: null,
  showToast: (text) => set({ toast: { text, id: Date.now() } }),
  cinema: null,
  cinemaReady: false,
  cameraMode: "follow",
  openCinema: (cinema) => set((s) => (s.cinema === cinema ? s : { cinema, cinemaReady: false, cameraMode: "cinema", focusProject: cinema })),
  closeCinema: () => set((s) => (s.cinema ? { cinema: null, cinemaReady: false, cameraMode: "returning" } : s)),
  setCinemaReady: (cinemaReady) => set({ cinemaReady }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  gharHint: false,
  setGharHint: (gharHint) => set({ gharHint }),
  skillFilter: "all",
  setSkillFilter: (skillFilter) => set({ skillFilter }),
  wheelHover: null,
  wheelNear: null,
  wheelSelected: null,
  wheelSelectedAt: 0,
  setWheelHover: (wheelHover) => set((s) => (s.wheelHover === wheelHover ? s : { wheelHover })),
  setWheelNear: (wheelNear) => set((s) => (s.wheelNear === wheelNear ? s : { wheelNear })),
  selectWheel: (i) => set({ wheelSelected: i, wheelSelectedAt: performance.now() }),
}));

/** Visitor movement (keys, joystick, ground clicks) is off while a case study is open or the camera is flying. */
export const movementLocked = (s: Pick<WorldState, "cinema" | "cameraMode">) => !!s.cinema || s.cameraMode !== "follow";

/** True when a key event comes from a text field (world shortcuts must ignore it). */
export function isTypingTarget(e: Event): boolean {
  const el = (e.target as HTMLElement | null) ?? null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}
