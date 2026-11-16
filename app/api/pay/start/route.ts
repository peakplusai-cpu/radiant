import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { beginPayment } from "@/lib/orders";
import { buildCheckoutPayload, newebpayConfig } from "@/lib/newebpay";
import { canViewOrder } from "@/lib/order-access";
import { clientIp, sameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return NextResponse.json({ error: "無法開始付款" }, { status: 403 });
  const limit = rateLimit(`pay:${clientIp(request.headers)}`, 20, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: "操作太頻繁，請稍後再試" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }
  const config = newebpayConfig();
  if (!config) return NextResponse.json({ error: "線上付款尚未開通" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { code?: unknown; token?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.slice(0, 40) : "";
  const token = typeof body?.token === "string" ? body.token.slice(0, 80) : undefined;
  const { orders, customers } = await getStore();
  const existing = orders.find((order) => order.code === code);
  if (!existing || !(await canViewOrder(existing, customers, token))) {
    return NextResponse.json({ error: "找不到訂單" }, { status: 404 });
  }

  const started = await beginPayment(code);
  if (!started.ok) return NextResponse.json({ error: started.error }, { status: started.status });
  try {
    return NextResponse.json(buildCheckoutPayload(config, started.order, started.attempt), { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("payment payload failed");
    return NextResponse.json({ error: "付款設定有誤，請聯絡店家" }, { status: 500 });
  }
}
