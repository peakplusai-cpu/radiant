import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/store";
import { updateOrder } from "@/app/actions/admin";
import { OrderReceipt } from "@/components/OrderReceipt";
import { ORDER_STATUS_LABEL, ORDER_STATUSES, OPEN_STATUSES } from "@/lib/format";

export default async function OrderAdmin({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ updated?: string }>;
}) {
  const { id } = await params;
  const { updated } = await searchParams;
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
            <form action={updateOrder}>
              <input type="hidden" name="id" value={order.id} />
              {locked && <input type="hidden" name="status" value="cancelled" />}
              <label className="field">
                <span className="label">狀態</span>
                <select className="select" name="status" defaultValue={order.status} disabled={locked}>
                  {ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {ORDER_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <span className="hint">改為「已取消」會自動把庫存加回去；取消後無法恢復。</span>
              </label>
              <label className="field">
                <span className="label">內部備註</span>
                <textarea className="textarea" name="internalNote" defaultValue={order.internalNote} maxLength={500} />
              </label>
              <button className="btn solid" style={{ marginBottom: 28 }}>
                儲存
              </button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
