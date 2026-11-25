import type { NextConfig } from "next";
import { securityHeaderPairs } from "./lib/http";
import { supabaseStorageHost } from "./lib/supabase-host";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: supabaseStorageHost(), pathname: "/storage/v1/object/public/**" },
    ],
  },
  async headers() {
    const dev = process.env.NODE_ENV !== "production";
    return [
      {
        source: "/:path*",
        headers: securityHeaderPairs(dev).map(([key, value]) => ({ key, value })),
      },
    ];
  },
};

export default nextConfig;
