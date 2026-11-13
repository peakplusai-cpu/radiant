"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/types";
import { effectiveCategories } from "@/lib/categories";
import { isSoldOut } from "@/lib/products";
import { parseSort, sortProducts, type SortKey } from "@/lib/sort";
import { ProductCard } from "./ProductCard";

const TABS: { key: SortKey | "price"; label: string }[] = [
  { key: "pop", label: "綜合排序" },
  { key: "new", label: "最新" },
  { key: "sales", label: "熱銷" },
  { key: "price", label: "價格" },
];

function href(params: { sort?: string; q?: string; cat?: string }): string {
  const sp = new URLSearchParams();
  if (params.sort && params.sort !== "pop") sp.set("sort", params.sort);
  if (params.q) sp.set("q", params.q);
  if (params.cat) sp.set("cat", params.cat);
  const qs = sp.toString();
  return qs ? `/?${qs}` : "/";
}

export function Catalog({ products, flush }: { products: Product[]; flush: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const sort = parseSort(params.get("sort") ?? undefined);
  const q = (params.get("q") ?? "").trim();
  const cat = (params.get("cat") ?? "").trim();
  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);

  const categories = useMemo(() => {
    return [...new Set(products.flatMap((product) => effectiveCategories(product)))].sort((a, b) => {
      const stock = (name: string) => products.filter((product) => effectiveCategories(product).includes(name) && !isSoldOut(product)).length;
      return stock(b) - stock(a) || a.localeCompare(b, "zh-Hant");
    });
  }, [products]);

  const needle = q.toLowerCase();
  const filtered = products.filter(
    (product) =>
      (!cat || effectiveCategories(product).includes(cat)) &&
      (!needle || `${product.name} ${product.subtitle} ${product.category} ${product.variants.map((variant) => `${variant.color} ${variant.size}`).join(" ")}`.toLowerCase().includes(needle))
  );
  const visible = sortProducts(filtered, sort);
  const priceNext = sort === "price_asc" ? "price_desc" : "price_asc";

  return (
    <main className="page">
      <div className={`toolbar${flush ? " flush" : ""}`}>
        <nav className="sortbar" aria-label="排序">
          {TABS.map((tab) => {
            if (tab.key === "price") {
              const on = sort === "price_asc" || sort === "price_desc";
              return (
                <Link key="price" href={href({ sort: priceNext, q, cat })} className={on ? "on" : ""}>
                  價格 {sort === "price_asc" ? "↑" : sort === "price_desc" ? "↓" : "↕"}
                </Link>
              );
            }
            return (
              <Link key={tab.key} href={href({ sort: tab.key, q, cat })} className={sort === tab.key ? "on" : ""}>
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <form
          className="finder"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            router.push(href({ sort, q: draft.trim(), cat }));
          }}
        >
          <input name="q" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="搜尋商品或顏色" aria-label="搜尋" />
          <button type="submit">搜尋</button>
        </form>
      </div>

      {categories.length > 0 && (
        <nav className="cats" aria-label="分類">
          <Link href={href({ sort, q })} className={!cat ? "on" : ""}>全部</Link>
          {categories.map((name) => {
            const matched = products.filter((product) => effectiveCategories(product).includes(name));
            const inStock = matched.filter((product) => !isSoldOut(product)).length;
            const label = inStock === 0 && matched.length > 0 ? `${name}（已售完）` : `${name}（${inStock}）`;
            return (
              <Link key={name} href={href({ sort, q, cat: name })} className={cat === name ? "on" : ""}>
                {label}
              </Link>
            );
          })}
        </nav>
      )}

      {visible.length ? (
        <section className="grid" aria-label="商品列表">
          {visible.map((product, index) => (
            <ProductCard key={product.id} product={product} index={index} />
          ))}
        </section>
      ) : (
        <section className="empty">
          <span className="eyebrow">{q || cat ? "沒有符合的商品" : "即將上架"}</span>
          <p>{q || cat ? "找不到符合條件的商品。" : "商品即將上架，敬請期待。"}</p>
          {(q || cat) && <Link href="/" className="link">清除條件</Link>}
        </section>
      )}
    </main>
  );
}
