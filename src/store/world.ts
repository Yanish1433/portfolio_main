import { create } from "zustand";
import type { CharacterId } from "@/components/world/characters";
import type { SkillCategory } from "@/content/profile";
import { deriveTheme, parseTime, themeAt, wrapMinutes } from "@/components/world/nepal/timeLook";
import { themeState } from "@/components/world/nepal/themeState";
import { reduceCamMode } from "@/components/world/cameraRig";

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
 * Cinema mode (the full-screen project video). `follow`: the Player's follow camera drives the view;
 * `cinema`: the camera is flying into / parked at a stand's screen; `returning`: flying back.
 * The Player only writes the camera in `follow`.
 */
export type CameraMode = "follow" | "cinema" | "returning" | "eagle";

/** Where the golden footprints lead: a section's ring centre and radius. */
export type GuideTarget = { id: string; label: string; to: Vec2; radius: number; seq: number };

const THEME_KEY = "world-theme";
const CHARACTER_KEY = "world-character";

/** Older builds stored a picked character ("clay" / "astro" / "lakhey"). Lakhey is the only character now: drop the stale choice. */
export function clearSavedCharacter() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CHARACTER_KEY);
  } catch {
    // storage blocked: nothing to clear
  }
}

const TIME_KEY = "world-time";
const DAY_AT = 12 * 60;
const NIGHT_AT = 22 * 60;

const localMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * ?time=HH:MM, then ?theme=day|night (12:00 / 22:00), then the saved choice ("world-time": minutes or "now";
 * the old "world-theme" is migrated), then the visitor's local time.
 * KEEP IN SYNC with TIME_SCRIPT (lib/time/timeScript.ts; app/page.tsx has its own copy until 18b).
 */
export function initialMinutes(): number {
  if (typeof window === "undefined") return DAY_AT;
  const params = new URLSearchParams(window.location.search);
  const qt = parseTime(params.get("time"));
  if (qt !== null) return qt;
  const q = params.get("theme");
  if (q === "day") return DAY_AT;
  if (q === "night") return NIGHT_AT;
  try {
    const saved = window.localStorage.getItem(TIME_KEY);
    if (saved && saved !== "now") {
      const n = Number(saved);
      if (Number.isFinite(n)) return wrapMinutes(Math.round(n));
    }
    if (!saved) {
      const old = window.localStorage.getItem(THEME_KEY);
      if (old === "day") return DAY_AT;
      if (old === "night") return NIGHT_AT;
    }
  } catch {
    // storage blocked: fall through
  }
  return localMinutes();
}

export function initialTheme(): Theme {
  return themeAt(initialMinutes());
}

/** Remember the visitor's choice; `null` = follow the local clock ("Now"). */
function saveMinutes(m: number | null) {
  try {
    window.localStorage.setItem(TIME_KEY, m === null ? "now" : String(Math.round(m)));
  } catch {
    // ignore
  }
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
  /** Time of day, minutes since midnight (the source of `theme`; the 3D look reads themeState.minutes). */
  minutes: number;
  /** `persist`: true = remember a fixed time, "now" = remember "follow the local clock". */
  setMinutes: (m: number, persist?: boolean | "now") => void;
  setTheme: (t: Theme, persist?: boolean) => void;
  toggleTheme: () => void;

  /** Chosen character (null until the visitor picks one or a saved choice is restored). */
  character: CharacterId | null;
  pickerOpen: boolean;
  /** Bumped on every pick; the avatar respawns at the plaza and dances. */
  spawnSeq: number;
  setCharacter: (id: CharacterId) => void;
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
  /** Golden footprints: the section the path leads to (see components/world/guide), or null. `seq` restarts the path. */
  guide: GuideTarget | null;
  setGuide: (g: Omit<GuideTarget, "seq"> | null) => void;
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
  /** Project whose video is open (cinema mode), or null. Movement and the robot bubble pause while set. */
  cinema: string | null;
  /** Fly the camera into the stand's screen on open (false: just show the video, e.g. from a quick-open button far away). */
  cinemaFly: boolean;
  /** The fly-in has finished: the overlay is on screen and the 3D scene is paused. */
  cinemaReady: boolean;
  cameraMode: CameraMode;
  /** The follow camera is not on the default wide view (auto-framed or hand-set): shows "Reset view". */
  viewCustom: boolean;
  setViewCustom: (v: boolean) => void;
  openCinema: (id: string, fly?: boolean) => void;
  closeCinema: () => void;
  setCinemaReady: (v: boolean) => void;
  setCameraMode: (m: CameraMode) => void;
  /** Eagle (sky) view on / off. Only from follow or eagle; cinema and its return win. */
  toggleEagle: () => void;
  /** 360 view = eagle view + slow auto-spin (step21a). Only meaningful while cameraMode is "eagle". */
  eagleSpin: boolean;
  /** 360 view on / off (O key, button). Esc / moving use exitSpin. */
  toggleSpin: () => void;
  exitSpin: () => void;

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

  /** The big mini-map (M key / expand corner) is open. */
  minimapBig: boolean;
  setMinimapBig: (v: boolean) => void;
};

/** The Skills filter chips: everything, or one group. */
export type SkillFilter = "all" | SkillCategory;

export const useWorld = create<WorldState>((set, get) => ({
  position: [0, 11.9],
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
  minutes: DAY_AT,
  setMinutes: (m, persist = false) => {
    const minutes = wrapMinutes(Math.round(m));
    themeState.minutes = minutes;
    const cur = get().theme;
    const theme = deriveTheme(minutes, cur);
    if (persist) saveMinutes(persist === "now" ? null : minutes);
    if (theme !== cur) applyTheme(theme);
    set(theme !== cur ? { minutes, theme } : { minutes });
  },
  setTheme: (theme, persist = true) => get().setMinutes(theme === "night" ? NIGHT_AT : DAY_AT, persist),
  toggleTheme: () => get().setTheme(get().theme === "night" ? "day" : "night"),

  character: null,
  pickerOpen: false,
  spawnSeq: 0,
  // Lakhey is set once on load (CharacterInit); the spawnSeq bump keeps the first-visit spawn dance.
  setCharacter: (character) => {
    set((s) => ({ character, pickerOpen: false, spawnSeq: s.spawnSeq + 1 }));
  },
  danceSeq: 0,
  dance: () => set((s) => ({ danceSeq: s.danceSeq + 1 })),
  interruptSeq: 0,
  interrupt: () => set((s) => ({ interruptSeq: s.interruptSeq + 1 })),
  arrivedSeq: 0,
  arrive: () => set((s) => ({ arrivedSeq: s.arrivedSeq + 1 })),
  tourActive: false,
  setTourActive: (tourActive) => set({ tourActive }),
  guide: null,
  setGuide: (g) => set((s) => ({ guide: g ? { ...g, seq: (s.guide?.seq ?? 0) + 1 } : null })),
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
  cinemaFly: true,
  cameraMode: "follow",
  viewCustom: false,
  setViewCustom: (viewCustom) => set((s) => (s.viewCustom === viewCustom ? s : { viewCustom })),
  openCinema: (cinema, fly = true) => set((s) => (s.cinema === cinema ? s : { cinema, cinemaFly: fly, cinemaReady: false, cameraMode: "cinema", eagleSpin: false, focusProject: cinema })),
  closeCinema: () => set((s) => (s.cinema ? { cinema: null, cinemaReady: false, cameraMode: "returning" } : s)),
  setCinemaReady: (cinemaReady) => set({ cinemaReady }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  toggleEagle: () =>
    set((s) => {
      const n = reduceCamMode({ mode: s.cameraMode, spin: s.eagleSpin, cinema: !!s.cinema }, "eagle");
      return n.mode === s.cameraMode && n.spin === s.eagleSpin ? s : { cameraMode: n.mode, eagleSpin: n.spin };
    }),
  eagleSpin: false,
  toggleSpin: () =>
    set((s) => {
      const n = reduceCamMode({ mode: s.cameraMode, spin: s.eagleSpin, cinema: !!s.cinema }, "spin");
      return n.mode === s.cameraMode && n.spin === s.eagleSpin ? s : { cameraMode: n.mode, eagleSpin: n.spin };
    }),
  exitSpin: () =>
    set((s) => {
      const n = reduceCamMode({ mode: s.cameraMode, spin: s.eagleSpin, cinema: !!s.cinema }, "exit-spin");
      return n.mode === s.cameraMode && n.spin === s.eagleSpin ? s : { cameraMode: n.mode, eagleSpin: n.spin };
    }),
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
  minimapBig: false,
  setMinimapBig: (minimapBig) => set((s) => (s.minimapBig === minimapBig ? s : { minimapBig })),
}));

/** Visitor movement (keys, joystick, ground clicks) is off while a project video is open or the camera is flying. */
export const movementLocked = (s: Pick<WorldState, "cinema" | "cameraMode"> & Partial<Pick<WorldState, "activeZone" | "panelOpen">>) =>
  !!s.cinema || s.cameraMode !== "follow" || (s.activeZone === "pottery" && !!s.panelOpen); // step22: walking is paused while the pottery game is open

/** True when a key event comes from a text field (world shortcuts must ignore it). */
export function isTypingTarget(e: Event): boolean {
  const el = (e.target as HTMLElement | null) ?? null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

/** Apply the starting time of day (no hysteresis, nothing saved). */
export function initTime() {
  const minutes = initialMinutes();
  const theme = themeAt(minutes);
  themeState.minutes = minutes;
  applyTheme(theme);
  useWorld.setState({ minutes, theme });
}
