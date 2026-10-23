import type { Settings } from "./types";

export function officialLineHref(s: Pick<Settings, "lineOaUrl" | "lineOaBasicId">): string {
  const url = s.lineOaUrl.trim();
  if (/^https?:\/\//i.test(url)) return url;
  const id = s.lineOaBasicId.trim();
  if (id) return `https://line.me/R/ti/p/${encodeURIComponent(id.startsWith("@") ? id : `@${id}`)}`;
  return "";
}
