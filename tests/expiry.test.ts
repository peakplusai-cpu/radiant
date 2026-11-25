import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CheckoutInput } from "@/lib/orders";
import type { PaymentNotice } from "@/lib/newebpay";
import type { Promotion } from "@/lib/types";

const dir = mkdtempSync(join(tmpdir(), "radiant-expiry-"));
process.env.RADIANT_DATA_FILE = join(dir, "store.json");

const USER = `U${"d".repeat(32)}`;
let counter = 0;
const calls: string[] = [];

const input = (patch: Partial<CheckoutInput> = {}): CheckoutInput => {
  counter += 1;
  const phone = `09${String(10000000 + counter)}`;
  return {
    lines: [{ productId: "prd_1", variantId: "var_m", qty: 1 }],
    recipient: "王小明",
    phone,
    email: `expire${counter}@example.com`,
    address: "台北市中山區南京東路一段1號",
    fulfillment: "delivery",
    payment: "online",
    pickupPointId: "",
    note: "",
    idempotencyKey: `exp-${counter}-${Math.random().toString(36).slice(2, 8)}`,
    identity: { lineUserId: "", lineName: "王小明", lineId: "", verified: false, phone },
    shownPromoIds: ["prm_sale"],
    ...patch,
  };
};

function promo(): Promotion {
  const now = Date.now();
  return {
    id: "prm_sale",
    name: "週年慶",
    banner: "",
    enabled: true,
    scope: "site",
    productId: "",
    category: "",
    kind: "amount",
    value: 50,
    minSpend: 0,
    maxDiscount: 0,
    freeShipping: false,
    startsAt: new Date(now - 60_000).toISOString(),
    endsAt: new Date(now + 3_600_000).toISOString(),
    usageLimit: 5,
    used: 0,
    perCustomer: 0,
    requiresClaim: false,
    couponCode: "",
    stacking: "best",
    priority: 0,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
}

const notice = (code: string, amt: number, patch: Partial<PaymentNotice> = {}): PaymentNotice => ({
  success: true,
  status: "SUCCESS",
  message: "",
  code,
  merchantOrderNo: `${code}_1`,
  tradeNo: "LATE1",
  amt,
  paymentType: "CREDIT",
  wallet: "",
  payTime: "2026-11-16 22:00:00",
  bankCode: "",
  codeNo: "",
  expireDate: "",
  store: null,
  ...patch,
});

describe("lazy expiry and late payment", () => {
  beforeAll(async () => {
    const { mutate } = await import("@/lib/store");
    await mutate((store) => {
      store.settings.messagingToken = "token";
      store.settings.notifyTo = USER;
      store.promotions.push(promo());
      store.products.push({
        id: "prd_1",
        name: "測試上衣",
        subtitle: "",
        category: "上衣",
        categories: [],
        description: "",
        details: [],
        price: 500,
        comparePrice: 0,
        variants: [
          { id: "var_m", color: "藍", size: "M", hex: "#3d5f8a", sku: "", stock: 5, price: null },
          { id: "var_l", color: "藍", size: "L", hex: "#3d5f8a", sku: "", stock: 1, price: null },
        ],
        photos: [],
        status: "listed",
        featured: false,
        sold: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
  });

  afterEach(() => {
    calls.length = 0;
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function mockFetch() {
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      calls.push(String(init?.body ?? ""));
      return new Response("{}", { status: 200 });
    });
  }

  it("replaces the stored LINE payment sentence on read", async () => {
    const { getStore, mutate } = await import("@/lib/store");
    await mutate((store) => {
      store.settings.paymentNote = "送出訂單後，我們會透過 LINE 與您確認並提供付款方式。";
    });
    const note = (await getStore()).settings.paymentNote;
    expect(note).not.toContain("透過 LINE 與您確認並提供付款方式");
    expect(note).toContain("藍新金流");
  });

  it("restores stock and promo usage once when an overdue order is read", async () => {
    mockFetch();
    const { placeOrder, beginPayment, releaseExpiredHolds } = await import("@/lib/orders");
    const { getStore, mutate } = await import("@/lib/store");
    const placed = await placeOrder(input());
    if (!placed.ok) throw new Error(placed.error);
    expect((await beginPayment(placed.order.code)).ok).toBe(true);
    expect((await getStore()).products[0]?.variants.find((item) => item.id === "var_m")?.stock).toBe(4);
    expect((await getStore()).promotions.find((item) => item.id === "prm_sale")?.used).toBe(1);

    await mutate((store) => {
      const order = store.orders.find((item) => item.code === placed.order.code);
      if (order) order.holdUntil = new Date(Date.now() - 60_000).toISOString();
    });
    calls.length = 0;
    expect(await releaseExpiredHolds()).toBe(1);
    expect(await releaseExpiredHolds()).toBe(0);

    const saved = await getStore();
    const order = saved.orders.find((item) => item.code === placed.order.code);
    expect(order?.status).toBe("cancelled");
    expect(saved.products[0]?.variants.find((item) => item.id === "var_m")?.stock).toBe(5);
    expect(saved.promotions.find((item) => item.id === "prm_sale")?.used).toBe(0);
    expect(saved.promoUses.filter((use) => use.orderId === placed.order.id && !use.restored)).toHaveLength(0);
    expect(calls.filter((body) => body.includes("已自動取消"))).toHaveLength(1);
    expect(calls.join("\n")).toMatch(/09\d{2}\*\*\*\d{3}/);
    expect(calls.join("\n")).not.toContain(placed.order.phone);
  });

  it("re-reserves a still-pending expired order when payment arrives, without deducting twice", async () => {
    mockFetch();
    const { placeOrder, beginPayment, applyPaymentNotice } = await import("@/lib/orders");
    const { getStore, mutate } = await import("@/lib/store");
    await mutate((store) => {
      const variant = store.products[0]?.variants.find((item) => item.id === "var_m");
      if (variant) variant.stock = 20;
    });
    const placed = await placeOrder(input({ shownPromoIds: [] }));
    if (!placed.ok) throw new Error(placed.error);
    expect((await beginPayment(placed.order.code)).ok).toBe(true);
    await mutate((store) => {
      const order = store.orders.find((item) => item.code === placed.order.code);
      if (order) order.holdUntil = new Date(Date.now() - 1000).toISOString();
    });
    const outcome = await applyPaymentNotice(notice(placed.order.code, placed.order.total));
    expect(outcome).toMatchObject({ kind: "confirmed", revived: true });
    const saved = await getStore();
    expect(saved.orders.find((item) => item.code === placed.order.code)?.status).toBe("paid");
    expect(saved.products[0]?.variants.find((item) => item.id === "var_m")?.stock).toBe(19);
    expect(calls.filter((body) => body.includes("已自動取消"))).toHaveLength(0);
    expect(calls.filter((body) => body.includes("已付款"))).toHaveLength(1);
  });

  it("marks a late payment for attention when the stock was taken, and does not deduct again", async () => {
    mockFetch();
    const { placeOrder, beginPayment, releaseExpiredHolds, applyPaymentNotice } = await import("@/lib/orders");
    const { getStore, mutate } = await import("@/lib/store");
    await mutate((store) => {
      const variant = store.products[0]?.variants.find((item) => item.id === "var_l");
      if (variant) variant.stock = 1;
    });
    const placed = await placeOrder(input({ lines: [{ productId: "prd_1", variantId: "var_l", qty: 1 }], shownPromoIds: [] }));
    if (!placed.ok) throw new Error(placed.error);
    expect((await beginPayment(placed.order.code)).ok).toBe(true);
    await mutate((store) => {
      const order = store.orders.find((item) => item.code === placed.order.code);
      if (order) order.holdUntil = new Date(Date.now() - 1000).toISOString();
    });
    expect(await releaseExpiredHolds()).toBe(1);
    const taken = await placeOrder(input({ lines: [{ productId: "prd_1", variantId: "var_l", qty: 1 }], shownPromoIds: [] }));
    expect(taken.ok).toBe(true);
    calls.length = 0;
    const outcome = await applyPaymentNotice(notice(placed.order.code, placed.order.total, { tradeNo: "LATE2" }));
    expect(outcome.kind).toBe("refund");
    const saved = await getStore();
    const order = saved.orders.find((item) => item.code === placed.order.code);
    expect(order?.status).toBe("cancelled");
    expect(order?.paidAt).not.toBe("");
    expect(order?.internalNote).toContain("待人工處理");
    expect(order?.internalNote).toContain("退款");
    expect(saved.products[0]?.variants.find((item) => item.id === "var_l")?.stock).toBe(0);
    expect(calls.some((body) => body.includes("需人工處理"))).toBe(true);
    expect(calls.join("\n")).not.toContain(placed.order.phone);
  });
});
