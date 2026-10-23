import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = process.env.SITE_ORIGIN || "http://localhost:3000";
  return [{ url: origin, changeFrequency: "daily", priority: 1 }];
}
