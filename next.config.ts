import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // A second build folder lets a new build be prepared while the running server keeps serving the old one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Pin the project root (a stray lockfile in a parent folder otherwise confuses Turbopack).
  turbopack: { root: process.cwd() },
};

export default nextConfig;
