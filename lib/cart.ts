export type CartEntry = { p: string; v: string; q: number };

export function sanitizeCart(items: CartEntry[]): CartEntry[] {
  return items
    .filter((item) => item && typeof item.p === "string" && typeof item.v === "string")
    .map((item) => ({ p: item.p, v: item.v, q: Math.floor(Number(item.q)) }))
    .filter((item) => item.p && item.v && item.q > 0);
}

export function setQty(items: CartEntry[], entry: CartEntry, max: number): CartEntry[] {
  const qty = Math.max(1, Math.min(max, Math.floor(entry.q)));
  const next = sanitizeCart(items).map((item) => ({ ...item }));
  const found = next.find((item) => item.p === entry.p && item.v === entry.v);
  if (found) found.q = qty;
  else next.push({ p: entry.p, v: entry.v, q: qty });
  return next;
}

/** Apply a delta to the current cart, not to a stale rendered quantity. */
export function bump(items: CartEntry[], p: string, v: string, delta: number, max: number): CartEntry[] {
  const current = sanitizeCart(items).find((item) => item.p === p && item.v === v);
  const q = (current?.q ?? 0) + delta;
  return setQty(items, { p, v, q }, max);
}

export function addEntry(items: CartEntry[], entry: CartEntry, max: number): CartEntry[] {
  const current = sanitizeCart(items).find((item) => item.p === entry.p && item.v === entry.v);
  const q = Math.min(max, (current?.q ?? 0) + Math.max(1, Math.floor(entry.q)));
  return setQty(items, { p: entry.p, v: entry.v, q }, max);
}

export function removeEntry(items: CartEntry[], p: string, v: string): CartEntry[] {
  return sanitizeCart(items).filter((item) => !(item.p === p && item.v === v));
}

export function countCart(items: CartEntry[]): number {
  return sanitizeCart(items).reduce((sum, item) => sum + item.q, 0);
}
