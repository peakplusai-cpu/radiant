import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { getStore } from "@/lib/store";
import { parseSort, sortProducts, type SortKey } from "@/lib/sort";

export const dynamic = "force-dynamic";

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

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; q?: string; cat?: string }>;
}) {
  const sp = await searchParams;
  const sort = parseSort(sp.sort);
  const q = (sp.q ?? "").trim();
  const cat = (sp.cat ?? "").trim();
  const { products, settings } = await getStore();

  const listed = products.filter((p) => p.status === "listed");
  const categories = [...new Set(listed.map((p) => p.category).filter(Boolean))];
  const needle = q.toLowerCase();
  const filtered = listed.filter(
    (p) =>
      (!cat || p.category === cat) &&
      (!needle ||
        `${p.name} ${p.subtitle} ${p.category} ${p.variants.map((v) => v.color).join(" ")}`.toLowerCase().includes(needle))
  );
  const visible = sortProducts(filtered, sort);
  const priceNext = sort === "price_asc" ? "price_desc" : "price_asc";

  return (
    <>
      <Header />
      <main className="page">
        <section className="intro">
          <div>
            <span className="eyebrow">Collection</span>
            <h1>
              {settings.shopName === "Radiant" ? (
                <>
                  Quietly
                  <br />
                  <em>radiant</em>
                </>
              ) : (
                settings.shopName
              )}
            </h1>
          </div>
          <p>{settings.tagline || "精選商品，現正販售。"}</p>
        </section>

        <div className="toolbar">
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
          <form className="finder" action="/" role="search">
            {sort !== "pop" && <input type="hidden" name="sort" value={sort} />}
            {cat && <input type="hidden" name="cat" value={cat} />}
            <input name="q" defaultValue={q} placeholder="搜尋商品或顏色" aria-label="搜尋" />
            <button type="submit">搜尋</button>
          </form>
        </div>

        {categories.length > 0 && (
          <nav className="cats" aria-label="分類">
            <Link href={href({ sort, q })} className={!cat ? "on" : ""}>
              全部
            </Link>
            {categories.map((c) => (
              <Link key={c} href={href({ sort, q, cat: c })} className={cat === c ? "on" : ""}>
                {c}
              </Link>
            ))}
          </nav>
        )}

        {visible.length ? (
          <section className="grid" aria-label="商品列表">
            {visible.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </section>
        ) : (
          <section className="empty">
            <span className="eyebrow">{q || cat ? "No results" : "Coming soon"}</span>
            <p>{q || cat ? "找不到符合條件的商品。" : "商品即將上架，敬請期待。"}</p>
            {(q || cat) && (
              <Link href="/" className="link">
                清除條件
              </Link>
            )}
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
