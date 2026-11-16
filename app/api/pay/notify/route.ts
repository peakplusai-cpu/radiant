import { newebpayConfig, parsePaymentNotice } from "@/lib/newebpay";
import { applyPaymentNotice } from "@/lib/orders";
import { clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

/**
 * NewebPay server-to-server notice. This is the only path that marks an order paid.
 * The body is authenticated with TradeSha; there is no browser session.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`notify:${clientIp(request.headers)}`, 120, 10 * 60 * 1000);
  if (!limit.ok) return new Response("retry", { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const config = newebpayConfig();
  if (!config) return new Response("not configured", { status: 503 });
  const form = await request.formData().catch(() => null);
  if (!form) return new Response("bad request", { status: 400 });
  const parsed = parsePaymentNotice(config, form);
  if (!parsed.ok) {
    console.error(`newebpay notify rejected: ${parsed.reason}`);
    return new Response("invalid", { status: 400 });
  }
  try {
    await applyPaymentNotice(parsed.notice);
  } catch {
    console.error("newebpay notify failed");
    return new Response("retry", { status: 500 });
  }
  return new Response("OK", { status: 200 });
}
