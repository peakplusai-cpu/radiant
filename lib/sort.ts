import type { Product } from "./types";
import { isSoldOut, priceRange } from "./products";

export type SortKey = "pop" | "new" | "sales" | "price_asc" | "price_desc";

export const SORT_KEYS: SortKey[] = ["pop", "new", "sales", "price_asc", "price_desc"];

export function parseSort(value: string | undefined): SortKey {
  return SORT_KEYS.includes(value as SortKey) ? (value as SortKey) : "pop";
}

function ageDays(iso: string): number {
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** Blends pinned status, sales volume and freshness, like a marketplace "recommended" ranking. */
function popularity(p: Product): number {
  const pinned = p.featured ? 1000 : 0;
  const sales = Math.log1p(p.sold) * 30;
  const fresh = 40 * Math.exp(-ageDays(p.createdAt) / 30);
  return pinned + sales + fresh;
}

export function sortProducts(products: Product[], key: SortKey): Product[] {
  const list = [...products];
  const byKey = (a: Product, b: Product): number => {
    switch (key) {
      case "new":
        return b.createdAt.localeCompare(a.createdAt);
      case "sales":
        return b.sold - a.sold || b.createdAt.localeCompare(a.createdAt);
      case "price_asc":
        return priceRange(a).min - priceRange(b).min;
      case "price_desc":
        return priceRange(b).min - priceRange(a).min;
      default:
        return popularity(b) - popularity(a);
    }
  };
  return list.sort((a, b) => {
    const soldOutDiff = Number(isSoldOut(a)) - Number(isSoldOut(b));
    return soldOutDiff || byKey(a, b);
  });
}
