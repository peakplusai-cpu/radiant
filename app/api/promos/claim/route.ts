import { NextResponse } from "next/server";
import { getLineIdentity } from "@/lib/line";
import { uid } from "@/lib/id";
import { clientIp, sameOrigin } from "@/lib/http";
import { promoStatus, validGuestToken } from "@/lib/promos";
import { rateLimit } from "@/lib/rate-limit";
import { mutate } from "@/lib/store";

export async function POST(request: Request) {
  if (!sameOrigin(request.headers)) return NextResponse.json({ error: "無法領取" }, { status: 403 });
  const limit = rateLimit(`claim:${clientIp(request.headers)}`, 30, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: "領取太頻繁，請稍後再試" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter), "Cache-Control": "no-store" } });
  }

  const body = (await request.json().catch(() => null)) as { promoId?: unknown; guestToken?: unknown } | null;
  const promoId = typeof body?.promoId === "string" ? body.promoId.trim().slice(0, 80) : "";
  const guestToken = typeof body?.guestToken === "string" && validGuestToken(body.guestToken) ? body.guestToken : "";
  if (!promoId) return NextResponse.json({ error: "找不到優惠" }, { status: 400 });

  const session = await getLineIdentity();
  const lineUserId = session?.userId ?? "";
  if (!guestToken && !lineUserId) return NextResponse.json({ error: "請重新整理後再領取" }, { status: 400 });

  try {
    const result = await mutate((store) => {
      const promo = store.promotions.find((item) => item.id === promoId);
      if (!promo || !promo.enabled) return { ok: false as const, error: "此優惠已停用", status: 404 };
      const status = promoStatus(promo, Date.now());
      if (status === "ended") return { ok: false as const, error: "此優惠已結束", status: 410 };
      const used = store.promoUses.filter((item) => item.promoId === promo.id && !item.restored).length;
      if (promo.usageLimit > 0 && Math.max(used, promo.used) >= promo.usageLimit) {
        return { ok: false as const, error: "此優惠已額滿", status: 409 };
      }
      const existing = store.promoClaims.find(
        (item) => item.promoId === promo.id && ((guestToken && item.guestToken === guestToken) || (lineUserId && item.lineUserId === lineUserId))
      );
      if (existing) {
        if (guestToken && !existing.guestToken) existing.guestToken = guestToken;
        if (lineUserId && !existing.lineUserId) existing.lineUserId = lineUserId;
        return { ok: true as const };
      }
      store.promoClaims.push({
        id: uid("clm"),
        promoId: promo.id,
        guestToken,
        lineUserId,
        createdAt: new Date().toISOString(),
      });
      if (store.promoClaims.length > 5000) store.promoClaims = store.promoClaims.slice(-5000);
      return { ok: true as const };
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "系統忙碌，請稍後再試" }, { status: 500 });
  }
}
