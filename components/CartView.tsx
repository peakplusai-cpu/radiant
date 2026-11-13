"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";
import { changeQty, onCartChange, readCart, removeFromCart, writeCart, type CartEntry } from "@/lib/cart-client";
import { variantLabel } from "@/lib/variants";
import { ProductImage } from "./ProductImage";

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

export type CartData = { lines: CartLineView[]; shippingFee: number; freeShippingThreshold: number };

export function useCart() {
  const [data, setData] = useState<CartData | null>(null);
  const [dropped, setDropped] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const items = readCart();
    const id = ++requestId.current;
    if (!items.length) {
      if (id === requestId.current) setData({ lines: [], shippingFee: 0, freeShippingThreshold: 0 });
      return;
    }
    const res = await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (id !== requestId.current) return;
    const json = (await res.json()) as CartData;
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
      lines: json.lines.map((line) => ({ ...line, qty: qtyOf.get(`${line.productId}:${line.variantId}`) ?? line.qty })),
    });
  }, []);

  useEffect(() => {
    void load();
    return onCartChange(() => void load());
  }, [load]);

  return { data, dropped, reload: load, setData };
}

export function totals(data: CartData, opts?: { pickup?: boolean }) {
  const subtotal = data.lines.reduce((sum, line) => sum + line.price * line.qty, 0);
  const free = data.freeShippingThreshold > 0 && subtotal >= data.freeShippingThreshold;
  const shipping = opts?.pickup || data.lines.length === 0 || free ? 0 : data.shippingFee;
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
  const { data, dropped, setData } = useCart();

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
          <SummaryRows data={data} />
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
