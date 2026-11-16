import Link from "next/link";
import type { Product } from "@/lib/types";
import type { DisplayDeal } from "@/lib/promos";
import { formatPrice } from "@/lib/format";
import { isSoldOut, priceRange } from "@/lib/products";
import { groupVariants } from "@/lib/variants";
import { ProductImage } from "./ProductImage";

export function ProductCard({ product, index, deal }: { product: Product; index: number; deal?: DisplayDeal | null }) {
  const { min, max } = priceRange(product);
  const soldOut = isSoldOut(product);
  const colors = groupVariants(product.variants);
  const discounted = Boolean(deal && deal.min < min);
  const showMin = discounted && deal ? deal.min : min;
  const showMax = discounted && deal ? deal.max : max;
  const strike = discounted && deal ? deal.compare : product.comparePrice > min ? product.comparePrice : 0;
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
        ) : deal ? (
          <span className="tag">{deal.badge}</span>
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
            {formatPrice(showMin)}
            {showMax > showMin ? " 起" : ""}
          </span>
          {strike > showMin && <s>{formatPrice(strike)}</s>}
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
