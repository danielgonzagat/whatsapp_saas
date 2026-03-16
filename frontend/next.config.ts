import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    // Pin root to avoid lockfile ambiguity across monorepo
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
