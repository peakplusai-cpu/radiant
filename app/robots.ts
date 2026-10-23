import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const origin = process.env.SITE_ORIGIN || "";
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/cart", "/checkout", "/orders"] }],
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
