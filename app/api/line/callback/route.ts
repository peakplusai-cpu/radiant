import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { lineConfig, safeNext, setLineIdentity, siteOrigin, takeLineState } from "@/lib/line";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = await siteOrigin();
  const saved = await takeLineState();
  const next = safeNext(saved?.next);
  const fail = (reason: string) => NextResponse.redirect(new URL(`${next}${next.includes("?") ? "&" : "?"}line=${reason}`, origin));

  const code = url.searchParams.get("code");
  if (!saved || !code || url.searchParams.get("state") !== saved.state) return fail("state");

  const { settings } = await getStore();
  const cfg = lineConfig(settings);
  if (!cfg.loginId || !cfg.loginSecret) return fail("config");

  const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${origin}/api/line/callback`,
      client_id: cfg.loginId,
      client_secret: cfg.loginSecret,
    }),
  });
  if (!tokenRes.ok) return fail("token");
  const token = (await tokenRes.json()) as { access_token?: string };

  const profileRes = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!profileRes.ok) return fail("profile");
  const profile = (await profileRes.json()) as { userId?: string; displayName?: string };
  if (!profile.userId) return fail("profile");

  await setLineIdentity({ userId: profile.userId, name: profile.displayName ?? "" });
  return NextResponse.redirect(new URL(next, origin));
}
