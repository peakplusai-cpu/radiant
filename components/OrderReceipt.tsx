import { formatDate, formatPrice, fulfillmentLabel, orderStatusLabel } from "@/lib/format";
import { paymentLabel, payTypeLabel } from "@/lib/payment";
import { variantLabel } from "@/lib/variants";
import type { Order } from "@/lib/types";
import { ProductImage } from "./ProductImage";

export function OrderReceipt({ order, showAddress = true, staff = false }: { order: Order; showAddress?: boolean; staff?: boolean }) {
  return (
    <section className="receipt">
      <div className="receipt-head">
        <div>
          <span className="eyebrow">Order</span>
          <div className="receipt-code">{order.code}</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>{formatDate(order.createdAt)}</div>
        </div>
        <div>
          <span className={`status-pill ${order.status}`}>{orderStatusLabel(order)}</span>
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
                {variantLabel(i.color, i.size)} × {i.qty}
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
        {order.discount > 0 && (
          <div className="sum-row discount">
            <span>折扣{order.appliedPromos.length ? ` · ${order.appliedPromos.map((promo) => promo.name).join("、")}` : ""}</span>
            <span>-{formatPrice(order.discount)}</span>
          </div>
        )}
        <div className="sum-row">
          <span>{order.fulfillment === "pickup" ? "運費（自取）" : order.fulfillment === "cvs" ? "運費（超商店到店）" : "運費"}</span>
          <span>{order.shipping === 0 ? "免運" : formatPrice(order.shipping)}</span>
        </div>
        <div className="sum-row total">
          <span>合計</span>
          <span>{formatPrice(order.total)}</span>
        </div>
      </div>
      {showAddress && (
        <dl className="kv" style={{ marginTop: 28, paddingTop: 22, borderTop: "1px solid var(--teal-soft)" }}>
          <dt>取貨方式</dt>
          <dd>{fulfillmentLabel(order.fulfillment)}</dd>
          <dt>付款方式</dt>
          <dd>
            {paymentLabel(order.paymentMethod, order.fulfillment)}
            {order.payType ? ` · ${payTypeLabel(order.payType)}` : ""}
            {order.paidAt && order.paymentMethod === "online" ? `（${formatDate(order.paidAt)} 已付款）` : ""}
          </dd>
          {order.payTradeNo && (
            <>
              <dt>藍新交易序號</dt>
              <dd className="mono">{order.payTradeNo}</dd>
            </>
          )}
          {order.status === "pending" && order.payCodeNo && (
            <>
              <dt>{order.payType === "VACC" ? "ATM 繳費" : "超商繳費代碼"}</dt>
              <dd>
                {order.payBankCode && <div>銀行代碼 {order.payBankCode}</div>}
                <div className="mono">{order.payCodeNo}</div>
                {order.payExpire && <div>請於 {order.payExpire} 23:59 前繳費</div>}
              </dd>
            </>
          )}
          <dt>姓名</dt>
          <dd>{order.recipient}</dd>
          <dt>電話</dt>
          <dd>{order.phone}</dd>
          {order.email && (
            <>
              <dt>Email</dt>
              <dd>{order.email}</dd>
            </>
          )}
          {order.fulfillment === "cvs" ? (
            <>
              <dt>取貨門市</dt>
              <dd>
                {order.cvs?.storeName ? `${order.cvs.storeType} ${order.cvs.storeName}`.trim() : "尚未選擇門市"}
                {order.cvs?.storeAddr && <div style={{ color: "var(--muted)", fontSize: 13 }}>{order.cvs.storeAddr}</div>}
              </dd>
              {order.cvs?.pickupName && (
                <>
                  <dt>取貨人</dt>
                  <dd>
                    {order.cvs.pickupName}
                    {order.cvs.pickupPhone ? ` ${order.cvs.pickupPhone}` : ""}
                  </dd>
                </>
              )}
              {staff && order.cvs?.lgsNo && (
                <>
                  <dt>寄件代碼</dt>
                  <dd className="mono">{order.cvs.lgsNo}</dd>
                </>
              )}
            </>
          ) : (
            <>
              <dt>{order.fulfillment === "pickup" ? "自取地點" : "地址"}</dt>
              <dd>{order.address || order.pickupPointName}</dd>
            </>
          )}
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
