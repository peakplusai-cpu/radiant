export function contentSecurityPolicy(dev: boolean): string {
  const script = dev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'";
  const connect = dev
    ? "connect-src 'self' ws: wss: https://*.supabase.co https://api.line.me https://access.line.me"
    : "connect-src 'self' https://*.supabase.co https://api.line.me https://access.line.me";
  return [
    "default-src 'self'",
    script,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self'",
    connect,
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function securityHeaderPairs(dev = process.env.NODE_ENV !== "production"): [string, string][] {
  const pairs: [string, string][] = [
    ["Content-Security-Policy", contentSecurityPolicy(dev)],
    ["X-Frame-Options", "DENY"],
    ["X-Content-Type-Options", "nosniff"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"],
    ["X-DNS-Prefetch-Control", "off"],
    ["X-Permitted-Cross-Domain-Policies", "none"],
    ["Cross-Origin-Opener-Policy", "same-origin"],
    ["Cross-Origin-Resource-Policy", "same-site"],
  ];
  if (!dev) pairs.push(["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"]);
  return pairs;
}

export function applySecurityHeaders(headers: Headers, dev = process.env.NODE_ENV !== "production"): void {
  for (const [key, value] of securityHeaderPairs(dev)) headers.set(key, value);
}

export function clientIp(headerList: { get(name: string): string | null }): string {
  const forwarded = headerList.get("x-forwarded-for");
  const raw = (forwarded ? forwarded.split(",")[0] : headerList.get("x-real-ip")) ?? "unknown";
  return raw.trim().slice(0, 64) || "unknown";
}

/**
 * State-changing requests must come from this host. Origin is set by the browser
 * and cannot be overridden by the page that is trying to forge the request.
 */
export function sameOrigin(headerList: { get(name: string): string | null }): boolean {
  const origin = headerList.get("origin");
  const host = (headerList.get("host") ?? "").split(",")[0]?.trim();
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
