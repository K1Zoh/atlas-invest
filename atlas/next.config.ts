import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Atlas is often opened from another device on the private LAN while the
  // development server still identifies itself as localhost. Without these
  // origins, Next.js blocks its client assets and leaves the UI on SSR skeletons.
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*"],
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
