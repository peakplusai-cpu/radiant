import { describe, expect, it } from "vitest";
import { effectiveCategories } from "@/lib/categories";
import { inferHex, resolveHex } from "@/lib/colors";
import { distributeStock, parseSizeList } from "@/lib/sizes";
import { migrateProduct } from "@/lib/variants";
import type { Product } from "@/lib/types";

const base = (patch: Partial<Product>): Product => ({
  id: "prd_test",
  name: "測試",
  subtitle: "",
  category: "正韓服飾",
  categories: [],
  description: "",
  details: [],
  price: 1000,
  comparePrice: 0,
  variants: [{ id: "var_1", color: "藍", size: "", hex: "#d9d9d9", sku: "", stock: 6, price: null }],
  photos: [],
  status: "listed",
  featured: false,
  sold: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...patch,
});

describe("sizes", () => {
  it("parses the shop's free-text size notes", () => {
    expect(parseSizeList("Ｍ,L,XL")).toEqual(["M", "L", "XL"]);
    expect(parseSizeList("Ｓ.M.L.XL 尺寸結帳留言")).toEqual(["S", "M", "L", "XL"]);
    expect(parseSizeList("S~L")).toEqual(["S", "M", "L"]);
  });

  it("splits stock without changing the total", () => {
    expect(distributeStock(5, ["M", "L", "XL"])).toEqual([2, 2, 1]);
    expect(distributeStock(10, ["S", "M", "L", "XL"]).reduce((sum, n) => sum + n, 0)).toBe(10);
  });
});

describe("migration", () => {
  it("turns a size note into color x size rows and keeps the original id on M", () => {
    const product = migrateProduct(
      base({
        name: "正韓上衣",
        details: [{ label: "尺寸", value: "Ｓ.M.L.XL 尺寸結帳留言" }],
        variants: [{ id: "var_linen", color: "亞麻", size: "", hex: "#ffffff", sku: "", stock: 10, price: null }],
      })
    );
    expect(product.variants.map((variant) => variant.size)).toEqual(["S", "M", "L", "XL"]);
    expect(product.variants.reduce((sum, variant) => sum + variant.stock, 0)).toBe(10);
    expect(product.variants.find((variant) => variant.size === "M")?.id).toBe("var_linen");
    expect(product.details[0].value).toBe("S、M、L、XL");
    expect(product.sizeStockEstimated).toBe(true);
    expect(product.variants[0].hex).not.toBe("#ffffff");
    expect(migrateProduct(product).variants.map((variant) => variant.id)).toEqual(product.variants.map((variant) => variant.id));
  });
});

describe("categories and swatches", () => {
  it("lists apparel tops under both shelves and keeps a set on 正韓服飾", () => {
    const top = effectiveCategories(base({ name: "珍珠上衣", category: "正韓服飾" }));
    const soldOut = effectiveCategories(base({ name: "銀蔥上衣", category: "上衣" }));
    const set = effectiveCategories(base({ name: "針織套裝", category: "正韓服飾" }));
    expect(top).toEqual(expect.arrayContaining(["正韓服飾", "上衣"]));
    expect(soldOut).toEqual(expect.arrayContaining(["上衣", "正韓服飾"]));
    expect(set).toEqual(["正韓服飾"]);
  });

  it("replaces the gray placeholder with a named swatch", () => {
    expect(resolveHex("咖啡", "#d9d9d9")).toBe(inferHex("咖啡"));
    expect(resolveHex("藍", "#d9d9d9")).not.toBe("#d9d9d9");
    expect(resolveHex("白", "#ffffff")).toBe("#f7f7f5");
    expect(resolveHex("特殊色", "#112233")).toBe("#112233");
  });
});
