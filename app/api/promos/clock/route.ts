import { NextResponse } from "next/server";
import { clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Server clock for countdown offset. Cached pages must not be the time source. */
export async function GET(request: Request) {
  const limit = rateLimit(`clock:${clientIp(request.headers)}`, 120, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "請稍後再試" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter), "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
