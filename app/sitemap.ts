import type { MetadataRoute } from "next";
import { getCatalogStore } from "@/lib/store";
import { publicSiteUrl } from "@/lib/site";
import { dynamicWithoutDatabase } from "@/lib/render";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await dynamicWithoutDatabase();
  const origin = publicSiteUrl();
  const { products } = await getCatalogStore();
  const staticPages: MetadataRoute.Sitemap = ["", "/privacy", "/terms", "/returns"].map((path) => ({
    url: `${origin}${path || "/"}`,
    changeFrequency: path ? "yearly" : "daily",
    priority: path ? 0.3 : 1,
  }));
  const productPages: MetadataRoute.Sitemap = products
    .filter((product) => product.status === "listed")
    .map((product) => ({
      url: `${origin}/p/${product.id}`,
      lastModified: product.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  return [...staticPages, ...productPages];
}
