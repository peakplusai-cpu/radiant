import { NextResponse } from "next/server";
import { readSettledStore } from "@/lib/orders";
import { variantPrice } from "@/lib/products";
import { effectiveCategories } from "@/lib/categories";
import { getLineIdentity } from "@/lib/line";
import { cleanEmail, normalizeTaiwanMobile } from "@/lib/phone";
import { quoteCart, validGuestToken } from "@/lib/promos";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, sameOrigin } from "@/lib/http";
import type { Fulfillment } from "@/lib/types";

type Entry = { p: string; v: string; q: number };

export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return NextResponse.json({ error: "無法讀取購物袋" }, { status: 403 });
  const limit = rateLimit(`cart:${clientIp(request.headers)}`, 60, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "請稍後再試" }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as {
    items?: Entry[];
    fulfillment?: string;
    coupon?: string;
    guestToken?: string;
    phone?: string;
    email?: string;
  };
  const coupon = typeof body.coupon === "string" ? body.coupon.trim().slice(0, 40) : "";
  if (coupon) {
    const couponLimit = rateLimit(`coupon:${clientIp(request.headers)}`, 10, 10 * 60 * 1000);
    if (!couponLimit.ok) {
      return NextResponse.json(
        { error: "優惠代碼嘗試太頻繁，請稍後再試" },
        { status: 429, headers: { "Retry-After": String(couponLimit.retryAfter), "Cache-Control": "no-store" } }
      );
    }
  }

  const entries = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  const fulfillment: Fulfillment = body.fulfillment === "pickup" || body.fulfillment === "cvs" ? body.fulfillment : "delivery";
  const { products, settings, promotions, promoUses, promoClaims } = await readSettledStore();
  const session = await getLineIdentity();

  const lines = entries.flatMap((entry) => {
    const product = products.find((item) => item.id === entry.p && item.status === "listed");
    const variant = product?.variants.find((item) => item.id === entry.v);
    if (!product || !variant) return [];
    const qty = Math.max(1, Math.min(99, Math.floor(Number(entry.q) || 1)));
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
        qty,
        categories: effectiveCategories(product),
      },
    ];
  });

  const quote = quoteCart(promotions, promoUses, promoClaims, {
    now: Date.now(),
    lines: lines.map((line) => ({ productId: line.productId, qty: line.qty, unitPrice: line.price, categories: line.categories })),
    fulfillment,
    settings,
    coupon,
    guestToken: typeof body.guestToken === "string" && validGuestToken(body.guestToken) ? body.guestToken : "",
    lineUserId: session?.userId ?? "",
    phone: normalizeTaiwanMobile(typeof body.phone === "string" ? body.phone : "") ?? "",
    email: cleanEmail(typeof body.email === "string" ? body.email : "") ?? "",
  });

  return NextResponse.json(
    {
      lines: lines.map(({ categories: _categories, ...line }) => line),
      shippingFee: settings.shippingFee,
      cvsShippingFee: settings.cvsShippingFee,
      freeShippingThreshold: settings.freeShippingThreshold,
      quote: {
        subtotal: quote.subtotal,
        discount: quote.discount,
        shipping: quote.shipping,
        total: quote.total,
        applied: quote.applied.map((item) => ({
          id: item.id,
          name: item.name,
          discount: item.discount,
          freeShipping: item.freeShipping,
          endsAt: item.endsAt,
        })),
        hints: quote.hints.map((hint) => ({ text: hint.text })),
        couponMessage: quote.couponMessage,
        serverNow: Date.now(),
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
