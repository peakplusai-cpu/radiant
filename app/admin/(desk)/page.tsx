import Link from "next/link";
import { getStore } from "@/lib/store";
import { formatDate, formatPrice, ORDER_STATUS_LABEL, OPEN_STATUSES } from "@/lib/format";
import { totalStock } from "@/lib/products";

export default async function Dashboard() {
  const { products, orders, customers } = await getStore();
  const open = orders.filter((o) => OPEN_STATUSES.includes(o.status));
  const revenue = orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  const listed = products.filter((p) => p.status === "listed").length;
  const low = products.filter((p) => p.status === "listed" && totalStock(p) <= 5);
  const recent = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  const byId = new Map(customers.map((c) => [c.id, c]));

  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Overview</span>
          <h1>總覽</h1>
        </div>
        <Link href="/admin/products/new" className="btn solid">
          新增商品
        </Link>
      </div>

      <div className="stats">
        <div className="stat">
          <span>待處理訂單</span>
          <b>{open.length}</b>
        </div>
        <div className="stat">
          <span>上架中商品</span>
          <b>
            {listed}
            <small style={{ fontSize: 16, color: "var(--muted)" }}> / {products.length}</small>
          </b>
        </div>
        <div className="stat">
          <span>客戶數</span>
          <b>{customers.length}</b>
        </div>
        <div className="stat">
          <span>累計營收</span>
          <b>{formatPrice(revenue)}</b>
        </div>
      </div>

      {low.length > 0 && (
        <div className="notice error" style={{ marginBottom: 36 }}>
          庫存偏低（5 件以下）：{low.map((p) => `${p.name}（${totalStock(p)}）`).join("、")}
        </div>
      )}

      <div className="admin-head" style={{ marginBottom: 12 }}>
        <div>
          <span className="eyebrow">Recent</span>
          <h1 style={{ fontSize: 22 }}>最新訂單</h1>
        </div>
        <Link href="/admin/orders" className="link">
          全部訂單
        </Link>
      </div>
      {recent.length ? (
        <table className="table">
          <thead>
            <tr>
              <th>訂單</th>
              <th>LINE 客戶</th>
              <th>時間</th>
              <th>狀態</th>
              <th className="right">金額</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link href={`/admin/orders/${o.id}`} className="link">
                    {o.code}
                  </Link>
                </td>
                <td>{byId.get(o.customerId)?.lineName ?? "—"}</td>
                <td>{formatDate(o.createdAt)}</td>
                <td>
                  <span className={`badge${OPEN_STATUSES.includes(o.status) ? " on" : o.status === "cancelled" ? " mute" : ""}`}>
                    {ORDER_STATUS_LABEL[o.status]}
                  </span>
                </td>
                <td className="num right">{formatPrice(o.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: "var(--muted)" }}>還沒有訂單。</p>
      )}
    </>
  );
}
