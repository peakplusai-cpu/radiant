"use client";

import { useState } from "react";
import { cancelOrder } from "@/app/actions/admin";

export function CancelOrderButton({
  orderId,
  code,
  compact,
  warnShipped,
}: {
  orderId: string;
  code: string;
  compact?: boolean;
  warnShipped?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  if (compact) {
    return (
      <form
        action={cancelOrder}
        onSubmit={(e) => {
          if (!confirm(`確定取消訂單 ${code}？庫存會加回商品。`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={orderId} />
        <button className="btn small danger" type="submit">
          取消
        </button>
      </form>
    );
  }

  if (!open) {
    return (
      <button type="button" className="btn danger" onClick={() => setOpen(true)}>
        取消訂單
      </button>
    );
  }

  return (
    <form
      action={async (form) => {
        setPending(true);
        await cancelOrder(form);
      }}
      style={{ marginTop: 8 }}
    >
      <input type="hidden" name="id" value={orderId} />
      {warnShipped && (
        <div className="notice error" style={{ marginBottom: 16 }}>
          此單已出貨。取消會把庫存加回去，若貨已寄出請另外處理退件。
        </div>
      )}
      <label className="field">
        <span className="label">取消原因（選填，客人若有綁 LINE 會一併收到）</span>
        <input className="input" name="reason" maxLength={300} placeholder="例如：缺貨、客人要求取消" />
      </label>
      <div className="row-actions" style={{ justifyContent: "flex-start", marginBottom: 8 }}>
        <button className="btn danger solid" type="submit" disabled={pending}>
          {pending ? "取消中…" : "確定取消並歸還庫存"}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)} disabled={pending}>
          返回
        </button>
      </div>
    </form>
  );
}
