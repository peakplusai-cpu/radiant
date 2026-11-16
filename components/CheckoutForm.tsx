"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatPrice } from "@/lib/format";
import { clearCart } from "@/lib/cart-client";
import { cleanEmail, cleanPersonName, normalizeTaiwanMobile } from "@/lib/phone";
import { readGuestToken } from "@/lib/promo-client";
import { startPayment } from "@/lib/pay-client";
import { CVS_MAX_TOTAL, CVS_MIN_TOTAL, onlineEnabled, onlineTitle, type PaymentOptions } from "@/lib/payment";
import type { Fulfillment, PaymentMethod, PickupPoint } from "@/lib/types";
import { variantLabel } from "@/lib/variants";
import { ProductImage } from "./ProductImage";
import { SummaryRows, useCart } from "./CartView";

function idempotencyKey(): string {
  const existing = sessionStorage.getItem("radiant.checkout-key");
  if (existing) return existing;
  const next = crypto.randomUUID().replace(/-/g, "");
  sessionStorage.setItem("radiant.checkout-key", next);
  return next;
}

type Choice = { value: PaymentMethod; title: string; hint: string };

function paymentChoices(method: Fulfillment, options: PaymentOptions): Choice[] {
  const card: Choice = {
    value: "online",
    title: onlineTitle(options),
    hint: method === "cvs" ? "先在藍新金流安全付款，取貨時不用再付錢" : "送出後前往藍新金流安全付款頁",
  };
  if (method === "cvs") {
    const list: Choice[] = [];
    if (options.cvs) list.push({ value: "cod", title: "超商取貨付款", hint: "到門市取貨時再付款" });
    if (onlineEnabled(options)) list.push(card);
    return list;
  }
  const list: Choice[] = [];
  if (onlineEnabled(options)) list.push(card);
  list.push({ value: "line", title: "LINE 確認付款", hint: "送出訂單後，由我們在 LINE 與您確認付款方式" });
  return list;
}

export function CheckoutForm({
  identity,
  paymentNote,
  pickupPoints,
  options,
}: {
  identity: { name: string } | null;
  paymentNote: string;
  pickupPoints: PickupPoint[];
  options: PaymentOptions;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<Fulfillment>("delivery");
  const [pickupId, setPickupId] = useState(pickupPoints[0]?.id ?? "");
  const [payment, setPayment] = useState<PaymentMethod>(onlineEnabled(options) ? "online" : "line");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const fulfillment: Fulfillment = method === "pickup" && pickupPoints.length > 0 ? "pickup" : method === "cvs" && options.cvs ? "cvs" : "delivery";
  const { data, reload, coupon, setCoupon } = useCart(fulfillment, { phone, email });
  const pickupOn = pickupPoints.length > 0 && method === "pickup";
  const cvsOn = options.cvs && method === "cvs";
  const choices = paymentChoices(method, options);
  const chosen = choices.find((choice) => choice.value === payment) ?? choices[0];
  const methods: { value: Fulfillment; label: string }[] = [{ value: "delivery", label: "宅配" }];
  if (options.cvs) methods.push({ value: "cvs", label: "超商店到店" });
  if (pickupPoints.length > 0) methods.push({ value: "pickup", label: "自取" });

  function chooseMethod(next: Fulfillment) {
    setMethod(next);
    const available = paymentChoices(next, options);
    setPayment(available[0]?.value ?? "line");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || busy) return;
    setError("");
    const form = new FormData(event.currentTarget);
    const recipient = String(form.get("recipient") ?? "");
    const phone = String(form.get("phone") ?? "");
    const email = String(form.get("email") ?? "");
    const address = String(form.get("address") ?? "");
    const nextErrors: Record<string, string> = {};
    if (!cleanPersonName(recipient)) nextErrors.recipient = "請填寫收件人姓名";
    if (!normalizeTaiwanMobile(phone)) nextErrors.phone = "請填寫有效的台灣手機，例如 0912345678";
    if (!cleanEmail(email)) nextErrors.email = "請填寫有效的 Email，以便寄送收據";
    if (!pickupOn && !cvsOn && address.trim().length < 6) nextErrors.address = "請填寫完整收件地址";
    if (pickupOn && !pickupId) nextErrors.pickup = "請選擇自取地點";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    if (!chosen) return;

    setBusy(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: data.lines.map((line) => ({ productId: line.productId, variantId: line.variantId, qty: line.qty })),
          recipient,
          phone,
          email,
          address: pickupOn || cvsOn ? "" : address,
          note: form.get("note"),
          fulfillment: pickupOn ? "pickup" : cvsOn ? "cvs" : "delivery",
          payment: chosen.value,
          pickupPointId: pickupOn ? pickupId : "",
          idempotencyKey: idempotencyKey(),
          coupon,
          guestToken: readGuestToken(),
          shownPromoIds: data.quote?.applied.map((item) => item.id) ?? [],
        }),
      });
      const json = (await res.json()) as { code?: string; token?: string; pay?: boolean; error?: string };
      if (!res.ok || !json.code) {
        setError(json.error ?? "送出失敗，請稍後再試");
        await reload();
        setBusy(false);
        return;
      }
      sessionStorage.removeItem("radiant.checkout-key");
      clearCart();
      const tokenQuery = json.token ? `?t=${encodeURIComponent(json.token)}` : "";
      if (json.pay) {
        const failed = await startPayment(json.code, json.token);
        if (!failed) return;
      }
      router.push(`/order/${json.code}${tokenQuery}`);
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
  const sum = data.quote?.total ?? 0;
  const cvsOutOfRange = cvsOn && (sum < CVS_MIN_TOTAL || sum > CVS_MAX_TOTAL);
  const selected = pickupPoints.find((point) => point.id === pickupId);

  return (
    <form onSubmit={submit} className="cart-grid" noValidate aria-busy={busy}>
      <div>
        {identity ? (
          <div className="identity">
            <div className="who">
              <small>LINE 已登入（選用）</small>
              {identity.name || "LINE 使用者"}
            </div>
            <a href="/api/line/logout?next=/checkout" className="link" style={{ fontSize: 13 }}>改以訪客結帳</a>
          </div>
        ) : (
          <div className="notice" style={{ marginBottom: 20 }}>
            不需要登入。請留下姓名、手機與 Email。送出後請保存訂單連結，之後也能用這三項查詢訂單。
          </div>
        )}

        {methods.length > 1 && (
          <div className="method-switch" role="radiogroup" aria-label="取貨方式">
            {methods.map((item) => (
              <button key={item.value} type="button" className={method === item.value ? "on" : ""} aria-pressed={method === item.value} onClick={() => chooseMethod(item.value)} disabled={busy}>
                {item.label}
              </button>
            ))}
          </div>
        )}

        <h2 style={{ fontFamily: "var(--serif-tc)", fontSize: 20, marginBottom: 22, letterSpacing: "0.08em" }}>
          {pickupOn ? "自取資料" : cvsOn ? "取貨人資料" : "收件資料"}
        </h2>
        <div className="two">
          <label className="field">
            <span className="label">姓名</span>
            <input className="input" name="recipient" required maxLength={40} autoComplete="name" aria-invalid={Boolean(fieldErrors.recipient)} disabled={busy} />
            {fieldErrors.recipient && <span className="field-error">{fieldErrors.recipient}</span>}
          </label>
          <label className="field">
            <span className="label">聯絡電話</span>
            <input className="input" name="phone" required maxLength={20} inputMode="tel" autoComplete="tel" placeholder="0912345678" aria-invalid={Boolean(fieldErrors.phone)} disabled={busy} value={phone} onChange={(event) => setPhone(event.target.value)} />
            {fieldErrors.phone && <span className="field-error">{fieldErrors.phone}</span>}
          </label>
        </div>
        <label className="field">
          <span className="label">電子郵件</span>
          <input className="input" name="email" type="email" required maxLength={50} autoComplete="email" inputMode="email" placeholder="name@example.com" aria-invalid={Boolean(fieldErrors.email)} disabled={busy} value={email} onChange={(event) => setEmail(event.target.value)} />
          {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
        </label>
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
        ) : cvsOn ? (
          <div className="notice" style={{ marginBottom: 20 }}>
            下一步會前往藍新金流頁面，在那裡選擇 7-ELEVEN、全家或萊爾富門市，並填寫取貨人姓名與手機。取貨時請帶證件，姓名須與藍新頁面填寫的相同。
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
            自取不收運費。商品備妥後請憑訂單編號與手機至「{selected.name}」取貨。
          </div>
        )}
        {choices.length > 1 && (
          <fieldset className="pay-choices" aria-label="付款方式" style={{ border: 0, padding: 0, margin: "0 0 20px" }}>
            <legend className="label" style={{ marginBottom: 10 }}>付款方式</legend>
            <div className="pickup-list">
              {choices.map((choice) => (
                <label key={choice.value} className={`pickup-choice${chosen?.value === choice.value ? " on" : ""}`}>
                  <input type="radio" name="payment" value={choice.value} checked={chosen?.value === choice.value} onChange={() => setPayment(choice.value)} disabled={busy} />
                  <span>
                    <b>{choice.title}</b>
                    <small>{choice.hint}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {cvsOn && (
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 20px" }}>
            超商取貨訂單金額須在 NT$ {CVS_MIN_TOTAL}–{CVS_MAX_TOTAL.toLocaleString("en-US")} 之間。
          </p>
        )}
        {chosen?.value === "line" && paymentNote && <div className="notice">{paymentNote}</div>}
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
        <SummaryRows data={data} pickup={pickupOn} cvs={cvsOn} coupon={coupon} onCoupon={setCoupon} />
        {error && <div className="notice error" style={{ marginTop: 20 }} role="alert">{error}</div>}
        <button type="submit" className="btn solid" disabled={busy || blocked || cvsOutOfRange}>
          {busy
            ? "處理中…"
            : blocked
              ? "庫存不足"
              : cvsOutOfRange
                ? "金額不適用超商取貨"
                : `${chosen?.value === "online" ? "前往付款" : chosen?.value === "cod" ? "確認訂單" : "送出訂單"} · ${formatPrice(sum)}`}
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
