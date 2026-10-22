import Link from "next/link";
import { getStore } from "@/lib/store";
import { formatDate, formatPrice, OPEN_STATUSES } from "@/lib/format";

export default async function CustomersAdmin({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const needle = q.trim().toLowerCase();
  const { customers, orders } = await getStore();

  const rows = customers
    .map((c) => {
      const mine = orders.filter((o) => o.customerId === c.id);
      const valid = mine.filter((o) => o.status !== "cancelled");
      return {
        c,
        count: mine.length,
        open: mine.filter((o) => OPEN_STATUSES.includes(o.status)).length,
        spent: valid.reduce((s, o) => s + o.total, 0),
      };
    })
    .filter(({ c }) => !needle || `${c.lineName} ${c.lineId} ${c.lineUserId}`.toLowerCase().includes(needle))
    .sort((a, b) => b.open - a.open || b.c.lastOrderAt.localeCompare(a.c.lastOrderAt));

  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Customers</span>
          <h1>客戶</h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 14 }}>
            同一位 LINE 使用者的多次下單會自動歸在同一位客戶底下，可一次合併出貨。
          </p>
        </div>
        <form className="finder" action="/admin/customers">
          <input name="q" defaultValue={q} placeholder="LINE 名稱或 ID" aria-label="搜尋客戶" style={{ width: 220 }} />
          <button type="submit">搜尋</button>
        </form>
      </div>
      {rows.length ? (
        <table className="table">
          <thead>
            <tr>
              <th>LINE 名稱</th>
              <th>LINE ID</th>
              <th className="right">訂單數</th>
              <th className="right">待出貨</th>
              <th className="right">累計消費</th>
              <th>最近下單</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, count, open, spent }) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/admin/customers/${c.id}`} className="link">
                    {c.lineName || "（未命名）"}
                  </Link>
                  {!c.verified && <span className="badge warn" style={{ marginLeft: 8 }}>未驗證</span>}
                </td>
                <td>{c.lineId || "—"}</td>
                <td className="num right">{count}</td>
                <td className="right">{open > 0 ? <span className="badge on">{open}</span> : <span className="badge mute">0</span>}</td>
                <td className="num right">{formatPrice(spent)}</td>
                <td>{formatDate(c.lastOrderAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty" style={{ padding: "80px 0" }}>
          <span className="eyebrow">No customers</span>
          <p>客戶下單後會出現在這裡。</p>
        </div>
      )}
    </>
  );
}
