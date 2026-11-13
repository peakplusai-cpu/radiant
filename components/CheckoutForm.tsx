"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatPrice } from "@/lib/format";
import { clearCart } from "@/lib/cart-client";
import { cleanPersonName, normalizeTaiwanPhone } from "@/lib/phone";
import type { Fulfillment, PickupPoint } from "@/lib/types";
import { variantLabel } from "@/lib/variants";
import { ProductImage } from "./ProductImage";
import { SummaryRows, totals, useCart } from "./CartView";

function idempotencyKey(): string {
  const existing = sessionStorage.getItem("radiant.checkout-key");
  if (existing) return existing;
  const next = crypto.randomUUID().replace(/-/g, "");
  sessionStorage.setItem("radiant.checkout-key", next);
  return next;
}

export function CheckoutForm({
  identity,
  paymentNote,
  pickupPoints,
  guest,
}: {
  identity: { name: string } | null;
  paymentNote: string;
  pickupPoints: PickupPoint[];
  guest: boolean;
}) {
  const router = useRouter();
  const { data, reload } = useCart();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<Fulfillment>("delivery");
  const [pickupId, setPickupId] = useState(pickupPoints[0]?.id ?? "");
  const pickupOn = pickupPoints.length > 0 && method === "pickup";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || busy) return;
    setError("");
    const form = new FormData(event.currentTarget);
    const recipient = String(form.get("recipient") ?? "");
    const phone = String(form.get("phone") ?? "");
    const address = String(form.get("address") ?? "");
    const nextErrors: Record<string, string> = {};
    if (!cleanPersonName(recipient)) nextErrors.recipient = "請填寫收件人姓名";
    if (!normalizeTaiwanPhone(phone)) nextErrors.phone = "請填寫有效的台灣電話，例如 0912345678";
    if (!pickupOn && address.trim().length < 6) nextErrors.address = "請填寫完整收件地址";
    if (pickupOn && !pickupId) nextErrors.pickup = "請選擇自取地點";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: data.lines.map((line) => ({ productId: line.productId, variantId: line.variantId, qty: line.qty })),
          recipient,
          phone,
          address: pickupOn ? "" : address,
          note: form.get("note"),
          fulfillment: pickupOn ? "pickup" : "delivery",
          pickupPointId: pickupOn ? pickupId : "",
          idempotencyKey: idempotencyKey(),
        }),
      });
      const json = (await res.json()) as { code?: string; error?: string };
      if (!res.ok || !json.code) {
        setError(json.error ?? "送出失敗，請稍後再試");
        await reload();
        setBusy(false);
        return;
      }
      sessionStorage.removeItem("radiant.checkout-key");
      clearCart();
      router.push(`/order/${json.code}`);
    } catch {
      setError("網路連線異常，請再試一次。若已看到訂單成立，請勿重複送出。");
      setBusy(false);
    }
  }

  if (!data) return <div className="empty">載入中…</div>;
  if (!data.lines.length) {
    return (
      <div className="empty">
        <span className="eyebrow">購物袋是空的</span>
        <p>請先選購商品再結帳。</p>
        <Link href="/" className="btn">回到商品</Link>
      </div>
    );
  }
  const blocked = data.lines.some((line) => line.stock < 1 || line.qty > line.stock);
  const selected = pickupPoints.find((point) => point.id === pickupId);

  return (
    <form onSubmit={submit} className="cart-grid" noValidate aria-busy={busy}>
      <div>
        {identity ? (
          <div className="identity">
            <div className="who">
              <small>LINE 已登入</small>
              {identity.name || "LINE 使用者"}
            </div>
            <a href="/api/line/logout?next=/checkout" className="link" style={{ fontSize: 13 }}>切換帳號</a>
          </div>
        ) : guest ? (
          <div className="notice" style={{ marginBottom: 20 }}>
            此訂單會以收件姓名與電話建立，不會把您填寫的 LINE 名稱當成已驗證身分。店家若啟用 LINE 登入，之後結帳就會改以 LINE 辨識。
          </div>
        ) : null}

        {pickupPoints.length > 0 && (
          <div className="method-switch" role="radiogroup" aria-label="取貨方式">
            <button type="button" className={method === "delivery" ? "on" : ""} aria-pressed={method === "delivery"} onClick={() => setMethod("delivery")}>宅配</button>
            <button type="button" className={method === "pickup" ? "on" : ""} aria-pressed={method === "pickup"} onClick={() => setMethod("pickup")}>自取</button>
          </div>
        )}

        <h2 style={{ fontFamily: "var(--serif-tc)", fontSize: 20, marginBottom: 22, letterSpacing: "0.08em" }}>
          {pickupOn ? "自取資料" : "收件資料"}
        </h2>
        <div className="two">
          <label className="field">
            <span className="label">姓名</span>
            <input className="input" name="recipient" required maxLength={40} autoComplete="name" aria-invalid={Boolean(fieldErrors.recipient)} disabled={busy} />
            {fieldErrors.recipient && <span className="field-error">{fieldErrors.recipient}</span>}
          </label>
          <label className="field">
            <span className="label">聯絡電話</span>
            <input className="input" name="phone" required maxLength={20} inputMode="tel" autoComplete="tel" placeholder="0912345678" aria-invalid={Boolean(fieldErrors.phone)} disabled={busy} />
            {fieldErrors.phone && <span className="field-error">{fieldErrors.phone}</span>}
          </label>
        </div>
        {pickupOn ? (
          <div className="pickup-list">
            {pickupPoints.map((point) => (
              <label key={point.id} className={`pickup-choice${pickupId === point.id ? " on" : ""}`}>
                <input type="radio" name="pickupPointId" value={point.id} checked={pickupId === point.id} onChange={() => setPickupId(point.id)} required disabled={busy} />
                <span>
                  <b>{point.name}</b>
                  {point.address && <small>{point.address}</small>}
                  {point.hours && <small>時段：{point.hours}</small>}
                  {point.note && <small>{point.note}</small>}
                </span>
              </label>
            ))}
            {fieldErrors.pickup && <span className="field-error">{fieldErrors.pickup}</span>}
          </div>
        ) : (
          <label className="field">
            <span className="label">收件地址</span>
            <input className="input" name="address" required maxLength={200} autoComplete="street-address" aria-invalid={Boolean(fieldErrors.address)} disabled={busy} />
            {fieldErrors.address && <span className="field-error">{fieldErrors.address}</span>}
          </label>
        )}
        <label className="field">
          <span className="label">備註</span>
          <textarea className="textarea" name="note" maxLength={300} disabled={busy} />
        </label>
        {pickupOn && selected && (
          <div className="notice" style={{ marginBottom: 20 }}>
            自取不收運費。商品備妥後我們會透過 LINE 通知您前往「{selected.name}」取貨。
          </div>
        )}
        {paymentNote && <div className="notice">{paymentNote}</div>}
      </div>

      <aside className="summary">
        <h2>訂單摘要</h2>
        <div className="mini-lines" style={{ marginBottom: 18 }}>
          {data.lines.map((line) => (
            <div key={`${line.productId}:${line.variantId}`} className="line" style={{ gridTemplateColumns: "56px 1fr auto", gap: 14, padding: "14px 0" }}>
              <div className="frame">
                <ProductImage src={line.photo} hex={line.hex} alt={line.name} sizes="56px" />
              </div>
              <div>
                <h3 style={{ fontSize: 14 }}>{line.name}</h3>
                <div className="variant" style={{ margin: "2px 0 0" }}>
                  <span className="dot" style={{ background: line.hex }} />
                  {variantLabel(line.color, line.size)} × {line.qty}
                </div>
              </div>
              <div className="amount" style={{ fontSize: 16 }}>{formatPrice(line.price * line.qty)}</div>
            </div>
          ))}
        </div>
        <SummaryRows data={data} pickup={pickupOn} />
        {error && <div className="notice error" style={{ marginTop: 20 }} role="alert">{error}</div>}
        <button type="submit" className="btn solid" disabled={busy || blocked}>
          {busy ? "送出中…" : blocked ? "庫存不足" : `送出訂單 · ${formatPrice(totals(data, { pickup: pickupOn }).total)}`}
        </button>
        {blocked && (
          <p style={{ fontSize: 13, color: "var(--alert)", margin: "12px 0 0" }}>
            部分商品庫存不足，請回 <Link href="/cart" className="link">購物袋</Link> 調整。
          </p>
        )}
      </aside>
    </form>
  );
}
