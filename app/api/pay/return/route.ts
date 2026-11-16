import { NextResponse } from "next/server";
import { newebpayConfig, parsePaymentNotice } from "@/lib/newebpay";
import { applyPaymentNotice } from "@/lib/orders";

function back(request: Request, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * Browser comes back from NewebPay with a POST. The payload is verified the same
 * way as the server notice, so a forged form cannot mark an order paid.
 */
export async function POST(request: Request) {
  const config = newebpayConfig();
  const form = await request.formData().catch(() => null);
  if (!config || !form) return back(request, "/");
  const parsed = parsePaymentNotice(config, form);
  if (!parsed.ok) return back(request, "/");
  const { notice } = parsed;
  try {
    const outcome = await applyPaymentNotice(notice);
    if (outcome.kind === "ignored") return back(request, "/");
    const state = notice.success ? (outcome.kind === "refund" || outcome.kind === "mismatch" ? "check" : "ok") : "failed";
    return back(request, `/order/${encodeURIComponent(notice.code)}?pay=${state}`);
  } catch {
    return back(request, `/order/${encodeURIComponent(notice.code)}?pay=check`);
  }
}
