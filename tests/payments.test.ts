import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CheckoutInput } from "@/lib/orders";
import type { PaymentNotice } from "@/lib/newebpay";

const dir = mkdtempSync(join(tmpdir(), "radiant-pay-"));
process.env.RADIANT_DATA_FILE = join(dir, "store.json");

let counter = 0;
const input = (patch: Partial<CheckoutInput> = {}): CheckoutInput => {
  counter += 1;
  const phone = `09${String(10000000 + counter)}`;
  return {
    lines: [{ productId: "prd_1", variantId: "var_m", qty: 1 }],
    recipient: "王小明",
    phone,
    email: `guest${counter}@example.com`,
    address: "台北市中山區南京東路一段1號",
    fulfillment: "delivery",
    payment: "online",
    pickupPointId: "",
    note: "",
    idempotencyKey: `pay-key-${counter}-${Math.random().toString(36).slice(2, 10)}`,
    identity: { lineUserId: "", lineName: "王小明", lineId: "", verified: false, phone },
    ...patch,
  };
};

const notice = (patch: Partial<PaymentNotice> & { code: string; amt: number }): PaymentNotice => ({
  success: true,
  status: "SUCCESS",
  message: "",
  merchantOrderNo: `${patch.code}_1`,
  tradeNo: "T26111600001",
  paymentType: "CREDIT",
  wallet: "",
  payTime: "2026-11-16 22:00:00",
  bankCode: "",
  codeNo: "",
  expireDate: "",
  store: null,
  ...patch,
});

async function stockOf(variantId: string): Promise<number> {
  const { getStore } = await import("@/lib/store");
  return (await getStore()).products[0].variants.find((variant) => variant.id === variantId)?.stock ?? -1;
}

async function place(patch: Partial<CheckoutInput> = {}) {
  const { placeOrder, beginPayment } = await import("@/lib/orders");
  const placed = await placeOrder(input(patch));
  if (!placed.ok) throw new Error(placed.error);
  const started = await beginPayment(placed.order.code);
  if (!started.ok) throw new Error(started.error);
  return placed.order;
}

describe("online payment and pay-at-pickup orders", () => {
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
        price: 500,
        comparePrice: 0,
        variants: [
          { id: "var_m", color: "藍", size: "M", hex: "#3d5f8a", sku: "", stock: 20, price: null },
          { id: "var_l", color: "藍", size: "L", hex: "#3d5f8a", sku: "", stock: 20, price: null },
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

  beforeEach(async () => {
    const { mutate } = await import("@/lib/store");
    await mutate((store) => {
      for (const variant of store.products[0].variants) variant.stock = 20;
      store.products[0].sold = 0;
      store.orders = [];
    });
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("holds stock and a deadline for an unpaid online order, without LINE-style status", async () => {
    const { placeOrder } = await import("@/lib/orders");
    const placed = await placeOrder(input());
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.order.paymentMethod).toBe("online");
    expect(placed.order.status).toBe("pending");
    expect(placed.order.paidAt).toBe("");
    expect(Date.parse(placed.order.holdUntil)).toBeGreaterThan(Date.now() + 25 * 60_000);
    expect(await stockOf("var_m")).toBe(19);
  });

  it("charges the store fee for convenience-store pickup and waives it from 2000", async () => {
    const { placeOrder } = await import("@/lib/orders");
    const small = await placeOrder(input({ fulfillment: "cvs", payment: "cod" }));
    expect(small.ok && [small.order.shipping, small.order.total, small.order.address]).toEqual([65, 565, ""]);
    const big = await placeOrder(input({ fulfillment: "cvs", payment: "cod", lines: [{ productId: "prd_1", variantId: "var_l", qty: 4 }] }));
    expect(big.ok && [big.order.shipping, big.order.total]).toEqual([0, 2000]);
  });

  it("rejects pay-at-pickup for home delivery and LINE payment for convenience-store orders", async () => {
    const { placeOrder } = await import("@/lib/orders");
    expect((await placeOrder(input({ fulfillment: "delivery", payment: "cod" }))).ok).toBe(false);
    expect((await placeOrder(input({ fulfillment: "cvs", payment: "line" }))).ok).toBe(false);
  });

  it("rejects a convenience-store order above the 20,000 limit", async () => {
    const { placeOrder, } = await import("@/lib/orders");
    const { mutate } = await import("@/lib/store");
    await mutate((store) => {
      store.products[0].variants[0].price = 21000;
    });
    const result = await placeOrder(input({ fulfillment: "cvs", payment: "cod" }));
    expect(result.ok).toBe(false);
    await mutate((store) => {
      store.products[0].variants[0].price = null;
    });
  });

  it("marks an online order paid exactly once and ignores the duplicate notice", async () => {
    const { applyPaymentNotice } = await import("@/lib/orders");
    const order = await place();
    const first = await applyPaymentNotice(notice({ code: order.code, amt: order.total }));
    expect(first.kind).toBe("confirmed");
    const second = await applyPaymentNotice(notice({ code: order.code, amt: order.total }));
    expect(second.kind).toBe("duplicate");
    const { getStore } = await import("@/lib/store");
    const saved = (await getStore()).orders.find((item) => item.code === order.code);
    expect(saved).toMatchObject({ status: "paid", holdUntil: "", payTradeNo: "T26111600001" });
    expect(saved?.paidAt).not.toBe("");
    expect(await stockOf("var_m")).toBe(19);
  });

  it("does not mark an order paid when the amount does not match", async () => {
    const { applyPaymentNotice } = await import("@/lib/orders");
    const order = await place();
    const outcome = await applyPaymentNotice(notice({ code: order.code, amt: 1 }));
    expect(outcome.kind).toBe("mismatch");
    const { getStore } = await import("@/lib/store");
    const saved = (await getStore()).orders.find((item) => item.code === order.code);
    expect(saved?.status).toBe("pending");
    expect(saved?.internalNote).toContain("不符");
  });

  it("ignores notices for unknown orders, LINE orders and attempts we never issued", async () => {
    const { applyPaymentNotice, placeOrder } = await import("@/lib/orders");
    expect((await applyPaymentNotice(notice({ code: "RD0000000000", amt: 500 }))).kind).toBe("ignored");
    const line = await placeOrder(input({ payment: "line" }));
    if (!line.ok) throw new Error(line.error);
    expect((await applyPaymentNotice(notice({ code: line.order.code, amt: line.order.total }))).kind).toBe("ignored");
    const order = await place();
    expect((await applyPaymentNotice(notice({ code: order.code, amt: order.total, merchantOrderNo: `${order.code}_9` }))).kind).toBe("ignored");
  });

  it("leaves the order unpaid when NewebPay reports a failure", async () => {
    const { applyPaymentNotice } = await import("@/lib/orders");
    const order = await place();
    const outcome = await applyPaymentNotice(notice({ code: order.code, amt: order.total, success: false, status: "TRA10031" }));
    expect(outcome.kind).toBe("failed");
    const { getStore } = await import("@/lib/store");
    expect((await getStore()).orders.find((item) => item.code === order.code)?.status).toBe("pending");
  });

  it("cancels and restocks an unpaid order after the hold, then refuses to restart payment", async () => {
    const { expireHolds, beginPayment } = await import("@/lib/orders");
    const { mutate, getStore } = await import("@/lib/store");
    const order = await place();
    expect(await stockOf("var_m")).toBe(19);
    await mutate((store) => {
      const target = store.orders.find((item) => item.code === order.code);
      if (target) target.holdUntil = new Date(Date.now() - 1000).toISOString();
    });
    const cancelled = await mutate((store) => expireHolds(store));
    expect(cancelled).toBe(1);
    expect(await stockOf("var_m")).toBe(20);
    expect((await getStore()).orders.find((item) => item.code === order.code)?.status).toBe("cancelled");
    expect((await beginPayment(order.code)).ok).toBe(false);
  });

  it("never expires a paid order or a LINE order", async () => {
    const { expireHolds, applyPaymentNotice, placeOrder } = await import("@/lib/orders");
    const { mutate } = await import("@/lib/store");
    const paid = await place();
    await applyPaymentNotice(notice({ code: paid.code, amt: paid.total }));
    const line = await placeOrder(input({ payment: "line" }));
    expect(line.ok).toBe(true);
    expect(await mutate((store) => expireHolds(store, Date.now() + 24 * 3600_000))).toBe(0);
  });

  it("sweeps expired holds when a new order is placed so abandoned carts free stock", async () => {
    const { placeOrder } = await import("@/lib/orders");
    const { mutate } = await import("@/lib/store");
    await mutate((store) => {
      store.products[0].variants[1].stock = 1;
    });
    const held = await place({ lines: [{ productId: "prd_1", variantId: "var_l", qty: 1 }] });
    expect(await stockOf("var_l")).toBe(0);
    const blocked = await placeOrder(input({ lines: [{ productId: "prd_1", variantId: "var_l", qty: 1 }] }));
    expect(blocked.ok).toBe(false);
    await mutate((store) => {
      const target = store.orders.find((item) => item.code === held.code);
      if (target) target.holdUntil = new Date(Date.now() - 1000).toISOString();
    });
    const second = await placeOrder(input({ lines: [{ productId: "prd_1", variantId: "var_l", qty: 1 }] }));
    expect(second.ok).toBe(true);
  });

  it("revives an order that expired just before the customer paid, if stock is still there", async () => {
    const { expireHolds, applyPaymentNotice } = await import("@/lib/orders");
    const { mutate, getStore } = await import("@/lib/store");
    const order = await place();
    await mutate((store) => {
      const target = store.orders.find((item) => item.code === order.code);
      if (target) target.holdUntil = new Date(Date.now() - 1000).toISOString();
      expireHolds(store);
    });
    const outcome = await applyPaymentNotice(notice({ code: order.code, amt: order.total }));
    expect(outcome).toMatchObject({ kind: "confirmed", revived: true });
    expect((await getStore()).orders.find((item) => item.code === order.code)?.status).toBe("paid");
    expect(await stockOf("var_m")).toBe(19);
  });

  it("flags a late payment for refund when the stock is gone", async () => {
    const { expireHolds, applyPaymentNotice, placeOrder } = await import("@/lib/orders");
    const { mutate, getStore } = await import("@/lib/store");
    await mutate((store) => {
      store.products[0].variants[1].stock = 1;
    });
    const order = await place({ lines: [{ productId: "prd_1", variantId: "var_l", qty: 1 }] });
    await mutate((store) => {
      const target = store.orders.find((item) => item.code === order.code);
      if (target) target.holdUntil = new Date(Date.now() - 1000).toISOString();
      expireHolds(store);
    });
    const taken = await placeOrder(input({ lines: [{ productId: "prd_1", variantId: "var_l", qty: 1 }] }));
    expect(taken.ok).toBe(true);
    const outcome = await applyPaymentNotice(notice({ code: order.code, amt: order.total }));
    expect(outcome.kind).toBe("refund");
    const saved = (await getStore()).orders.find((item) => item.code === order.code);
    expect(saved?.status).toBe("cancelled");
    expect(saved?.paidAt).not.toBe("");
    expect(saved?.internalNote).toContain("退款");
  });

  it("does not revive an order that staff cancelled by hand", async () => {
    const { changeOrder, applyPaymentNotice } = await import("@/lib/orders");
    const order = await place();
    expect((await changeOrder(order.id, "cancelled", "")).ok).toBe(true);
    const outcome = await applyPaymentNotice(notice({ code: order.code, amt: order.total }));
    expect(outcome.kind).toBe("refund");
    expect(await stockOf("var_m")).toBe(20);
  });

  it("blocks shipping an order the customer has not paid for, but lets staff mark it paid", async () => {
    const { changeOrder } = await import("@/lib/orders");
    const order = await place();
    expect((await changeOrder(order.id, "shipped", "")).ok).toBe(false);
    expect((await changeOrder(order.id, "paid", "已於藍新後台確認")).ok).toBe(true);
    expect((await changeOrder(order.id, "shipped", "")).ok).toBe(true);
  });

  it("records the store on a pay-at-pickup order, keeps it pending, and completes it at pickup", async () => {
    const { applyPaymentNotice, changeOrder } = await import("@/lib/orders");
    const { getStore } = await import("@/lib/store");
    const order = await place({ fulfillment: "cvs", payment: "cod" });
    const store = { storeCode: "131386", storeName: "光輝", storeType: "全家", storeAddr: "台北市信義區", pickupName: "王小明", pickupPhone: "0912345678", lgsNo: "F123" };

    const established = await applyPaymentNotice(notice({ code: order.code, amt: order.total, paymentType: "CVSCOM", payTime: "", store }));
    expect(established.kind).toBe("confirmed");
    let saved = (await getStore()).orders.find((item) => item.code === order.code);
    expect(saved).toMatchObject({ status: "pending", holdUntil: "", paidAt: "" });
    expect(saved?.cvs).toMatchObject({ storeName: "光輝", lgsNo: "F123" });

    expect((await applyPaymentNotice(notice({ code: order.code, amt: order.total, paymentType: "CVSCOM", payTime: "", store }))).kind).toBe("duplicate");
    expect((await changeOrder(order.id, "shipped", "")).ok).toBe(true);

    const done = await applyPaymentNotice(notice({ code: order.code, amt: order.total, paymentType: "CVSCOM", store }));
    expect(done.kind).toBe("completed");
    saved = (await getStore()).orders.find((item) => item.code === order.code);
    expect(saved?.status).toBe("completed");
    expect(saved?.paidAt).not.toBe("");
    expect((await applyPaymentNotice(notice({ code: order.code, amt: order.total, paymentType: "CVSCOM", store }))).kind).toBe("duplicate");
  });

  it("records the store on a prepaid convenience-store order and marks it paid", async () => {
    const { applyPaymentNotice } = await import("@/lib/orders");
    const { getStore } = await import("@/lib/store");
    const order = await place({ fulfillment: "cvs", payment: "online" });
    const outcome = await applyPaymentNotice(
      notice({ code: order.code, amt: order.total, store: { storeCode: "991", storeName: "松山", storeType: "7-ELEVEN", storeAddr: "台北市松山區" } })
    );
    expect(outcome.kind).toBe("confirmed");
    const saved = (await getStore()).orders.find((item) => item.code === order.code);
    expect(saved?.status).toBe("paid");
    expect(saved?.cvs).toMatchObject({ storeName: "松山", storeType: "7-ELEVEN" });
  });

  it("keeps an ATM number unpaid, extends the hold, and marks it paid only when PayTime arrives", async () => {
    const { applyPaymentNotice, beginPayment } = await import("@/lib/orders");
    const { getStore } = await import("@/lib/store");
    const order = await place();
    const expireDate = new Date(Date.now() + 4 * 24 * 3600_000).toISOString().slice(0, 10);
    const numbered = await applyPaymentNotice(notice({
      code: order.code,
      amt: order.total,
      paymentType: "VACC",
      payTime: "",
      bankCode: "004",
      codeNo: "99887766",
      expireDate,
      tradeNo: "VACC1",
    }));
    expect(numbered.kind).toBe("voucher");
    let saved = (await getStore()).orders.find((item) => item.code === order.code);
    expect(saved).toMatchObject({ status: "pending", payCodeNo: "99887766", payBankCode: "004", paidAt: "" });
    expect(Date.parse(saved?.holdUntil ?? "")).toBeGreaterThan(Date.now() + 24 * 3600_000);
    expect((await applyPaymentNotice(notice({ code: order.code, amt: order.total, paymentType: "VACC", payTime: "", bankCode: "004", codeNo: "99887766", expireDate, tradeNo: "VACC1" }))).kind).toBe("duplicate");
    expect((await beginPayment(order.code)).ok).toBe(false);

    const paid = await applyPaymentNotice(notice({ code: order.code, amt: order.total, paymentType: "VACC", tradeNo: "VACC1" }));
    expect(paid.kind).toBe("confirmed");
    saved = (await getStore()).orders.find((item) => item.code === order.code);
    expect(saved?.status).toBe("paid");
    expect(saved?.holdUntil).toBe("");
    expect(await stockOf("var_m")).toBe(19);
  });
});
