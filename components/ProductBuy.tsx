"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { addToCart } from "@/lib/cart-client";
import { ProductImage } from "./ProductImage";

export function ProductBuy({ product }: { product: Product }) {
  const firstAvailable = Math.max(0, product.variants.findIndex((v) => v.stock > 0));
  const [vIndex, setVIndex] = useState(firstAvailable);
  const [qty, setQty] = useState(1);
  const [photo, setPhoto] = useState(0);
  const [message, setMessage] = useState("");

  const variant = product.variants[vIndex];
  const price = variant.price ?? product.price;
  const soldOut = variant.stock <= 0;
  const onSale = product.comparePrice > price;
  const max = Math.max(1, Math.min(variant.stock, 99));
  const photos = useMemo(() => product.photos, [product.photos]);

  function pick(i: number) {
    setVIndex(i);
    setQty(1);
    setMessage("");
  }

  function add() {
    addToCart({ p: product.id, v: variant.id, q: qty }, variant.stock);
    setMessage(`已加入購物袋：${variant.color} × ${qty}`);
  }

  return (
    <div className="product">
      <div className="gallery">
        {photos.length > 1 && (
          <div className="thumbs">
            {photos.map((src, i) => (
              <button
                key={src}
                type="button"
                className={`thumb${i === photo ? " on" : ""}`}
                onClick={() => setPhoto(i)}
                aria-label={`第 ${i + 1} 張圖片`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" />
              </button>
            ))}
          </div>
        )}
        <div className="frame">
          <ProductImage src={photos[photo]} hex={variant.hex} alt={product.name} />
        </div>
      </div>

      <div className="info">
        {product.category && <span className="eyebrow">{product.category}</span>}
        <h1>{product.name}</h1>
        {product.subtitle && <p className="sub">{product.subtitle}</p>}

        <div className="price-line">
          <span>{formatPrice(price)}</span>
          {onSale && <s>{formatPrice(product.comparePrice)}</s>}
          {product.sold > 0 && <span className="sold">已售 {product.sold}</span>}
        </div>

        <div className="opt-label">
          <span>Color</span>
          <b>{variant.color}</b>
        </div>
        <div className="swatch-row" role="radiogroup" aria-label="顏色">
          {product.variants.map((v, i) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={i === vIndex}
              aria-label={`${v.color}${v.stock <= 0 ? "（售完）" : ""}`}
              title={v.color}
              className={`swatch${i === vIndex ? " on" : ""}${v.stock <= 0 ? " out" : ""}`}
              onClick={() => pick(i)}
            >
              <i style={{ background: v.hex }} />
            </button>
          ))}
        </div>

        <div className="opt-label">
          <span>Quantity</span>
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div className="qty">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={soldOut || qty <= 1} aria-label="減少">
              −
            </button>
            <span>{qty}</span>
            <button type="button" onClick={() => setQty((q) => Math.min(max, q + 1))} disabled={soldOut || qty >= max} aria-label="增加">
              +
            </button>
          </div>
          <span className="stock-note">
            {soldOut ? "此顏色已售完" : variant.stock <= 5 ? `僅剩 ${variant.stock} 件` : `庫存 ${variant.stock} 件`}
          </span>
        </div>

        <div className="buy">
          <button type="button" className="btn" disabled={soldOut} onClick={add}>
            加入購物袋
          </button>
          <Link
            href="/checkout"
            className="btn solid"
            aria-disabled={soldOut}
            onClick={(e) => {
              if (soldOut) {
                e.preventDefault();
                return;
              }
              addToCart({ p: product.id, v: variant.id, q: qty }, variant.stock);
            }}
          >
            立即結帳
          </Link>
        </div>
        <div className="added" role="status">
          {message}
          {message && (
            <>
              {" "}
              <Link href="/cart" className="link">
                查看購物袋
              </Link>
            </>
          )}
        </div>

        {product.description && <p className="desc">{product.description}</p>}

        {product.details.length > 0 && (
          <dl className="specs">
            {product.details.map((d) => (
              <div key={d.label}>
                <dt>{d.label}</dt>
                <dd>{d.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
