import type { NextConfig } from "next";

// Static export: the whole site is plain files in out/, served by Cloudflare Pages.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
