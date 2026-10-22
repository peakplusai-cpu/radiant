import Link from "next/link";
import { getStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { priceRange, totalStock } from "@/lib/products";
import { deleteProduct, toggleProduct } from "@/app/actions/admin";
import { ProductImage } from "@/components/ProductImage";

export default async function ProductsAdmin({ searchParams }: { searchParams: Promise<{ saved?: string; filter?: string }> }) {
  const { saved, filter } = await searchParams;
  const { products } = await getStore();
  const list = [...products]
    .filter((p) => (filter === "listed" ? p.status === "listed" : filter === "unlisted" ? p.status === "unlisted" : true))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const counts = {
    all: products.length,
    listed: products.filter((p) => p.status === "listed").length,
    unlisted: products.filter((p) => p.status === "unlisted").length,
  };

  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Catalogue</span>
          <h1>商品管理</h1>
        </div>
        <Link href="/admin/products/new" className="btn solid">
          新增商品
        </Link>
      </div>
      {saved && <div className="notice" style={{ marginBottom: 24 }}>商品已儲存。</div>}
      <div className="tabs">
        <Link href="/admin/products" className={!filter ? "on" : ""}>全部 {counts.all}</Link>
        <Link href="/admin/products?filter=listed" className={filter === "listed" ? "on" : ""}>上架中 {counts.listed}</Link>
        <Link href="/admin/products?filter=unlisted" className={filter === "unlisted" ? "on" : ""}>已下架 {counts.unlisted}</Link>
      </div>

      {list.length ? (
        <table className="table">
          <thead>
            <tr>
              <th />
              <th>商品</th>
              <th>顏色</th>
              <th className="right">售價</th>
              <th className="right">庫存</th>
              <th className="right">已售</th>
              <th>狀態</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const { min, max } = priceRange(p);
              const stock = totalStock(p);
              return (
                <tr key={p.id}>
                  <td>
                    <div className="thumb-sm">
                      <ProductImage src={p.photos[0]} hex={p.variants[0]?.hex} alt={p.name} />
                    </div>
                  </td>
                  <td>
                    <Link href={`/admin/products/${p.id}`} className="link">
                      {p.name}
                    </Link>
                    {p.featured && <span className="badge" style={{ marginLeft: 10 }}>精選</span>}
                    {p.category && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{p.category}</div>}
                  </td>
                  <td>
                    <div className="swatches" style={{ marginTop: 0 }}>
                      {p.variants.map((v) => (
                        <span key={v.id} className="dot" title={`${v.color}（${v.stock}）`} style={{ background: v.hex }} />
                      ))}
                    </div>
                  </td>
                  <td className="num right">
                    {formatPrice(min)}
                    {max > min ? " 起" : ""}
                  </td>
                  <td className="right">
                    <span className={`badge${stock === 0 ? " warn" : stock <= 5 ? " warn" : ""}`}>{stock === 0 ? "售完" : stock}</span>
                  </td>
                  <td className="num right">{p.sold}</td>
                  <td>
                    <span className={`badge${p.status === "listed" ? " on" : " mute"}`}>{p.status === "listed" ? "上架中" : "已下架"}</span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <form action={toggleProduct}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="btn small">{p.status === "listed" ? "下架" : "上架"}</button>
                      </form>
                      <Link href={`/admin/products/${p.id}`} className="btn small">
                        編輯
                      </Link>
                      <form action={deleteProduct}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="btn small danger" formNoValidate>刪除</button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="empty" style={{ padding: "80px 0" }}>
          <span className="eyebrow">No products</span>
          <p>{filter ? "此分類沒有商品。" : "還沒有商品，先新增第一件吧。"}</p>
        </div>
      )}
    </>
  );
}
