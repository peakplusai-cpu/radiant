"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";
import { onCartChange, readCart, writeCart, type CartEntry } from "@/lib/cart-client";
import { ProductImage } from "./ProductImage";

export type CartLineView = {
  productId: string;
  variantId: string;
  name: string;
  color: string;
  hex: string;
  photo: string;
  price: number;
  stock: number;
  qty: number;
};

export type CartData = { lines: CartLineView[]; shippingFee: number; freeShippingThreshold: number };

export function useCart() {
  const [data, setData] = useState<CartData | null>(null);
  const [dropped, setDropped] = useState(false);

  const load = useCallback(async () => {
    const items = readCart();
    if (!items.length) {
      setData({ lines: [], shippingFee: 0, freeShippingThreshold: 0 });
      return;
    }
    const res = await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const json = (await res.json()) as CartData;
    const valid = new Set(json.lines.map((l) => `${l.productId}:${l.variantId}`));
    const cleaned = items.filter((i) => valid.has(`${i.p}:${i.v}`));
    if (cleaned.length !== items.length) {
      setDropped(true);
      writeCart(cleaned);
      return;
    }
    setData(json);
  }, []);

  useEffect(() => {
    void load();
    return onCartChange(() => void load());
  }, [load]);

  return { data, dropped, reload: load };
}

export function totals(data: CartData, opts?: { pickup?: boolean }) {
  const subtotal = data.lines.reduce((s, l) => s + l.price * l.qty, 0);
  const free = data.freeShippingThreshold > 0 && subtotal >= data.freeShippingThreshold;
  const shipping = opts?.pickup || data.lines.length === 0 ? 0 : free ? 0 : data.shippingFee;
  return { subtotal, shipping, total: subtotal + shipping };
}

export function SummaryRows({ data, pickup = false }: { data: CartData; pickup?: boolean }) {
  const { subtotal, shipping, total } = totals(data, { pickup });
  const remain = data.freeShippingThreshold - subtotal;
  return (
    <>
      <div className="sum-row">
        <span>商品小計</span>
        <span>{formatPrice(subtotal)}</span>
      </div>
      <div className="sum-row">
        <span>{pickup ? "運費（自取）" : "運費"}</span>
        <span>{shipping === 0 ? "免運" : formatPrice(shipping)}</span>
      </div>
      {!pickup && data.freeShippingThreshold > 0 && remain > 0 && data.lines.length > 0 && (
        <div className="sum-row">
          <small>再購買 {formatPrice(remain)} 即享免運</small>
        </div>
      )}
      <div className="sum-row total">
        <span>合計</span>
        <span>{formatPrice(total)}</span>
      </div>
    </>
  );
}

export function CartView() {
  const { data, dropped } = useCart();

  function update(entry: CartEntry, q: number) {
    const items = readCart().map((i) => (i.p === entry.p && i.v === entry.v ? { ...i, q } : i));
    writeCart(items);
  }

  function remove(entry: CartEntry) {
    writeCart(readCart().filter((i) => !(i.p === entry.p && i.v === entry.v)));
  }

  if (!data) return <div className="empty">載入中…</div>;

  if (!data.lines.length) {
    return (
      <div className="empty">
        <span className="eyebrow">Your bag is empty</span>
        <p>購物袋目前沒有商品。</p>
        <Link href="/" className="btn">
          繼續逛逛
        </Link>
      </div>
    );
  }

  const blocked = data.lines.some((l) => l.stock < 1 || l.qty > l.stock);

  return (
    <>
      {dropped && <div className="notice" style={{ marginBottom: 24 }}>部分商品已下架，已從購物袋移除。</div>}
      <div className="cart-grid">
        <div>
          {data.lines.map((l) => {
            const entry = { p: l.productId, v: l.variantId, q: l.qty };
            const over = l.qty > l.stock;
            return (
              <div className="line" key={`${l.productId}:${l.variantId}`}>
                <Link href={`/p/${l.productId}`} className="frame">
                  <ProductImage src={l.photo} hex={l.hex} alt={l.name} />
                </Link>
                <div>
                  <h3>{l.name}</h3>
                  <div className="variant">
                    <span className="dot" style={{ background: l.hex }} />
                    {l.color}
                  </div>
                  <div className="qty">
                    <button type="button" onClick={() => update(entry, Math.max(1, l.qty - 1))} disabled={l.qty <= 1} aria-label="減少">
                      −
                    </button>
                    <span>{l.qty}</span>
                    <button type="button" onClick={() => update(entry, Math.min(l.stock, l.qty + 1))} disabled={l.qty >= l.stock} aria-label="增加">
                      +
                    </button>
                  </div>
                  {(over || l.stock < 1) && (
                    <p style={{ color: "var(--alert)", fontSize: 13, margin: "10px 0 0" }}>
                      {l.stock < 1 ? "此款式已售完，請移除" : `庫存僅剩 ${l.stock} 件，請調整數量`}
                    </p>
                  )}
                  <div>
                    <button type="button" className="remove" onClick={() => remove(entry)}>
                      移除
                    </button>
                  </div>
                </div>
                <div className="amount">{formatPrice(l.price * l.qty)}</div>
              </div>
            );
          })}
        </div>
        <aside className="summary">
          <h2>Summary</h2>
          <SummaryRows data={data} />
          {blocked ? (
            <button type="button" className="btn solid" disabled>
              請先調整庫存問題
            </button>
          ) : (
            <Link href="/checkout" className="btn solid">
              前往結帳
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}
