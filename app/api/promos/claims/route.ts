import { NextResponse } from "next/server";
import { getLineIdentity } from "@/lib/line";
import { clientIp } from "@/lib/http";
import { claimedIdsFor, validGuestToken } from "@/lib/promos";
import { rateLimit } from "@/lib/rate-limit";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limit = rateLimit(`claims:${clientIp(request.headers)}`, 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "請稍後再試" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter), "Cache-Control": "no-store" } });
  }
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const guestToken = validGuestToken(token) ? token : "";
  const session = await getLineIdentity();
  const { promoClaims } = await getStore();
  const ids = [...claimedIdsFor(promoClaims, guestToken, session?.userId ?? "")];
  return NextResponse.json({ ids, serverNow: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
