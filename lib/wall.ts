import { uid } from "./id";
import type { WallPhoto } from "./types";

const MAX = 24;

function isPhotoUrl(src: string): boolean {
  return src.startsWith("/media/") || src.startsWith("https://");
}

export function sanitizeWall(input: unknown): WallPhoto[] {
  if (!Array.isArray(input)) return [];
  const out: WallPhoto[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Partial<WallPhoto>;
    const src = typeof rec.src === "string" ? rec.src.trim().slice(0, 400) : "";
    if (!isPhotoUrl(src)) continue;
    out.push({
      id: typeof rec.id === "string" && rec.id.trim() ? rec.id.trim().slice(0, 80) : uid("wall"),
      src,
      productId: typeof rec.productId === "string" ? rec.productId.trim().slice(0, 80) : "",
    });
    if (out.length >= MAX) break;
  }
  return out;
}
