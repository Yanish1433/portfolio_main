import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
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
