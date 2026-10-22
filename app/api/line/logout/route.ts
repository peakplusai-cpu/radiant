import { NextResponse } from "next/server";
import { clearLineIdentity, safeNext, siteOrigin } from "@/lib/line";

export async function GET(request: Request) {
  await clearLineIdentity();
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  return NextResponse.redirect(new URL(next, await siteOrigin()));
}
