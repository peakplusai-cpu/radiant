import { describe, expect, it } from "vitest";
import { adminAccessDecision } from "@/lib/admin-access";
import { parseCheckoutBody, resolveCheckoutIdentity } from "@/lib/checkout";
import { securityHeaderPairs } from "@/lib/http";
import { SUPABASE_PROJECT_HOST, supabaseStorageHost } from "@/lib/supabase-host";
import { hashPassword, verifyPassword } from "@/lib/password";
import { safeEqual, sign, verifyAdminToken } from "@/lib/session-token";
import { safeNext } from "@/lib/line";
import { canTransition } from "@/lib/order-flow";
import { bump, addEntry } from "@/lib/cart";
import { normalizeTaiwanPhone } from "@/lib/phone";
import { totpCode, verifyTotp } from "@/lib/totp";

describe("admin gate", () => {
  const secret = "test-secret";
  const token = `9999999999999.abc.${sign(secret, "9999999999999.abc")}`;

  it("sends anonymous admin requests to login once an admin exists", () => {
    expect(adminAccessDecision({ pathname: "/admin/orders", token: undefined, secret, hasAdmin: true })).toBe("login");
    expect(adminAccessDecision({ pathname: "/admin", token: "bad", secret, hasAdmin: true })).toBe("login");
    expect(adminAccessDecision({ pathname: "/admin/orders", token, secret, hasAdmin: true })).toBe("allow");
    expect(adminAccessDecision({ pathname: "/admin/setup", token: undefined, secret, hasAdmin: true })).toBe("login");
    expect(adminAccessDecision({ pathname: "/admin/login", token, secret, hasAdmin: true })).toBe("desk");
  });

  it("checks the signature in constant length", () => {
    expect(verifyAdminToken(token, secret, 1)).toBe(true);
    expect(verifyAdminToken(token, "other", 1)).toBe(false);
    expect(safeEqual("a", "ab")).toBe(false);
  });
});

describe("checkout validation", () => {
  const good = {
    items: [{ productId: "prd_1", variantId: "var_1", qty: 1 }],
    recipient: "王小明",
    phone: "0912-345-678",
    email: "guest@example.com",
    address: "台北市中山區南京東路一段1號",
    note: "",
    fulfillment: "delivery",
    pickupPointId: "",
    idempotencyKey: "abc12345",
  };

  it("normalizes Taiwan phones and rejects client totals and LINE ids", () => {
    expect(normalizeTaiwanPhone("+886912345678")).toBe("0912345678");
    expect(normalizeTaiwanPhone("02-12345678")).toBe("0212345678");
    expect(normalizeTaiwanPhone("12345")).toBeNull();
    const parsed = parseCheckoutBody({ ...good, total: 1, lineId: "victim", lineUserId: "Uxxx" });
    expect(parsed.ok).toBe(false);
    const ok = parseCheckoutBody(good);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data.phone).toBe("0912345678");
  });

  it("checks out as a guest even when LINE login exists, and attaches a session when one is present", () => {
    const guest = resolveCheckoutIdentity({ session: null, recipient: "王小明", phone: "0912345678" });
    expect(guest.identity.verified).toBe(false);
    expect(guest.identity.lineUserId).toBe("");
    const signedIn = resolveCheckoutIdentity({
      session: { userId: "Ureal", name: "小明" },
      recipient: "王小明",
      phone: "0912345678",
    });
    expect(signedIn.identity).toMatchObject({ lineUserId: "Ureal", verified: true, lineId: "" });
  });
});

describe("redirects, headers, passwords, cart", () => {
  it("blocks open redirects", () => {
    expect(safeNext("/checkout")).toBe("/checkout");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("/checkout?x=1")).toBe("/checkout?x=1");
  });

  it("sets the required security headers", () => {
    const headers = new Map(securityHeaderPairs(false));
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    const host = supabaseStorageHost();
    expect(headers.get("Content-Security-Policy")).toContain(`img-src 'self' data: blob: https://${host}`);
    expect(headers.get("Content-Security-Policy")).not.toContain("*.supabase.co");
    expect(headers.get("Content-Security-Policy")).toContain("form-action 'self' https://ccore.newebpay.com https://core.newebpay.com");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=");
  });

  it("pins image hosts to this project's Supabase hostname", () => {
    const prev = process.env.SUPABASE_URL;
    const prevPublic = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(supabaseStorageHost()).toBe(SUPABASE_PROJECT_HOST);
    process.env.SUPABASE_URL = "https://wgrwwuyxhdyakchuiubi.supabase.co";
    expect(supabaseStorageHost()).toBe("wgrwwuyxhdyakchuiubi.supabase.co");
    process.env.SUPABASE_URL = "https://other-project.supabase.co/rest/v1";
    expect(supabaseStorageHost()).toBe("other-project.supabase.co");
    if (prev === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prev;
    if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevPublic;
  });

  it("hashes passwords and serializes cart clicks", () => {
    const hash = hashPassword("correct horse");
    expect(verifyPassword("correct horse", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
    let items = addEntry([], { p: "p", v: "v", q: 1 }, 10);
    items = bump(items, "p", "v", 1, 10);
    items = bump(items, "p", "v", 1, 10);
    expect(items[0].q).toBe(3);
  });

  it("only allows forward order statuses and restores the totp code", () => {
    expect(canTransition("pending", "paid")).toBe(true);
    expect(canTransition("pending", "completed")).toBe(false);
    expect(canTransition("completed", "cancelled")).toBe(false);
    expect(canTransition("shipped", "cancelled")).toBe(true);
    const secret = "JBSWY3DPEHPK3PXP";
    expect(verifyTotp(secret, totpCode(secret))).toBe(true);
    expect(verifyTotp(secret, "000000")).toBe(totpCode(secret) === "000000");
  });
});
