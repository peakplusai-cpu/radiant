import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aesDecrypt } from "@/lib/newebpay";
import { parseCheckoutBody } from "@/lib/checkout";
import type { CheckoutInput } from "@/lib/orders";
import type { Promotion } from "@/lib/types";

const dir = mkdtempSync(join(tmpdir(), "radiant-promo-"));
process.env.RADIANT_DATA_FILE = join(dir, "store.json");

const KEY = "12345678901234567890123456789012";
const IV = "1234567890123456";

function promo(patch: Partial<Promotion> = {}): Promotion {
  const now = Date.now();
  return {
    id: "prm_sale",
    name: "週年慶",
    banner: "全館 8 折",
    enabled: true,
    scope: "site",
    productId: "",
    category: "",
    kind: "percent",
    value: 20,
    minSpend: 0,
    maxDiscount: 0,
    freeShipping: false,
    startsAt: new Date(now - 60_000).toISOString(),
    endsAt: new Date(now + 3_600_000).toISOString(),
    usageLimit: 2,
    used: 0,
    perCustomer: 1,
    requiresClaim: false,
    couponCode: "",
    stacking: "best",
    priority: 0,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    ...patch,
  };
}

const input = (patch: Partial<CheckoutInput> = {}): CheckoutInput => ({
  lines: [{ productId: "prd_1", variantId: "var_m", qty: 2 }],
  recipient: "王小明",
  phone: "0912345678",
  email: "guest@example.com",
  address: "台北市中山區南京東路一段1號",
  fulfillment: "delivery",
  payment: "online",
  pickupPointId: "",
  note: "",
  idempotencyKey: `key-${Math.random().toString(36).slice(2, 12)}`,
  identity: { lineUserId: "", lineName: "王小明", lineId: "", verified: false, phone: "0912345678" },
  ...patch,
});

describe("checkout prices the promotion into NewebPay Amt", () => {
  beforeAll(async () => {
    const { mutate } = await import("@/lib/store");
    await mutate((store) => {
      store.products.push({
        id: "prd_1",
        name: "測試上衣",
        subtitle: "",
        category: "上衣",
        categories: [],
        description: "",
        details: [],
        price: 800,
        comparePrice: 0,
        variants: [{ id: "var_m", color: "藍", size: "M", hex: "#3d5f8a", sku: "", stock: 20, price: null }],
        photos: [],
        status: "listed",
        featured: false,
        sold: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      store.promotions.push(promo());
    });
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("rejects a client that tries to name its own discount", () => {
    const parsed = parseCheckoutBody({
      items: [{ productId: "prd_1", variantId: "var_m", qty: 1 }],
      recipient: "王小明",
      phone: "0912345678",
      email: "guest@example.com",
      address: "台北市中山區南京東路一段1號",
      idempotencyKey: "abcdefgh",
      discount: 1,
      total: 1,
    });
    expect(parsed.ok).toBe(false);
  });

  it("stores the server discount and puts that total in the NewebPay request", async () => {
    const { placeOrder } = await import("@/lib/orders");
    const { buildCheckoutPayload } = await import("@/lib/newebpay");
    const { getStore } = await import("@/lib/store");
    const result = await placeOrder(input());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.subtotal).toBe(1600);
    expect(result.order.discount).toBe(320);
    expect(result.order.shipping).toBe(70);
    expect(result.order.total).toBe(1350);
    expect(result.order.appliedPromos.map((item) => item.id)).toEqual(["prm_sale"]);
    const payload = buildCheckoutPayload(
      {
        merchantId: "MS000TEST",
        hashKey: KEY,
        hashIV: IV,
        sandbox: true,
        credit: true,
        applePay: false,
        googlePay: false,
        linePay: false,
        webatm: false,
        vacc: false,
        cvsCode: false,
        cvs: false,
        expireDays: 3,
      },
      result.order,
      1,
      Date.now(),
      "https://radiant.example"
    );
    const trade = new URLSearchParams(aesDecrypt(payload.fields.TradeInfo, KEY, IV));
    expect(trade.get("Amt")).toBe("1350");
    expect(trade.get("Amt")).toBe(String(result.order.total));
    const saved = (await getStore()).promotions.find((item) => item.id === "prm_sale");
    expect(saved?.used).toBe(1);
  });

  it("refuses a second use and restores the count when the hold expires or the order is cancelled", async () => {
    const { placeOrder, changeOrder, expireHolds } = await import("@/lib/orders");
    const { getStore, mutate } = await import("@/lib/store");
    const blocked = await placeOrder(input({ phone: "0912345678", shownPromoIds: ["prm_sale"], identity: { lineUserId: "", lineName: "王小明", lineId: "", verified: false, phone: "0912345678" } }));
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error).toContain("使用上限");

    const other = await placeOrder(input({ phone: "0922000000", email: "other@example.com", payment: "line", identity: { lineUserId: "", lineName: "另一位", lineId: "", verified: false, phone: "0922000000" } }));
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    expect(other.order.discount).toBe(320);
    const full = await placeOrder(input({ phone: "0933000000", email: "third@example.com", shownPromoIds: ["prm_sale"], identity: { lineUserId: "", lineName: "第三人", lineId: "", verified: false, phone: "0933000000" } }));
    expect(full.ok).toBe(false);
    if (full.ok) return;
    expect(full.error).toContain("已額滿");

    const { orders } = await getStore();
    const first = orders.find((order) => order.phone === "0912345678" && order.discount === 320);
    expect(first).toBeTruthy();
    if (!first) return;
    await mutate((store) => {
      const order = store.orders.find((item) => item.id === first.id);
      if (order) order.holdUntil = new Date(Date.now() - 1000).toISOString();
    });
    expect(await mutate((store) => expireHolds(store))).toBe(1);
    expect((await getStore()).promotions.find((item) => item.id === "prm_sale")?.used).toBe(1);
    await changeOrder(other.order.id, "cancelled", "測試取消");
    expect((await getStore()).promotions.find((item) => item.id === "prm_sale")?.used).toBe(0);
    const restored = (await getStore()).promoUses.filter((use) => use.promoId === "prm_sale" && !use.restored);
    expect(restored).toHaveLength(0);
  });

  it("does not place an order when the shown promotion has ended", async () => {
    const { placeOrder } = await import("@/lib/orders");
    const { mutate, getStore } = await import("@/lib/store");
    await mutate((store) => {
      const item = store.promotions.find((promo) => promo.id === "prm_sale");
      if (item) item.endsAt = new Date(Date.now() - 1000).toISOString();
    });
    const before = (await getStore()).orders.length;
    const result = await placeOrder(input({ phone: "0944000000", shownPromoIds: ["prm_sale"], identity: { lineUserId: "", lineName: "結束", lineId: "", verified: false, phone: "0944000000" } }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("已結束");
    expect((await getStore()).orders.length).toBe(before);
  });
});
