import { NextResponse } from "next/server";
import { readSettledStore } from "@/lib/orders";
import { cleanEmail, normalizeTaiwanMobile } from "@/lib/phone";
import { safeEqual } from "@/lib/session-token";
import { clientIp, sameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { grantReceipt } from "@/lib/receipt";

const MISSING = { error: "找不到符合的訂單，請核對訂單編號、手機與 Email" };

/**
 * Guest lookup. Requires the order code plus the phone and email stored on that
 * order. A match sets the same httpOnly receipt cookie as checkout; the token
 * is not returned in the body.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return NextResponse.json({ error: "無法查詢訂單" }, { status: 403 });
  const ipLimit = rateLimit(`lookup:${clientIp(request.headers)}`, 5, 15 * 60 * 1000);
  if (!ipLimit.ok) {
    return NextResponse.json({ error: "查詢太頻繁，請稍後再試" }, { status: 429, headers: { "Retry-After": String(ipLimit.retryAfter) } });
  }

  const body = (await request.json().catch(() => null)) as { code?: unknown; phone?: unknown; email?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  const phone = typeof body?.phone === "string" ? normalizeTaiwanMobile(body.phone) : null;
  const email = typeof body?.email === "string" ? cleanEmail(body.email) : null;
  if (!/^RD\d{10}$/.test(code) || !phone || !email) {
    return NextResponse.json(MISSING, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const codeLimit = rateLimit(`lookup-code:${code}`, 8, 60 * 60 * 1000);
  if (!codeLimit.ok) {
    return NextResponse.json({ error: "查詢太頻繁，請稍後再試" }, { status: 429, headers: { "Retry-After": String(codeLimit.retryAfter) } });
  }

  const { orders } = await readSettledStore();
  const order = orders.find((item) => item.code === code);
  const phoneOk = safeEqual(order?.phone ?? "", phone);
  const emailOk = safeEqual((order?.email ?? "").toLowerCase(), email);
  if (!order?.email || !phoneOk || !emailOk) {
    return NextResponse.json(MISSING, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  await grantReceipt(order.code);
  return NextResponse.json({ ok: true, code: order.code }, { headers: { "Cache-Control": "no-store" } });
}
