import Link from "next/link";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { isSoldOut, priceRange } from "@/lib/products";
import { groupVariants } from "@/lib/variants";
import { ProductImage } from "./ProductImage";

export function ProductCard({ product, index }: { product: Product; index: number }) {
  const { min, max } = priceRange(product);
  const soldOut = isSoldOut(product);
  const colors = groupVariants(product.variants);
  const onSale = product.comparePrice > min;
  return (
    <Link href={`/p/${product.id}`} className="card">
      <div className="frame">
        <ProductImage
          src={product.photos[0]}
          hex={colors[0]?.hex}
          alt={product.name}
          className="first"
          sizes="(max-width: 700px) 50vw, 25vw"
          priority={index === 0}
        />
        {product.photos[1] && (
          <ProductImage src={product.photos[1]} alt="" className="second" sizes="(max-width: 700px) 50vw, 25vw" />
        )}
        {soldOut ? (
          <span className="tag out">已售完</span>
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
        {colors.length > 0 && (
          <div className="swatches" aria-label="可選顏色">
            {colors.map((color) => (
              <span key={color.color} className="dot" title={color.color} style={{ background: color.hex }} />
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
