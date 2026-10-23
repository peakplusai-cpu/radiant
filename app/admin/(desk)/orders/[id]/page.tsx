import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/store";
import { updateOrder } from "@/app/actions/admin";
import { OrderReceipt } from "@/components/OrderReceipt";
import { CancelOrderButton } from "@/components/admin/CancelOrderButton";
import { ORDER_STATUS_LABEL, ORDER_STATUSES, OPEN_STATUSES } from "@/lib/format";

export default async function OrderAdmin({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ updated?: string; cancelled?: string }>;
}) {
  const { id } = await params;
  const { updated, cancelled } = await searchParams;
  const { orders, customers } = await getStore();
  const order = orders.find((o) => o.id === id);
  if (!order) notFound();
  const customer = customers.find((c) => c.id === order.customerId);
  const siblings = orders.filter((o) => o.customerId === order.customerId && o.id !== order.id);
  const openSiblings = siblings.filter((o) => OPEN_STATUSES.includes(o.status));
  const locked = order.status === "cancelled";

  return (
    <>
      <div className="admin-head">
        <div>
          <span className="eyebrow">Order</span>
          <h1>{order.code}</h1>
        </div>
        <Link href="/admin/orders" className="link">
          ← 返回訂單
        </Link>
      </div>
      {updated && <div className="notice" style={{ marginBottom: 24 }}>訂單已更新。</div>}
      {cancelled && <div className="notice" style={{ marginBottom: 24 }}>訂單已取消，庫存已加回商品。</div>}

      <div className="form-grid">
        <OrderReceipt order={order} />
        <div>
          <section className="panel">
            <h2>LINE 客戶</h2>
            {customer ? (
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
              </dl>
            ) : (
              <p>—</p>
            )}
            {customer && (
              <p style={{ marginTop: 0, marginBottom: 24 }}>
                <Link href={`/admin/customers/${customer.id}`} className="link">
                  查看此客戶全部 {siblings.length + 1} 張訂單
                </Link>
              </p>
            )}
            {openSiblings.length > 0 && (
              <div className="notice" style={{ marginBottom: 24 }}>
                此客戶另有 {openSiblings.length} 張待處理訂單（{openSiblings.map((o) => o.code).join("、")}），建議合併出貨。
              </div>
            )}
          </section>

          <section className="panel">
            <h2>處理訂單</h2>
            {locked ? (
              <p style={{ color: "var(--muted)", marginTop: 0 }}>此單已取消，庫存已歸還。無法恢復。</p>
            ) : (
              <form action={updateOrder}>
                <input type="hidden" name="id" value={order.id} />
                <label className="field">
                  <span className="label">狀態</span>
                  <select className="select" name="status" defaultValue={order.status}>
                    {ORDER_STATUSES.filter((s) => s !== "cancelled").map((s) => (
                      <option key={s} value={s}>
                        {ORDER_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="label">內部備註</span>
                  <textarea className="textarea" name="internalNote" defaultValue={order.internalNote} maxLength={500} />
                </label>
                <button className="btn solid" style={{ marginBottom: 20 }}>
                  儲存
                </button>
              </form>
            )}
            {order.internalNote && locked && (
              <p style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{order.internalNote}</p>
            )}
            {!locked && order.status !== "completed" && (
              <div style={{ paddingTop: 8, borderTop: "1px solid var(--teal-soft)", marginBottom: 20 }}>
                <p style={{ fontSize: 13, color: "var(--muted)", margin: "16px 0 12px" }}>
                  取消後無法恢復，商品庫存會自動加回。
                </p>
                <CancelOrderButton orderId={order.id} code={order.code} warnShipped={order.status === "shipped"} />
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
