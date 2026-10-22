import Link from "next/link";
import { getStore } from "@/lib/store";
import { formatDate, formatPrice, ORDER_STATUS_LABEL, ORDER_STATUSES, OPEN_STATUSES } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";

export default async function OrdersAdmin({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const status = ORDER_STATUSES.includes(sp.status as OrderStatus) ? (sp.status as OrderStatus) : undefined;
  const q = (sp.q ?? "").trim().toLowerCase();
  const { orders, customers } = await getStore();
  const byId = new Map(customers.map((c) => [c.id, c]));
  const orderCount = new Map<string, number>();
  for (const o of orders) orderCount.set(o.customerId, (orderCount.get(o.customerId) ?? 0) + 1);

  const list = orders
    .filter((o) => !status || o.status === status)
    .filter((o) => {
      if (!q) return true;
      const c = byId.get(o.customerId);
      return `${o.code} ${o.recipient} ${o.phone} ${c?.lineName ?? ""} ${c?.lineId ?? ""}`.toLowerCase().includes(q);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Orders</span>
          <h1>訂單</h1>
        </div>
        <form className="finder" action="/admin/orders">
          {status && <input type="hidden" name="status" value={status} />}
          <input name="q" defaultValue={sp.q ?? ""} placeholder="訂單編號、LINE 名稱、收件人" aria-label="搜尋訂單" style={{ width: 260 }} />
          <button type="submit">搜尋</button>
        </form>
      </div>
      <div className="tabs">
        <Link href="/admin/orders" className={!status ? "on" : ""}>全部 {orders.length}</Link>
        {ORDER_STATUSES.map((s) => (
          <Link key={s} href={`/admin/orders?status=${s}`} className={status === s ? "on" : ""}>
            {ORDER_STATUS_LABEL[s]} {orders.filter((o) => o.status === s).length}
          </Link>
        ))}
      </div>

      {list.length ? (
        <table className="table">
          <thead>
            <tr>
              <th>訂單</th>
              <th>LINE 客戶</th>
              <th>收件人</th>
              <th>商品</th>
              <th>時間</th>
              <th>狀態</th>
              <th className="right">金額</th>
            </tr>
          </thead>
          <tbody>
            {list.map((o) => {
              const c = byId.get(o.customerId);
              const n = orderCount.get(o.customerId) ?? 1;
              const open = orders.filter((x) => x.customerId === o.customerId && OPEN_STATUSES.includes(x.status)).length;
              return (
                <tr key={o.id}>
                  <td>
                    <Link href={`/admin/orders/${o.id}`} className="link">
                      {o.code}
                    </Link>
                  </td>
                  <td>
                    {c ? (
                      <Link href={`/admin/customers/${c.id}`}>
                        {c.lineName || "（未命名）"}
                        {!c.verified && <span className="badge warn" style={{ marginLeft: 8 }}>未驗證</span>}
                      </Link>
                    ) : (
                      "—"
                    )}
                    {n > 1 && (
                      <div style={{ marginTop: 2 }}>
                        <span className="badge on">同客共 {n} 張{open > 1 ? ` · ${open} 張待出貨` : ""}</span>
                      </div>
                    )}
                  </td>
                  <td>{o.recipient}</td>
                  <td style={{ maxWidth: 260, fontSize: 13, color: "var(--muted)" }}>
                    {o.items.map((i) => `${i.name} ${i.color}×${i.qty}`).join("、")}
                  </td>
                  <td>{formatDate(o.createdAt)}</td>
                  <td>
                    <span className={`badge${OPEN_STATUSES.includes(o.status) ? " on" : o.status === "cancelled" ? " mute" : ""}`}>
                      {ORDER_STATUS_LABEL[o.status]}
                    </span>
                  </td>
                  <td className="num right">{formatPrice(o.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="empty" style={{ padding: "80px 0" }}>
          <span className="eyebrow">No orders</span>
          <p>沒有符合的訂單。</p>
        </div>
      )}
    </>
  );
}
