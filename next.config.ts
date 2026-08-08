import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Required for Neon serverless driver in edge/server components
    serverComponentsExternalPackages: ["@neondatabase/serverless"],
  },
};

export default nextConfig;
