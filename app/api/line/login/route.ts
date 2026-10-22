import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { lineConfig, lineLoginEnabled, safeNext, setLineState, siteOrigin } from "@/lib/line";

export async function GET(request: Request) {
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
