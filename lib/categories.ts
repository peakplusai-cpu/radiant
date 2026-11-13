import type { Product } from "./types";

/** Shop apparel shelf. Garment-type tags are also listed here. */
export const APPAREL_CATEGORY = "正韓服飾";

const TYPE_RULES: { category: string; pattern: RegExp }[] = [
  { category: "上衣", pattern: /上衣|襯衫|T恤|外套/ },
];

/**
 * A product can show under more than one shelf.
 * Tops filed only as 正韓服飾 still appear under 上衣 when the name says so,
 * and a 上衣 also stays on the 正韓服飾 shelf so a sold-out tag is not the only result.
 */
export function effectiveCategories(product: Pick<Product, "name" | "subtitle" | "category" | "categories">): string[] {
  const set = new Set<string>();
  const primary = (product.category ?? "").trim();
  if (primary) set.add(primary);
  for (const extra of product.categories ?? []) {
    const value = extra.trim();
    if (value) set.add(value);
  }
  const blob = `${product.name} ${product.subtitle} ${primary}`;
  for (const rule of TYPE_RULES) {
    if (rule.pattern.test(blob)) set.add(rule.category);
  }
  if (set.has("上衣")) set.add(APPAREL_CATEGORY);
  return [...set];
}

export function splitCategoryInput(raw: string): { category: string; categories: string[] } {
  const parts = raw
    .split(/[,，、]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 8);
  return { category: parts[0] ?? "", categories: parts.slice(1) };
}
