import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { variantPrice } from "@/lib/products";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, sameOrigin } from "@/lib/http";

type Entry = { p: string; v: string; q: number };

export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return NextResponse.json({ error: "無法讀取購物袋" }, { status: 403 });
  const limit = rateLimit(`cart:${clientIp(request.headers)}`, 60, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "請稍後再試" }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { items?: Entry[] };
  const entries = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  const { products, settings } = await getStore();

  const lines = entries.flatMap((entry) => {
    const product = products.find((item) => item.id === entry.p && item.status === "listed");
    const variant = product?.variants.find((item) => item.id === entry.v);
    if (!product || !variant) return [];
    const qty = Math.floor(Number(entry.q) || 1);
    return [
      {
        productId: product.id,
        variantId: variant.id,
        name: product.name,
        color: variant.color,
        size: variant.size,
        hex: variant.hex,
        photo: product.photos[0] ?? "",
        price: variantPrice(product, variant),
        stock: Math.max(0, variant.stock),
        qty: Math.max(1, Math.min(99, qty)),
      },
    ];
  });

  return NextResponse.json({
    lines,
    shippingFee: settings.shippingFee,
    freeShippingThreshold: settings.freeShippingThreshold,
  });
}
