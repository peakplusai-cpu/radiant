const GUEST_KEY = "radiant.promo.guest";
const CODE_KEY = "radiant.promo.code";
const EVENT = "radiant-promo";

let claims = new Set<string>();
const listeners = new Set<() => void>();

export function guestToken(): string {
  if (typeof window === "undefined") return "";
  const existing = localStorage.getItem(GUEST_KEY) ?? "";
  if (/^[A-Za-z0-9_-]{16,80}$/.test(existing)) return existing;
  const next = crypto.randomUUID().replace(/-/g, "");
  localStorage.setItem(GUEST_KEY, next);
  return next;
}

export function readGuestToken(): string {
  if (typeof window === "undefined") return "";
  const existing = localStorage.getItem(GUEST_KEY) ?? "";
  return /^[A-Za-z0-9_-]{16,80}$/.test(existing) ? existing : "";
}

export function readCoupon(): string {
  if (typeof window === "undefined") return "";
  return (sessionStorage.getItem(CODE_KEY) ?? "").trim().slice(0, 20);
}

export function writeCoupon(code: string): void {
  sessionStorage.setItem(CODE_KEY, code.trim().slice(0, 20));
  window.dispatchEvent(new Event(EVENT));
}

export function onPromoChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

function emitClaims(): void {
  listeners.forEach((cb) => cb());
}

export function subscribeClaims(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function hasClaim(promoId: string): boolean {
  return claims.has(promoId);
}

export async function refreshClaims(): Promise<void> {
  const token = guestToken();
  const res = await fetch(`/api/promos/claims?token=${encodeURIComponent(token)}`, { cache: "no-store" });
  if (!res.ok) return;
  const json = (await res.json()) as { ids?: string[] };
  claims = new Set(Array.isArray(json.ids) ? json.ids : []);
  emitClaims();
}

export async function claimPromo(promoId: string): Promise<string> {
  const res = await fetch("/api/promos/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ promoId, guestToken: guestToken() }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return json.error || "無法領取";
  await refreshClaims();
  window.dispatchEvent(new Event(EVENT));
  return "";
}
