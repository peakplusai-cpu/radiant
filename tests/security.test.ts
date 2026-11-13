import { describe, expect, it } from "vitest";
import { adminAccessDecision } from "@/lib/admin-access";
import { parseCheckoutBody, resolveCheckoutIdentity } from "@/lib/checkout";
import { securityHeaderPairs } from "@/lib/http";
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

  it("requires a verified LINE session when login is enabled", () => {
    expect(resolveCheckoutIdentity({ loginRequired: true, session: null, recipient: "王小明", phone: "0912345678" }).ok).toBe(false);
    const guest = resolveCheckoutIdentity({ loginRequired: false, session: null, recipient: "王小明", phone: "0912345678" });
    expect(guest.ok && guest.identity.verified).toBe(false);
    expect(guest.ok && guest.identity.lineUserId).toBe("");
    const signedIn = resolveCheckoutIdentity({
      loginRequired: true,
      session: { userId: "Ureal", name: "小明" },
      recipient: "王小明",
      phone: "0912345678",
    });
    expect(signedIn.ok && signedIn.identity).toMatchObject({ lineUserId: "Ureal", verified: true, lineId: "" });
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
    expect(headers.get("Content-Security-Policy")).toContain("https://*.supabase.co");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=");
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
