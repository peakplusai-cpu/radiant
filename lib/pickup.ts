import { uid } from "./id";
import type { PickupPoint, Settings } from "./types";

const MAX = 20;

export function sanitizePickupPoints(input: unknown): PickupPoint[] {
  if (!Array.isArray(input)) return [];
  const out: PickupPoint[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Partial<PickupPoint>;
    const name = typeof rec.name === "string" ? rec.name.trim().slice(0, 80) : "";
    if (!name) continue;
    out.push({
      id: typeof rec.id === "string" && rec.id.trim() ? rec.id.trim().slice(0, 80) : uid("pkp"),
      name,
      address: typeof rec.address === "string" ? rec.address.trim().slice(0, 200) : "",
      hours: typeof rec.hours === "string" ? rec.hours.trim().slice(0, 80) : "",
      note: typeof rec.note === "string" ? rec.note.trim().slice(0, 160) : "",
      enabled: rec.enabled !== false,
    });
    if (out.length >= MAX) break;
  }
  return out;
}

export function enabledPickupPoints(settings: Pick<Settings, "pickupPoints">): PickupPoint[] {
  return (settings.pickupPoints ?? []).filter((p) => p.enabled && p.name);
}

export function formatPickupAddress(point: PickupPoint): string {
  return point.address ? `${point.name}（${point.address}）` : point.name;
}
