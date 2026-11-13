import { resolveHex } from "./colors";
import { distributeStock, parseSizeList } from "./sizes";
import type { Product, Variant } from "./types";

export function variantLabel(color: string, size?: string): string {
  const cleanSize = (size ?? "").trim();
  return cleanSize ? `${color} / ${cleanSize}` : color;
}

export type ColorGroup = { color: string; hex: string; sizes: Variant[] };

export function groupVariants(variants: Variant[]): ColorGroup[] {
  const map = new Map<string, ColorGroup>();
  for (const variant of variants) {
    const key = variant.color.trim().toLowerCase();
    const current = map.get(key);
    if (current) current.sizes.push(variant);
    else map.set(key, { color: variant.color, hex: variant.hex, sizes: [variant] });
  }
  return [...map.values()];
}

export function variantSummary(product: Pick<Product, "variants">): string {
  return groupVariants(product.variants)
    .map((group) => {
      const sizes = group.sizes.map((size) => size.size).filter(Boolean);
      return sizes.length ? `${group.color}（${sizes.join("、")}）` : group.color;
    })
    .join("、");
}

function sizeDetail(product: Product): { label: string; value: string } | undefined {
  return product.details.find((detail) => detail.label.trim() === "尺寸" || detail.label.trim() === "尺碼");
}

/**
 * Old products stored sizes inside a 尺寸 note ("請留言"). Expand those into
 * color × size rows. Stock is divided so the total does not increase.
 * Variant ids stay stable across reads: the original id is kept on M (or the first size).
 */
export function migrateProduct(product: Product): Product {
  const variants = (product.variants ?? []).map((variant) => ({
    ...variant,
    size: typeof variant.size === "string" ? variant.size.trim().toUpperCase() : "",
    hex: resolveHex(variant.color ?? "", variant.hex),
    stock: Math.max(0, Math.floor(Number(variant.stock) || 0)),
    color: (variant.color ?? "").trim(),
  }));
  const categories = Array.isArray(product.categories) ? product.categories : [];
  if (variants.some((variant) => variant.size)) {
    return { ...product, variants, categories };
  }
  const detail = sizeDetail({ ...product, variants });
  const sizes = detail ? parseSizeList(detail.value) : [];
  if (sizes.length < 2) return { ...product, variants, categories };

  const next: Variant[] = [];
  for (const variant of variants) {
    const counts = distributeStock(variant.stock, sizes);
    const preferred = sizes.includes("M") ? "M" : sizes[0];
    sizes.forEach((size, index) => {
      next.push({
        ...variant,
        id: size === preferred ? variant.id : `${variant.id}_${size}`,
        size,
        stock: counts[index] ?? 0,
      });
    });
  }
  return {
    ...product,
    categories,
    variants: next,
    sizeStockEstimated: true,
    details: product.details.map((item) =>
      item.label === detail?.label && item.value === detail.value ? { ...item, value: sizes.join("、") } : item
    ),
  };
}
