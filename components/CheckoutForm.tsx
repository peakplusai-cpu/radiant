"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatPrice } from "@/lib/format";
import { clearCart } from "@/lib/cart-client";
import { ProductImage } from "./ProductImage";
import { SummaryRows, totals, useCart } from "./CartView";

export function CheckoutForm({
  identity,
  paymentNote,
}: {
  identity: { name: string } | null;
  paymentNote: string;
}) {
  const router = useRouter();
  const { data } = useCart();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!data || busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: data.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty })),
        recipient: form.get("recipient"),
        phone: form.get("phone"),
        address: form.get("address"),
        note: form.get("note"),
        lineId: form.get("lineId"),
        lineName: form.get("lineName"),
      }),
    });
    const json = (await res.json()) as { code?: string; token?: string; error?: string };
    if (!res.ok || !json.code) {
      setError(json.error ?? "送出失敗，請稍後再試");
      setBusy(false);
      return;
    }
    clearCart();
    router.push(`/order/${json.code}?t=${json.token}`);
  }

  if (!data) return <div className="empty">載入中…</div>;
  if (!data.lines.length) {
    return (
      <div className="empty">
        <span className="eyebrow">Your bag is empty</span>
        <p>購物袋目前沒有商品。</p>
        <Link href="/" className="btn">
          回到商品
        </Link>
      </div>
    );
  }
  const blocked = data.lines.some((l) => l.stock < 1 || l.qty > l.stock);

  return (
    <form onSubmit={submit} className="cart-grid">
      <div>
        {identity ? (
          <div className="identity">
            <div className="who">
              <small>LINE 已連接</small>
              {identity.name || "LINE 使用者"}
            </div>
            <a href="/api/line/logout?next=/checkout" className="link" style={{ fontSize: 13 }}>
              切換帳號
            </a>
          </div>
        ) : (
          <div className="panel" style={{ paddingBottom: 26 }}>
            <h2>
              LINE 資料
              <small>用來辨識您的身分，同一位客人的多次訂單會自動合併處理。</small>
            </h2>
            <div className="two">
              <label className="field">
                <span className="label">LINE 名稱</span>
                <input className="input" name="lineName" required maxLength={60} />
              </label>
              <label className="field">
                <span className="label">LINE ID</span>
                <input className="input" name="lineId" required maxLength={60} />
              </label>
            </div>
          </div>
        )}

        <h2 style={{ fontFamily: "var(--serif-tc)", fontSize: 20, marginBottom: 22, letterSpacing: "0.08em" }}>收件資料</h2>
        <div className="two">
          <label className="field">
            <span className="label">收件人</span>
            <input className="input" name="recipient" required maxLength={60} autoComplete="name" />
          </label>
          <label className="field">
            <span className="label">聯絡電話</span>
            <input className="input" name="phone" required maxLength={30} inputMode="tel" autoComplete="tel" />
          </label>
        </div>
        <label className="field">
          <span className="label">收件地址</span>
          <input className="input" name="address" required maxLength={200} autoComplete="street-address" />
        </label>
        {identity && (
          <label className="field">
            <span className="label">LINE ID（選填）</span>
            <input className="input" name="lineId" maxLength={60} />
            <span className="hint">方便我們日後搜尋與聯絡。</span>
          </label>
        )}
        <label className="field">
          <span className="label">備註</span>
          <textarea className="textarea" name="note" maxLength={300} />
        </label>
        {paymentNote && <div className="notice">{paymentNote}</div>}
      </div>

      <aside className="summary">
        <h2>Summary</h2>
        <div className="mini-lines" style={{ marginBottom: 18 }}>
          {data.lines.map((l) => (
            <div key={`${l.productId}:${l.variantId}`} className="line" style={{ gridTemplateColumns: "56px 1fr auto", gap: 14, padding: "14px 0" }}>
              <div className="frame">
                <ProductImage src={l.photo} hex={l.hex} alt={l.name} />
              </div>
              <div>
                <h3 style={{ fontSize: 14 }}>{l.name}</h3>
                <div className="variant" style={{ margin: "2px 0 0" }}>
                  <span className="dot" style={{ background: l.hex }} />
                  {l.color} × {l.qty}
                </div>
              </div>
              <div className="amount" style={{ fontSize: 16 }}>
                {formatPrice(l.price * l.qty)}
              </div>
            </div>
          ))}
        </div>
        <SummaryRows data={data} />
        {error && (
          <div className="notice error" style={{ marginTop: 20 }} role="alert">
            {error}
          </div>
        )}
        <button type="submit" className="btn solid" disabled={busy || blocked}>
          {busy ? "送出中…" : `送出訂單 · ${formatPrice(totals(data).total)}`}
        </button>
        {blocked && (
          <p style={{ fontSize: 13, color: "var(--alert)", margin: "12px 0 0" }}>
            部分商品庫存不足，請回{" "}
            <Link href="/cart" className="link">
              購物袋
            </Link>{" "}
            調整。
          </p>
        )}
      </aside>
    </form>
  );
}
