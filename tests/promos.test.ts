import { describe, expect, it } from "vitest";
import {
  discountAmount,
  isoToTaipeiInput,
  promoStatus,
  quotePromos,
  taipeiInputToIso,
  type MoneyLine,
  type QuoteInput,
} from "@/lib/promos";
import type { Promotion } from "@/lib/types";

const NOW = Date.parse("2026-11-16T08:00:00.000Z");

function promo(patch: Partial<Promotion> = {}): Promotion {
  return {
    id: "prm_1",
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
    startsAt: new Date(NOW - 60_000).toISOString(),
    endsAt: new Date(NOW + 3_600_000).toISOString(),
    usageLimit: 0,
    used: 0,
    perCustomer: 0,
    requiresClaim: false,
    couponCode: "",
    stacking: "best",
    priority: 0,
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    ...patch,
  };
}

function line(price = 1000, qty = 1, id = "p1", categories = ["上衣"]): MoneyLine {
  return { productId: id, qty, unitPrice: price, categories };
}

function quote(promotions: Promotion[], lines: MoneyLine[], patch: Partial<QuoteInput> = {}) {
  return quotePromos({
    now: NOW,
    lines,
    fulfillment: "delivery",
    settings: { shippingFee: 70, freeShippingThreshold: 2000, cvsShippingFee: 65 },
    promotions,
    claimedIds: new Set(),
    coupon: "",
    ...patch,
  });
}

describe("discount engine", () => {
  it("takes a percentage off and rounds half up to a whole NT$", () => {
    expect(discountAmount(promo({ kind: "percent", value: 15 }), 199)).toBe(30);
    expect(discountAmount(promo({ kind: "percent", value: 10 }), 105)).toBe(11);
    const result = quote([promo()], [line(1000)]);
    expect(result.discount).toBe(200);
    expect(result.shipping).toBe(70);
    expect(result.total).toBe(870);
    expect(result.applied.map((item) => item.name)).toEqual(["週年慶"]);
  });

  it("caps the discount and never exceeds the eligible amount", () => {
    expect(quote([promo({ value: 50, maxDiscount: 120 })], [line(1000)]).discount).toBe(120);
    expect(quote([promo({ kind: "amount", value: 150 })], [line(100)]).discount).toBe(100);
    expect(quote([promo({ kind: "amount", value: 80, maxDiscount: 50 })], [line(1000)]).discount).toBe(50);
  });

  it("applies 滿額折 once, and tells the shopper how much more to spend", () => {
    const rule = promo({ id: "full", kind: "threshold", value: 100, minSpend: 1000 });
    const short = quote([rule], [line(999)]);
    expect(short.discount).toBe(0);
    expect(short.hints[0]?.text).toBe("再買 NT$ 1 即可折 NT$ 100");
    expect(quote([rule], [line(1000)]).discount).toBe(100);
    expect(quote([rule], [line(2500)]).discount).toBe(100);
  });

  it("keeps a minimum spend on percent and amount discounts", () => {
    const result = quote([promo({ value: 10, minSpend: 500 })], [line(400)]);
    expect(result.discount).toBe(0);
    expect(result.hints[0]?.text).toBe("再買 NT$ 100 即可折 NT$ 50");
    expect(quote([promo({ kind: "amount", value: 80, minSpend: 500 })], [line(500)]).discount).toBe(80);
  });

  it("limits percent, amount and threshold discounts to the matching scope", () => {
    const shirt = line(800, 1, "shirt", ["上衣"]);
    const dress = line(800, 1, "dress", ["洋裝"]);
    expect(quote([promo({ scope: "product", productId: "shirt" })], [shirt, dress]).discount).toBe(160);
    expect(quote([promo({ scope: "category", category: "上衣", kind: "amount", value: 50 })], [shirt, dress]).discount).toBe(50);
    expect(quote([promo({ scope: "category", category: "上衣" })], [dress]).discount).toBe(0);
  });

  it("opens at the start instant and closes at the end instant", () => {
    const windowed = promo({ startsAt: new Date(1_000).toISOString(), endsAt: new Date(5_000).toISOString() });
    expect(promoStatus(windowed, 999)).toBe("upcoming");
    expect(promoStatus(windowed, 1_000)).toBe("active");
    expect(promoStatus(windowed, 4_999)).toBe("active");
    expect(promoStatus(windowed, 5_000)).toBe("ended");
    expect(quote([windowed], [line()], { now: 999 }).discount).toBe(0);
    expect(quote([windowed], [line()], { now: 1_000 }).discount).toBe(200);
    expect(quote([windowed], [line()], { now: 5_000 }).discount).toBe(0);
    expect(promoStatus(promo({ enabled: false }), NOW)).toBe("disabled");
    expect(quote([promo({ enabled: false })], [line()]).discount).toBe(0);
  });

  it("enforces total and per-customer limits", () => {
    expect(quote([promo({ usageLimit: 1, used: 1 })], [line()]).discount).toBe(0);
    expect(quote([promo({ usageLimit: 2 })], [line()], { usage: new Map([["prm_1", 2]]) }).discount).toBe(0);
    expect(quote([promo({ perCustomer: 1 })], [line()], { customerUsage: new Map([["prm_1", 1]]) }).discount).toBe(0);
    expect(quote([promo({ perCustomer: 1, usageLimit: 3 })], [line()], { customerUsage: new Map([["prm_1", 0]]) }).discount).toBe(200);
  });

  it("picks the single best promotion unless stacking is strictly better", () => {
    const percent = promo({ id: "pct", value: 10 });
    const fixed = promo({ id: "fix", kind: "amount", value: 80 });
    expect(quote([percent, fixed], [line(1000)]).applied.map((item) => item.id)).toEqual(["pct"]);

    const low = promo({ id: "low", kind: "amount", value: 100, priority: 1 });
    const high = promo({ id: "high", kind: "amount", value: 100, priority: 5 });
    expect(quote([low, high], [line(1000)]).applied.map((item) => item.id)).toEqual(["high"]);

    const exclusive = promo({ id: "ex", value: 20 });
    const stackA = promo({ id: "sa", value: 10, stacking: "stack" });
    const stackB = promo({ id: "sb", kind: "amount", value: 50, stacking: "stack" });
    expect(quote([exclusive, stackA, stackB], [line(1000)]).discount).toBe(200);

    const weak = promo({ id: "weak", kind: "amount", value: 100 });
    const stack10 = promo({ id: "s10", value: 10, stacking: "stack" });
    const stack15 = promo({ id: "s15", value: 15, stacking: "stack" });
    const stacked = quote([weak, stack10, stack15], [line(1000)]);
    expect(stacked.discount).toBe(250);
    expect(stacked.applied.map((item) => item.id).sort()).toEqual(["s10", "s15"]);
  });

  it("caps stacked discounts at the merchandise total", () => {
    const a = promo({ id: "a", kind: "amount", value: 800, stacking: "stack" });
    const b = promo({ id: "b", kind: "amount", value: 800, stacking: "stack" });
    const result = quote([a, b], [line(1000)]);
    expect(result.discount).toBe(1000);
    expect(result.applied.reduce((sum, item) => sum + item.discount, 0)).toBe(1000);
    expect(result.total).toBe(70);
  });

  it("can waive shipping, and still prefers a bigger price cut", () => {
    const ship = promo({ id: "ship", kind: "amount", value: 0, freeShipping: true });
    const small = promo({ id: "small", value: 10 });
    const big = promo({ id: "big", value: 20 });
    const free = quote([ship, small], [line(500)]);
    expect(free.applied.map((item) => item.id)).toEqual(["ship"]);
    expect(free.shipping).toBe(0);
    expect(free.discount).toBe(0);
    expect(free.total).toBe(500);
    const cut = quote([ship, big], [line(500)]);
    expect(cut.applied.map((item) => item.id)).toEqual(["big"]);
    expect(cut.discount).toBe(100);
    expect(cut.shipping).toBe(70);
    expect(cut.total).toBe(470);
  });

  it("uses the pre-discount subtotal for the shop free-shipping threshold", () => {
    const result = quote([promo({ value: 10 })], [line(2000)]);
    expect(result.discount).toBe(200);
    expect(result.shipping).toBe(0);
    expect(result.total).toBe(1800);
  });

  it("requires a claim or a matching coupon before it applies", () => {
    expect(quote([promo({ requiresClaim: true })], [line()]).discount).toBe(0);
    expect(quote([promo({ requiresClaim: true })], [line()], { claimedIds: new Set(["prm_1"]) }).discount).toBe(200);
    expect(quote([promo({ couponCode: "SAVE20" })], [line()], { coupon: "nope" }).discount).toBe(0);
    expect(quote([promo({ couponCode: "SAVE20" })], [line()], { coupon: "save20" }).discount).toBe(200);
    expect(quote([promo({ couponCode: "SAVE20" })], [line()], { coupon: "nope" }).error).toBe("優惠代碼不正確");
  });

  it("rejects checkout when a promo the shopper was shown has ended", () => {
    const ended = promo({ endsAt: new Date(NOW - 1000).toISOString() });
    const result = quote([ended], [line()], { expectIds: [ended.id] });
    expect(result.discount).toBe(0);
    expect(result.error).toContain("已結束");
    expect(result.error).toContain("請確認金額後再送出");
  });

  it("stores Taipei wall time as UTC", () => {
    expect(taipeiInputToIso("2026-11-16T00:30")).toBe("2026-11-15T16:30:00.000Z");
    expect(isoToTaipeiInput("2026-11-15T16:30:00.000Z")).toBe("2026-11-16T00:30");
    expect(taipeiInputToIso("not-a-time")).toBeNull();
  });
});
