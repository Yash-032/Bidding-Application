import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@google/generative-ai",
    ],
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
