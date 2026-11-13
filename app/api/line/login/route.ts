import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { lineConfig, lineLoginEnabled, safeNext, setLineState, siteOrigin } from "@/lib/line";
import { clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const limit = rateLimit(`line-login:${clientIp(request.headers)}`, 20, 10 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: "請稍後再試" }, { status: 429 });
  const { settings } = await getStore();
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const origin = await siteOrigin();
  if (!lineLoginEnabled(settings)) {
    return NextResponse.redirect(new URL(next, origin));
  }
  const state = randomBytes(16).toString("hex");
  await setLineState(state, next);
  const authorize = new URL("https://access.line.me/oauth2/v2.1/authorize");
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", lineConfig(settings).loginId);
  authorize.searchParams.set("redirect_uri", `${origin}/api/line/callback`);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("scope", "profile openid");
  authorize.searchParams.set("bot_prompt", "normal");
  return NextResponse.redirect(authorize);
}
