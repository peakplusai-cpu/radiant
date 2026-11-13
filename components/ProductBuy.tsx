"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Product, Variant } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { addToCart } from "@/lib/cart-client";
import { groupVariants } from "@/lib/variants";
import { ProductImage } from "./ProductImage";

export function ProductBuy({ product }: { product: Product }) {
  const groups = useMemo(() => groupVariants(product.variants), [product.variants]);
  const firstColor = Math.max(0, groups.findIndex((group) => group.sizes.some((size) => size.stock > 0)));
  const [colorIndex, setColorIndex] = useState(firstColor === -1 ? 0 : firstColor);
  const group = groups[colorIndex] ?? groups[0];
  const needsSize = Boolean(group && group.sizes.some((size) => size.size));
  const onlySize = group?.sizes.length === 1 ? group.sizes[0] : undefined;
  const [sizeId, setSizeId] = useState(needsSize && !onlySize ? "" : (onlySize?.id ?? group?.sizes[0]?.id ?? ""));
  const variant: Variant | undefined = group?.sizes.find((size) => size.id === sizeId) ?? (!needsSize ? group?.sizes[0] : undefined);
  const [qty, setQty] = useState(1);
  const [photo, setPhoto] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const price = variant ? (variant.price ?? product.price) : product.price;
  const soldOut = !variant || variant.stock <= 0;
  const onSale = product.comparePrice > price;
  const max = Math.max(1, Math.min(variant?.stock ?? 1, 99));
  const photos = product.photos;

  function pickColor(index: number) {
    const next = groups[index];
    setColorIndex(index);
    const single = next.sizes.length === 1 ? next.sizes[0] : undefined;
    setSizeId(next.sizes.some((size) => size.size) && !single ? "" : (single?.id ?? next.sizes[0]?.id ?? ""));
    setQty(1);
    setMessage("");
    setError("");
  }

  function add() {
    if (!variant) {
      setError("請先選擇尺寸");
      return;
    }
    if (variant.stock <= 0) return;
    addToCart({ p: product.id, v: variant.id, q: qty }, variant.stock);
    const size = variant.size ? ` ${variant.size}` : "";
    setMessage(`已加入購物袋：${variant.color}${size} × ${qty}`);
    setError("");
  }

  if (!group) return null;

  return (
    <div className="product">
      <div className="gallery">
        {photos.length > 1 && (
          <div className="thumbs">
            {photos.map((src, i) => (
              <button key={src} type="button" className={`thumb${i === photo ? " on" : ""}`} onClick={() => setPhoto(i)} aria-label={`第 ${i + 1} 張圖片`}>
                <ProductImage src={src} hex={group.hex} alt="" sizes="76px" />
              </button>
            ))}
          </div>
        )}
        <div className="frame">
          <ProductImage src={photos[photo]} hex={group.hex} alt={product.name} sizes="(max-width: 768px) 100vw, 50vw" priority />
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
          <span>顏色</span>
          <b>{group.color}</b>
        </div>
        <div className="swatch-row" role="radiogroup" aria-label="顏色">
          {groups.map((item, index) => {
            const out = item.sizes.every((size) => size.stock <= 0);
            return (
              <button
                key={item.color}
                type="button"
                role="radio"
                aria-checked={index === colorIndex}
                aria-label={`${item.color}${out ? "（售完）" : ""}`}
                title={item.color}
                className={`swatch${index === colorIndex ? " on" : ""}${out ? " out" : ""}`}
                onClick={() => pickColor(index)}
              >
                <i style={{ background: item.hex }} />
              </button>
            );
          })}
        </div>

        {needsSize && (
          <>
            <div className="opt-label">
              <span>尺寸</span>
              <b>{variant?.size || "請選擇"}</b>
            </div>
            <div className="size-row" role="radiogroup" aria-label="尺寸">
              {group.sizes.map((size) => (
                <button
                  key={size.id}
                  type="button"
                  role="radio"
                  aria-checked={size.id === sizeId}
                  className={`size-btn${size.id === sizeId ? " on" : ""}${size.stock <= 0 ? " out" : ""}`}
                  disabled={size.stock <= 0}
                  onClick={() => {
                    setSizeId(size.id);
                    setQty(1);
                    setError("");
                  }}
                >
                  {size.size}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="opt-label">
          <span>數量</span>
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div className="qty">
            <button type="button" onClick={() => setQty((current) => Math.max(1, current - 1))} disabled={soldOut || qty <= 1} aria-label="減少">
              −
            </button>
            <span>{qty}</span>
            <button type="button" onClick={() => setQty((current) => Math.min(max, current + 1))} disabled={soldOut || qty >= max} aria-label="增加">
              +
            </button>
          </div>
          <span className="stock-note">
            {!variant ? "請先選擇尺寸" : soldOut ? "此款式已售完" : variant.stock <= 5 ? `僅剩 ${variant.stock} 件` : `庫存 ${variant.stock} 件`}
          </span>
        </div>

        <div className="buy">
          <button type="button" className="btn" disabled={soldOut} onClick={add}>
            加入購物袋
          </button>
          <Link
            href="/checkout"
            className={`btn solid${soldOut ? " is-disabled" : ""}`}
            aria-disabled={soldOut}
            onClick={(event) => {
              if (!variant || variant.stock <= 0) {
                event.preventDefault();
                setError(variant ? "此款式已售完" : "請先選擇尺寸");
                return;
              }
              addToCart({ p: product.id, v: variant.id, q: qty }, variant.stock);
            }}
          >
            立即結帳
          </Link>
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="added" role="status">
          {message}
          {message && (
            <>
              {" "}
              <Link href="/cart" className="link">查看購物袋</Link>
            </>
          )}
        </div>

        {product.description && <p className="desc">{product.description}</p>}

        {product.details.length > 0 && (
          <dl className="specs">
            {product.details.map((detail) => (
              <div key={detail.label}>
                <dt>{detail.label}</dt>
                <dd>{detail.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
