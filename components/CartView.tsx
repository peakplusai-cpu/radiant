"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";
import { changeQty, onCartChange, readCart, removeFromCart, writeCart, type CartEntry } from "@/lib/cart-client";
import { onPromoChange, readCoupon, readGuestToken, writeCoupon } from "@/lib/promo-client";
import { variantLabel } from "@/lib/variants";
import type { Fulfillment } from "@/lib/types";
import { ProductImage } from "./ProductImage";
import { useServerNow } from "./useServerNow";

export type CartLineView = {
  productId: string;
  variantId: string;
  name: string;
  color: string;
  size: string;
  hex: string;
  photo: string;
  price: number;
  stock: number;
  qty: number;
};

export type CartQuote = {
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  applied: { id: string; name: string; discount: number; freeShipping: boolean; endsAt: string }[];
  hints: { text: string }[];
  couponMessage: string;
  serverNow: number;
};

export type CartData = {
  lines: CartLineView[];
  shippingFee: number;
  cvsShippingFee: number;
  freeShippingThreshold: number;
  quote: CartQuote;
};

function emptyQuote(): CartQuote {
  return { subtotal: 0, discount: 0, shipping: 0, total: 0, applied: [], hints: [], couponMessage: "", serverNow: Date.now() };
}

export function useCart(fulfillment: Fulfillment = "delivery", contact?: { phone?: string; email?: string }) {
  const phone = contact?.phone ?? "";
  const email = contact?.email ?? "";
  const [slowPhone, setSlowPhone] = useState(phone);
  const [slowEmail, setSlowEmail] = useState(email);
  const [coupon, setCouponValue] = useState("");
  const [data, setData] = useState<CartData | null>(null);
  const [dropped, setDropped] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setSlowPhone(phone);
      setSlowEmail(email);
    }, 400);
    return () => window.clearTimeout(id);
  }, [phone, email]);

  const load = useCallback(async () => {
    const items = readCart();
    const id = ++requestId.current;
    const code = readCoupon();
    if (!items.length) {
      if (id === requestId.current) setData({ lines: [], shippingFee: 0, cvsShippingFee: 0, freeShippingThreshold: 0, quote: emptyQuote() });
      return;
    }
    const res = await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, fulfillment, coupon: code, guestToken: readGuestToken(), phone: slowPhone, email: slowEmail }),
    });
    if (id !== requestId.current) return;
    const json = (await res.json()) as CartData;
    if (!res.ok || !json.lines) return;
    const latest = readCart();
    const valid = new Set(json.lines.map((line) => `${line.productId}:${line.variantId}`));
    const cleaned = latest.filter((item) => valid.has(`${item.p}:${item.v}`));
    if (cleaned.length !== latest.length) {
      setDropped(true);
      writeCart(cleaned);
      return;
    }
    const qtyOf = new Map(latest.map((item) => [`${item.p}:${item.v}`, item.q]));
    setData({
      ...json,
      quote: json.quote ?? emptyQuote(),
      lines: json.lines.map((line) => ({ ...line, qty: qtyOf.get(`${line.productId}:${line.variantId}`) ?? line.qty })),
    });
  }, [fulfillment, slowPhone, slowEmail]);

  useEffect(() => {
    setCouponValue(readCoupon());
    void load();
    const stopCart = onCartChange(() => void load());
    const stopPromo = onPromoChange(() => {
      setCouponValue(readCoupon());
      void load();
    });
    return () => {
      stopCart();
      stopPromo();
    };
  }, [load]);

  const now = useServerNow(data?.quote.serverNow ?? Date.now());
  const expiry = (data?.quote.applied ?? []).map((item) => item.endsAt).join("|");
  useEffect(() => {
    if (!expiry) return;
    const nearest = Math.min(...expiry.split("|").map((item) => Date.parse(item)).filter((item) => Number.isFinite(item)));
    if (!Number.isFinite(nearest)) return;
    const wait = Math.max(800, nearest - now + 400);
    const id = window.setTimeout(() => void load(), wait);
    return () => window.clearTimeout(id);
  }, [expiry, now, load]);

  const setCoupon = useCallback((code: string) => {
    writeCoupon(code);
    setCouponValue(code.trim().slice(0, 20));
  }, []);

  return { data, dropped, reload: load, setData, coupon, setCoupon };
}

export function SummaryRows({
  data,
  pickup = false,
  cvs = false,
  coupon = "",
  onCoupon,
}: {
  data: CartData;
  pickup?: boolean;
  cvs?: boolean;
  coupon?: string;
  onCoupon?: (code: string) => void;
}) {
  const quote = data.quote ?? emptyQuote();
  const { subtotal, discount, shipping, total, applied, hints, couponMessage } = quote;
  const remain = data.freeShippingThreshold - subtotal;
  const promoFree = applied.some((item) => item.freeShipping);
  const [draft, setDraft] = useState(coupon);
  useEffect(() => setDraft(coupon), [coupon]);

  return (
    <>
      <div className="sum-row">
        <span>商品小計</span>
        <span>{formatPrice(subtotal)}</span>
      </div>
      {applied.map((item) => (
        <div className="sum-row discount" key={item.id}>
          <span>折扣 · {item.name}</span>
          <span>{item.discount > 0 ? `-${formatPrice(item.discount)}` : "已套用"}</span>
        </div>
      ))}
      {discount > 0 && applied.length > 1 && (
        <div className="sum-row discount">
          <span>折扣合計</span>
          <span>-{formatPrice(discount)}</span>
        </div>
      )}
      <div className="sum-row">
        <span>{pickup ? "運費（自取）" : cvs ? "運費（超商店到店）" : "運費"}</span>
        <span>{shipping === 0 ? (promoFree ? "免運（活動）" : "免運") : formatPrice(shipping)}</span>
      </div>
      {!pickup && !promoFree && data.freeShippingThreshold > 0 && remain > 0 && data.lines.length > 0 && (
        <div className="sum-row">
          <small>再購買 {formatPrice(remain)} 即享免運</small>
        </div>
      )}
      {hints.map((hint) => (
        <div className="sum-row" key={hint.text}>
          <small>{hint.text}</small>
        </div>
      ))}
      {onCoupon && (
        <label className="coupon-row">
          <span>優惠代碼</span>
          <span>
            <input
              value={draft}
              maxLength={20}
              aria-label="優惠代碼"
              onChange={(event) => setDraft(event.target.value.toUpperCase())}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onCoupon(draft);
                }
              }}
            />
            <button type="button" onClick={() => onCoupon(draft)}>使用</button>
          </span>
        </label>
      )}
      {couponMessage && (
        <div className="sum-row">
          <small>{couponMessage}</small>
        </div>
      )}
      <div className="sum-row total" data-applied={applied.map((item) => item.id).join(",")} data-discount={discount}>
        <span>合計</span>
        <span>{formatPrice(total)}</span>
      </div>
    </>
  );
}

export function CartView() {
  const { data, dropped, setData, coupon, setCoupon } = useCart();

  function update(entry: CartEntry, delta: number, stock: number) {
    const next = changeQty(entry.p, entry.v, delta, stock);
    const qty = next.find((item) => item.p === entry.p && item.v === entry.v)?.q;
    setData((current) =>
      current
        ? {
            ...current,
            lines: current.lines.map((line) =>
              line.productId === entry.p && line.variantId === entry.v && qty ? { ...line, qty } : line
            ),
          }
        : current
    );
  }

  function remove(entry: CartEntry) {
    removeFromCart(entry.p, entry.v);
    setData((current) =>
      current ? { ...current, lines: current.lines.filter((line) => !(line.productId === entry.p && line.variantId === entry.v)) } : current
    );
  }

  if (!data) return <div className="empty">載入中…</div>;

  if (!data.lines.length) {
    return (
      <div className="empty">
        <span className="eyebrow">購物袋是空的</span>
        <p>目前沒有商品。</p>
        <Link href="/" className="btn">繼續逛逛</Link>
      </div>
    );
  }

  const blocked = data.lines.some((line) => line.stock < 1 || line.qty > line.stock);

  return (
    <>
      {dropped && <div className="notice" style={{ marginBottom: 24 }}>部分商品已下架或款式已變更，已從購物袋移除。</div>}
      <div className="cart-grid">
        <div>
          {data.lines.map((line) => {
            const entry = { p: line.productId, v: line.variantId, q: line.qty };
            const over = line.qty > line.stock;
            return (
              <div className="line" key={`${line.productId}:${line.variantId}`}>
                <Link href={`/p/${line.productId}`} className="frame">
                  <ProductImage src={line.photo} hex={line.hex} alt={line.name} sizes="96px" />
                </Link>
                <div>
                  <h3>{line.name}</h3>
                  <div className="variant">
                    <span className="dot" style={{ background: line.hex }} />
                    {variantLabel(line.color, line.size)}
                  </div>
                  <div className="qty">
                    <button type="button" onClick={() => update(entry, -1, line.stock)} disabled={line.qty <= 1} aria-label="減少">−</button>
                    <span>{line.qty}</span>
                    <button type="button" onClick={() => update(entry, 1, line.stock)} disabled={line.qty >= line.stock} aria-label="增加">+</button>
                  </div>
                  {(over || line.stock < 1) && (
                    <p style={{ color: "var(--alert)", fontSize: 13, margin: "10px 0 0" }}>
                      {line.stock < 1 ? "此款式已售完，請移除" : `庫存僅剩 ${line.stock} 件，請調整數量`}
                    </p>
                  )}
                  <div>
                    <button type="button" className="remove" onClick={() => remove(entry)}>移除</button>
                  </div>
                </div>
                <div className="amount">{formatPrice(line.price * line.qty)}</div>
              </div>
            );
          })}
        </div>
        <aside className="summary">
          <h2>訂單摘要</h2>
          <SummaryRows data={data} coupon={coupon} onCoupon={setCoupon} />
          {blocked ? (
            <button type="button" className="btn solid" disabled>請先調整庫存問題</button>
          ) : (
            <Link href="/checkout" className="btn solid">前往結帳</Link>
          )}
        </aside>
      </div>
    </>
  );
}
