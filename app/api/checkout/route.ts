import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { getLineIdentity, lineLoginEnabled } from "@/lib/line";
import { placeOrder } from "@/lib/orders";
import { parseCheckoutBody, resolveCheckoutIdentity } from "@/lib/checkout";
import { clientIp, sameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { grantReceipt } from "@/lib/receipt";

export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) {
    return NextResponse.json({ error: "無法送出訂單" }, { status: 403 });
  }
  const limit = rateLimit(`checkout:${clientIp(request.headers)}`, 8, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: "送出太頻繁，請稍後再試" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseCheckoutBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { settings } = await getStore();
  const session = await getLineIdentity();
  const identity = resolveCheckoutIdentity({
    loginRequired: lineLoginEnabled(settings),
    session,
    recipient: parsed.data.recipient,
    phone: parsed.data.phone,
  });
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });

  try {
    const result = await placeOrder({
      lines: parsed.data.items,
      recipient: parsed.data.recipient,
      phone: parsed.data.phone,
      address: parsed.data.address,
      fulfillment: parsed.data.fulfillment,
      pickupPointId: parsed.data.pickupPointId,
      note: parsed.data.note,
      idempotencyKey: parsed.data.idempotencyKey,
      identity: identity.identity,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    await grantReceipt(result.order.code);
    return NextResponse.json({ code: result.order.code });
  } catch {
    console.error("checkout failed");
    return NextResponse.json({ error: "系統忙碌，請稍後再試" }, { status: 500 });
  }
}
