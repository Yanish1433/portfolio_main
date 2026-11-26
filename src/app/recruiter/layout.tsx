import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Devanagari, Space_Grotesk } from "next/font/google";
import { profile } from "@/content/profile";
import { ScrollProvider } from "@/components/recruiter/ScrollProvider";
import { THEME_SCRIPT } from "@/components/recruiter/themeScript";
import styles from "@/components/recruiter/recruiter.module.css";
import { DHAKA_URL } from "@/components/landing/art";

const display = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});
const body = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
});
const nepali = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["500", "600"],
  display: "swap",
  variable: "--font-ne",
});

export const metadata: Metadata = {
  title: `${profile.name} — ${profile.title} (Recruiter view)`,
  description: profile.tagline,
};

// Fallback for the first paint; ThemeToggle updates the tag to the chosen theme.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf6ef" },
    { media: "(prefers-color-scheme: dark)", color: "#070b16" },
  ],
  colorScheme: "light dark",
};

export default function RecruiterLayout({ children }: { children: React.ReactNode }) {
  return (
    // The script below sets data-theme on this wrapper before first paint, so React must not complain about it.
    <div
      data-recruiter-root
      suppressHydrationWarning
      style={{ "--dhaka": DHAKA_URL } as React.CSSProperties}
      className={`${display.variable} ${body.variable} ${nepali.variable} ${styles.page}`}
    >
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <ScrollProvider>{children}</ScrollProvider>
    </div>
  );
}
