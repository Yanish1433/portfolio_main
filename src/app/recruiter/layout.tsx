import type { Metadata, Viewport } from "next";
import { profile } from "@/content/profile";
import { TIME_SCRIPT } from "@/lib/time/timeScript";
import styles from "@/components/recruiter/recruiter.module.css";

export const metadata: Metadata = {
  title: `${profile.name} — ${profile.title} (Recruiter view)`,
  description: profile.tagline,
};

export const viewport: Viewport = {
  themeColor: "#1b120c",
  colorScheme: "dark",
};

export default function RecruiterLayout({ children }: { children: React.ReactNode }) {
  return (
    // The inline script sets data-theme (day|night), --glow and data-cover on this wrapper before first paint, so React must not complain.
    <div data-time-root data-recruiter-root suppressHydrationWarning className={styles.page}>
      <script dangerouslySetInnerHTML={{ __html: TIME_SCRIPT }} />
      <link rel="preload" href="/fonts/Kalam-Regular-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      {children}
    </div>
  );
}
