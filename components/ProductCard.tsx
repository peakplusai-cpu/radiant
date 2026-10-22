import Link from "next/link";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { isSoldOut, priceRange } from "@/lib/products";
import { ProductImage } from "./ProductImage";

export function ProductCard({ product, index }: { product: Product; index: number }) {
  const { min, max } = priceRange(product);
  const soldOut = isSoldOut(product);
  const onSale = product.comparePrice > min;
  return (
    <Link href={`/p/${product.id}`} className="card">
      <div className="frame">
        <ProductImage
          src={product.photos[0]}
          hex={product.variants[0]?.hex}
          alt={product.name}
          className="first"
        />
        {product.photos[1] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.photos[1]} alt="" className="second" loading="lazy" />
        )}
        {soldOut ? (
          <span className="tag out">SOLD OUT</span>
        ) : product.featured ? (
          <span className="tag">精選</span>
        ) : null}
      </div>
      <div className="card-body">
        <div className="card-meta">
          <span>{String(index + 1).padStart(2, "0")}</span>
          {product.sold > 0 && <span style={{ fontFamily: "var(--sans)", letterSpacing: "0.12em" }}>已售 {product.sold}</span>}
        </div>
        <h3>{product.name}</h3>
        <div className="card-price">
          <span>
            {formatPrice(min)}
            {max > min ? " 起" : ""}
          </span>
          {onSale && <s>{formatPrice(product.comparePrice)}</s>}
        </div>
        {product.variants.length > 1 && (
          <div className="swatches" aria-label="可選顏色">
            {product.variants.map((v) => (
              <span key={v.id} className="dot" title={v.color} style={{ background: v.hex }} />
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
