"use client";

import type { CharacterId } from "./characters";
import dynamic from "next/dynamic";
import Overlay from "./Overlay";
import LoadingOverlay from "./loading/LoadingOverlay";

const FONT_FACES = `
@font-face { font-family: "Mukta"; font-weight: 600; font-display: swap;
  src: url(/fonts/Mukta-SemiBold-devanagari.woff2) format("woff2");
  unicode-range: U+0900-097F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9, U+25CC, U+A830-A839, U+A8E0-A8FF; }
@font-face { font-family: "Mukta"; font-weight: 400 600; font-display: swap;
  src: url(/fonts/Mukta-SemiBold-latin.woff2) format("woff2");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@keyframes picker-in { from { opacity: 0; transform: translateY(14px) scale(0.98); } to { opacity: 1; transform: none; } }
.picker-in { animation: picker-in 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
/* Info panel: bottom sheet in the dock on phones / touch; a side panel on desktop. */
.info-panel { width: 100%; max-width: min(28rem, calc(100vw - 32px)); display: flex; flex-direction: column; max-height: 44vh; }
.info-panel-scroll { min-height: 0; flex: 1 1 auto; }
@media (min-width: 768px) and (pointer: fine) {
  .info-panel { position: fixed; right: 16px; top: 72px; width: 24rem; max-height: calc(100vh - 72px - 112px); }
}
@keyframes panel-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.panel-in { animation: panel-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
/* Cinema mode: the case study grows out of the screen the camera just flew into. */
@keyframes cinema-in { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: none; } }
.cinema-in { animation: cinema-in 300ms cubic-bezier(0.2, 0.8, 0.2, 1) both; transform-origin: 50% 40%; }
@media (prefers-reduced-motion: reduce) { .picker-in, .panel-in, .cinema-in { animation: none; } }
`;

// three.js needs the browser: load the scene client-side only.
const World = dynamic(() => import("./World"), { ssr: false });

/**
 * `thumbs`: project ids that have a public/projects/<id>.webp; `posters`: ids with a
 * public/showcase/<id>/poster.webp (both checked on the server, like the characters).
 */
export default function WorldClient({ characters, thumbs = [], posters = [], aboutPhoto = null }: { characters: CharacterId[]; thumbs?: string[]; posters?: string[]; aboutPhoto?: string | null }) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#f3d9b8]">
      {/* Mukta (OFL, public/fonts/Mukta-OFL.txt): Latin + Devanagari for labels and overlays. */}
      <style>{FONT_FACES}</style>
      <World characters={characters} thumbs={thumbs} posters={posters} aboutPhoto={aboutPhoto} />
      <Overlay characters={characters} thumbs={thumbs} posters={posters} aboutPhoto={aboutPhoto} />
      <LoadingOverlay />
    </div>
  );
}
