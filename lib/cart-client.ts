export type CartEntry = { p: string; v: string; q: number };

const KEY = "radiant.cart";
const EVENT = "radiant:cart";

export function readCart(): CartEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as CartEntry[];
    return Array.isArray(parsed) ? parsed.filter((e) => e && e.p && e.v && e.q > 0) : [];
  } catch {
    return [];
  }
}

export function writeCart(items: CartEntry[]): void {
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

export function addToCart(entry: CartEntry, max: number): void {
  const items = readCart();
  const found = items.find((i) => i.p === entry.p && i.v === entry.v);
  if (found) found.q = Math.min(max, found.q + entry.q);
  else items.push({ ...entry, q: Math.min(max, entry.q) });
  writeCart(items);
}

export function clearCart(): void {
  writeCart([]);
}

export function onCartChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}
