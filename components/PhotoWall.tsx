import Link from "next/link";
import type { Product, WallPhoto } from "@/lib/types";
import { ProductImage } from "./ProductImage";

function frame(photo: WallPhoto, products: Product[], key: string) {
  const product = photo.productId ? products.find((p) => p.id === photo.productId) : undefined;
  const listed = product?.status === "listed";
  const alt = product?.name || "";
  const inner = <ProductImage src={photo.src} alt={alt} sizes="240px" />;
  if (listed && product) {
    return (
      <Link key={key} href={`/p/${product.id}`} className="wall-item">
        {inner}
      </Link>
    );
  }
  return (
    <div key={key} className="wall-item">
      {inner}
    </div>
  );
}

export function PhotoWall({ photos, products }: { photos: WallPhoto[]; products: Product[] }) {
  if (!photos.length) return null;
  const unit = [...photos];
  while (unit.length < 6) unit.push(...photos);
  const seconds = Math.max(24, unit.length * 7);
  return (
    <section className="wall" aria-label="商品動態牆" style={{ ["--wall-duration" as string]: `${seconds}s` }}>
      <div className="wall-viewport">
        <div className="wall-track">
          <div className="wall-set">{unit.map((p, i) => frame(p, products, `${p.id}-${i}`))}</div>
          <div className="wall-set" aria-hidden="true">
            {unit.map((p, i) => frame(p, products, `${p.id}-dup-${i}`))}
          </div>
        </div>
      </div>
    </section>
  );
}
