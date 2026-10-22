import type { Product, Variant } from "./types";

export function variantPrice(product: Product, variant: Variant): number {
  return variant.price ?? product.price;
}

export function totalStock(product: Product): number {
  return product.variants.reduce((sum, v) => sum + Math.max(0, v.stock), 0);
}

export function isSoldOut(product: Product): boolean {
  return totalStock(product) <= 0;
}

export function priceRange(product: Product): { min: number; max: number } {
  const prices = product.variants.length
    ? product.variants.map((v) => variantPrice(product, v))
    : [product.price];
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
