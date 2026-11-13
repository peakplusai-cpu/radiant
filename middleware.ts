import { NextResponse, type NextRequest } from "next/server";
import { adminAccessDecision } from "@/lib/admin-access";
import { ADMIN_COOKIE } from "@/lib/cookie-flags";
import { applySecurityHeaders } from "@/lib/http";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

function emptyRedirect(request: NextRequest, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: url.toString(), "Cache-Control": "no-store" },
  });
  applySecurityHeaders(response.headers);
  return response;
}

function httpsRedirect(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV !== "production") return null;
  const host = (request.headers.get("host") ?? "").split(",")[0]?.trim() ?? "";
  if (!host || host.startsWith("localhost") || host.startsWith("127.0.0.1")) return null;
  if (request.headers.get("x-forwarded-proto") !== "http") return null;
  const url = request.nextUrl.clone();
  url.protocol = "https:";
  const response = new NextResponse(null, {
    status: 308,
    headers: { Location: url.toString(), "Cache-Control": "no-store" },
  });
  applySecurityHeaders(response.headers);
  return response;
}

export async function middleware(request: NextRequest) {
  const https = httpsRedirect(request);
  if (https) return https;

  const { pathname } = request.nextUrl;
  const adminish = pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/api/upload";
  if (!adminish) {
    const response = NextResponse.next();
    applySecurityHeaders(response.headers);
    return response;
  }

  const store = await getStore();
  const decision = adminAccessDecision({
    pathname: pathname === "/api/upload" ? "/admin/upload" : pathname,
    token: request.cookies.get(ADMIN_COOKIE)?.value,
    secret: store.settings.secret,
    hasAdmin: Boolean(store.admin),
  });

  if (pathname === "/api/upload" && decision !== "allow") {
    const response = NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    applySecurityHeaders(response.headers);
    return response;
  }
  if (decision === "login") return emptyRedirect(request, "/admin/login");
  if (decision === "setup") return emptyRedirect(request, "/admin/setup");
  if (decision === "desk") return emptyRedirect(request, "/admin");

  const response = NextResponse.next();
  applySecurityHeaders(response.headers);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"],
};
