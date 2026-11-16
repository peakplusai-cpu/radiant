import { newebpayConfig, parsePaymentNotice } from "@/lib/newebpay";
import { applyPaymentNotice } from "@/lib/orders";

/** NewebPay server-to-server notice. Nothing here trusts the browser. */
export async function POST(request: Request) {
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
