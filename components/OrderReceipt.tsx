import { formatDate, formatPrice, ORDER_STATUS_LABEL } from "@/lib/format";
import type { Order } from "@/lib/types";
import { ProductImage } from "./ProductImage";

export function OrderReceipt({ order, showAddress = true }: { order: Order; showAddress?: boolean }) {
  return (
    <section className="receipt">
      <div className="receipt-head">
        <div>
          <span className="eyebrow">Order</span>
          <div className="receipt-code">{order.code}</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>{formatDate(order.createdAt)}</div>
        </div>
        <div>
          <span className={`status-pill ${order.status}`}>{ORDER_STATUS_LABEL[order.status]}</span>
        </div>
      </div>
      <div className="mini-lines">
        {order.items.map((i) => (
          <div className="line" key={`${i.productId}:${i.variantId}`} style={{ gridTemplateColumns: "64px 1fr auto", gap: 18 }}>
            <div className="frame">
              <ProductImage src={i.photo} hex={i.hex} alt={i.name} />
            </div>
            <div>
              <h3>{i.name}</h3>
              <div className="variant" style={{ margin: "4px 0 0" }}>
                <span className="dot" style={{ background: i.hex }} />
                {i.color} × {i.qty}
              </div>
            </div>
            <div className="amount">{formatPrice(i.price * i.qty)}</div>
          </div>
        ))}
      </div>
      <div style={{ maxWidth: 320, marginLeft: "auto", marginTop: 12 }}>
        <div className="sum-row">
          <span>商品小計</span>
          <span>{formatPrice(order.subtotal)}</span>
        </div>
        <div className="sum-row">
          <span>運費</span>
          <span>{order.shipping === 0 ? "免運" : formatPrice(order.shipping)}</span>
        </div>
        <div className="sum-row total">
          <span>合計</span>
          <span>{formatPrice(order.total)}</span>
        </div>
      </div>
      {showAddress && (
        <dl className="kv" style={{ marginTop: 28, paddingTop: 22, borderTop: "1px solid var(--teal-soft)" }}>
          <dt>收件人</dt>
          <dd>{order.recipient}</dd>
          <dt>電話</dt>
          <dd>{order.phone}</dd>
          <dt>地址</dt>
          <dd>{order.address}</dd>
          {order.note && (
            <>
              <dt>備註</dt>
              <dd>{order.note}</dd>
            </>
          )}
        </dl>
      )}
    </section>
  );
}
