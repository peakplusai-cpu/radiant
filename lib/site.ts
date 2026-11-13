/** Public origin used for metadata, sitemap, and production redirects. */
const FALLBACK_ORIGIN = "https://radiant-indol.vercel.app";

export function configuredSiteUrl(): string | null {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_ORIGIN || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function publicSiteUrl(): string {
  return configuredSiteUrl() ?? FALLBACK_ORIGIN;
}
