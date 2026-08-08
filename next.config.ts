import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Neon serverless driver must not be bundled — use native Node Postgres APIs
  serverExternalPackages: ["@neondatabase/serverless"],
};

export default nextConfig;
