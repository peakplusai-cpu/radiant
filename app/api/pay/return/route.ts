import { NextResponse } from "next/server";
import { isVoucherNotice, newebpayConfig, parsePaymentNotice } from "@/lib/newebpay";
import { clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

function back(request: Request, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * The browser returns here from NewebPay. The payload is verified so a forged
 * form cannot show a success banner, but this route never marks an order paid.
 * Only /api/pay/notify does that.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`return:${clientIp(request.headers)}`, 30, 10 * 60 * 1000);
  if (!limit.ok) return back(request, "/");
  const config = newebpayConfig();
  const form = await request.formData().catch(() => null);
  if (!config || !form) return back(request, "/");
  const parsed = parsePaymentNotice(config, form);
  if (!parsed.ok || !/^[A-Za-z0-9]{4,24}$/.test(parsed.notice.code)) return back(request, "/");
  const { notice } = parsed;
  const state = !notice.success ? "failed" : isVoucherNotice(notice) ? "number" : "returned";
  return back(request, `/order/${notice.code}?pay=${state}`);
}
