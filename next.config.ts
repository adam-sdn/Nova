import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Pin the project root (a stray lockfile in a parent folder otherwise confuses Turbopack).
  turbopack: { root: process.cwd() },
};

export default nextConfig;
