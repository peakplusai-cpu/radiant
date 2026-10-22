import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/store";
import { saveCustomerNote, shipAllForCustomer } from "@/app/actions/admin";
import { formatDate, formatPrice, ORDER_STATUS_LABEL, OPEN_STATUSES } from "@/lib/format";
import { PrintButton } from "@/components/admin/PrintButton";

export default async function CustomerAdmin({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ shipped?: string }>;
}) {
  const { id } = await params;
  const { shipped } = await searchParams;
  const { customers, orders } = await getStore();
  const customer = customers.find((c) => c.id === id);
  if (!customer) notFound();

  const mine = orders.filter((o) => o.customerId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const open = mine.filter((o) => OPEN_STATUSES.includes(o.status));

  const merged = new Map<string, { name: string; color: string; hex: string; qty: number; amount: number }>();
  for (const o of open) {
    for (const i of o.items) {
      const k = `${i.productId}:${i.variantId}`;
      const cur = merged.get(k) ?? { name: i.name, color: i.color, hex: i.hex, qty: 0, amount: 0 };
      cur.qty += i.qty;
      cur.amount += i.qty * i.price;
      merged.set(k, cur);
    }
  }
  const mergedItems = [...merged.values()];
  const mergedQty = mergedItems.reduce((s, i) => s + i.qty, 0);
  const itemsTotal = open.reduce((s, o) => s + o.subtotal, 0);
  const shippingTotal = open.reduce((s, o) => s + o.shipping, 0);
  const addresses = [...new Map(open.map((o) => [`${o.recipient}|${o.phone}|${o.address}`, o])).values()];
  const notes = open.filter((o) => o.note).map((o) => `${o.code}：${o.note}`);
  const spent = mine.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.total, 0);

  return (
    <>
      <div className="admin-head hide-print">
        <div>
          <span className="eyebrow">Customer</span>
          <h1>{customer.lineName || "（未命名）"}</h1>
        </div>
        <Link href="/admin/customers" className="link">
          ← 返回客戶
        </Link>
      </div>
      {shipped && <div className="notice hide-print" style={{ marginBottom: 24 }}>已將此客戶的待處理訂單全部標記為已出貨。</div>}

      <div className="form-grid">
        <div>
          <section className="merge-box">
            <span className="eyebrow">Combined shipment</span>
            <h2 style={{ marginTop: 6 }}>合併出貨單</h2>
            {open.length === 0 ? (
              <p style={{ color: "var(--muted)", margin: "10px 0 0" }}>目前沒有待處理的訂單。</p>
            ) : (
              <>
                <p style={{ color: "var(--muted)", fontSize: 14, margin: "4px 0 20px" }}>
                  {open.length} 張訂單（{open.map((o) => o.code).join("、")}）合併為一次出貨，共 {mergedQty} 件。
                </p>
                <table className="table" style={{ marginBottom: 18 }}>
                  <thead>
                    <tr>
                      <th>商品</th>
                      <th>顏色</th>
                      <th className="right">數量</th>
                      <th className="right">小計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mergedItems.map((i) => (
                      <tr key={`${i.name}:${i.color}`}>
                        <td>{i.name}</td>
                        <td>
                          <span className="dot" style={{ background: i.hex, display: "inline-block", verticalAlign: "middle", marginRight: 8 }} />
                          {i.color}
                        </td>
                        <td className="num right">{i.qty}</td>
                        <td className="num right">{formatPrice(i.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <dl className="kv" style={{ marginBottom: 20 }}>
                  <dt>商品合計</dt>
                  <dd>{formatPrice(itemsTotal)}</dd>
                  <dt>已收運費</dt>
                  <dd>
                    {formatPrice(shippingTotal)}
                    {open.length > 1 && shippingTotal > 0 && <span style={{ color: "var(--muted)" }}>（合併出貨時可酌情退運費）</span>}
                  </dd>
                  <dt>應收總額</dt>
                  <dd>{formatPrice(itemsTotal + shippingTotal)}</dd>
                  <dt>{addresses.length > 1 ? "收件資料（多組）" : "收件資料"}</dt>
                  <dd>
                    {addresses.map((o) => (
                      <div key={o.id} style={{ marginBottom: 6 }}>
                        {o.recipient}　{o.phone}
                        <br />
                        {o.address}
                      </div>
                    ))}
                  </dd>
                  {notes.length > 0 && (
                    <>
                      <dt>客戶備註</dt>
                      <dd>
                        {notes.map((n) => (
                          <div key={n}>{n}</div>
                        ))}
                      </dd>
                    </>
                  )}
                </dl>
                {addresses.length > 1 && (
                  <div className="notice error hide-print" style={{ marginBottom: 18 }}>
                    這些訂單的收件資料不一致，請先與客戶確認再合併出貨。
                  </div>
                )}
                <div className="row-actions hide-print" style={{ justifyContent: "flex-start" }}>
                  <PrintButton />
                  <form action={shipAllForCustomer}>
                    <input type="hidden" name="customerId" value={customer.id} />
                    <button className="btn solid small">全部標記為已出貨</button>
                  </form>
                </div>
              </>
            )}
          </section>

          <h2 className="hide-print" style={{ fontFamily: "var(--serif-tc)", fontSize: 20, margin: "40px 0 14px" }}>全部訂單（{mine.length}）</h2>
          <table className="table hide-print">
            <thead>
              <tr>
                <th>訂單</th>
                <th>時間</th>
                <th>狀態</th>
                <th className="right">金額</th>
              </tr>
            </thead>
            <tbody>
              {mine.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/admin/orders/${o.id}`} className="link">
                      {o.code}
                    </Link>
                  </td>
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
        </div>

        <div className="hide-print">
          <section className="panel">
            <h2>LINE 資料</h2>
            <dl className="kv" style={{ marginBottom: 24 }}>
              <dt>LINE 名稱</dt>
              <dd>{customer.lineName || "—"}</dd>
              <dt>LINE ID</dt>
              <dd>{customer.lineId || "—"}</dd>
              <dt>驗證</dt>
              <dd>{customer.verified ? "已透過 LINE 登入" : "客戶自行填寫（未驗證）"}</dd>
              {customer.lineUserId && (
                <>
                  <dt>User ID</dt>
                  <dd className="mono">{customer.lineUserId}</dd>
                </>
              )}
              <dt>累計消費</dt>
              <dd>{formatPrice(spent)}</dd>
              <dt>首次下單</dt>
              <dd>{formatDate(customer.createdAt)}</dd>
            </dl>
          </section>
          <section className="panel">
            <h2>客戶備註</h2>
            <form action={saveCustomerNote}>
              <input type="hidden" name="id" value={customer.id} />
              <label className="field">
                <textarea className="textarea" name="note" defaultValue={customer.note} maxLength={500} />
              </label>
              <button className="btn small" style={{ marginBottom: 28 }}>儲存備註</button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
