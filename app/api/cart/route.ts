import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { variantPrice } from "@/lib/products";

type Entry = { p: string; v: string; q: number };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { items?: Entry[] };
  const entries = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  const { products, settings } = await getStore();

  const lines = entries.flatMap((entry) => {
    const product = products.find((p) => p.id === entry.p && p.status === "listed");
    const variant = product?.variants.find((v) => v.id === entry.v);
    if (!product || !variant) return [];
    return [
      {
        productId: product.id,
        variantId: variant.id,
        name: product.name,
        color: variant.color,
        hex: variant.hex,
        photo: product.photos[0] ?? "",
        price: variantPrice(product, variant),
        stock: Math.max(0, variant.stock),
        qty: Math.max(1, Math.floor(Number(entry.q) || 1)),
      },
    ];
  });

  return NextResponse.json({
    lines,
    shippingFee: settings.shippingFee,
    freeShippingThreshold: settings.freeShippingThreshold,
  });
}
