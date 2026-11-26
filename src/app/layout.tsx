import type { Metadata } from "next";
import "./globals.css";

// Absolute base for social-card image URLs. Set NEXT_PUBLIC_SITE_URL to the real address when it is known.
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Yanish Gurung — Full-Stack Developer",
  description: "Portfolio of Yanish Gurung, Full-Stack Developer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
