import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CheckoutInput } from "@/lib/orders";

const dir = mkdtempSync(join(tmpdir(), "radiant-"));
process.env.RADIANT_DATA_FILE = join(dir, "store.json");

const input = (patch: Partial<CheckoutInput> = {}): CheckoutInput => ({
  lines: [{ productId: "prd_1", variantId: "var_m", qty: 1 }],
  recipient: "王小明",
  phone: "0912345678",
  address: "台北市中山區南京東路一段1號",
  fulfillment: "delivery",
  pickupPointId: "",
  note: "",
  idempotencyKey: `key-${Math.random().toString(36).slice(2, 12)}`,
  identity: { lineUserId: "", lineName: "王小明", lineId: "", verified: false, phone: "0912345678" },
  ...patch,
});

describe("placeOrder", () => {
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
          { id: "var_m", color: "藍", size: "M", hex: "#3d5f8a", sku: "", stock: 4, price: 800 },
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

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("recomputes price and shipping and ignores a spoofed LINE id", async () => {
    const { placeOrder } = await import("@/lib/orders");
    const { getStore } = await import("@/lib/store");
    const result = await placeOrder(input({
      lines: [{ productId: "prd_1", variantId: "var_m", qty: 3 }],
      identity: { lineUserId: "Uattacker", lineName: "假的", lineId: "victim", verified: false, phone: "0912345678" },
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.subtotal).toBe(2400);
    expect(result.order.shipping).toBe(0);
    expect(result.order.total).toBe(2400);
    expect(result.order.token.length).toBeGreaterThan(32);
    expect(result.customer.lineUserId).toBe("");
    expect(result.customer.verified).toBe(false);
    const stock = (await getStore()).products[0].variants.find((variant) => variant.id === "var_m")?.stock;
    expect(stock).toBe(1);
  });

  it("charges 70 when the server subtotal is under 2000", async () => {
    const { placeOrder } = await import("@/lib/orders");
    const result = await placeOrder(input({ lines: [{ productId: "prd_1", variantId: "var_l", qty: 1 }], phone: "0922000000", identity: { lineUserId: "", lineName: "另一位", lineId: "", verified: false, phone: "0922000000" } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.subtotal).toBe(500);
    expect(result.order.shipping).toBe(70);
    expect(result.order.total).toBe(570);
  });

  it("does not create a second order for the same idempotency key", async () => {
    const { placeOrder } = await import("@/lib/orders");
    const { getStore } = await import("@/lib/store");
    const key = "same-key-01";
    const first = await placeOrder(input({ lines: [{ productId: "prd_1", variantId: "var_m", qty: 1 }], idempotencyKey: key, phone: "0933000000", identity: { lineUserId: "Ureal", lineName: "真的", lineId: "", verified: true, phone: "0933000000" } }));
    const second = await placeOrder(input({ lines: [{ productId: "prd_1", variantId: "var_m", qty: 1 }], idempotencyKey: key, phone: "0933000000", identity: { lineUserId: "Ureal", lineName: "真的", lineId: "", verified: true, phone: "0933000000" } }));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.order.code).toBe(first.order.code);
    expect(second.replay).toBe(true);
    const orders = (await getStore()).orders.filter((order) => order.code === first.order.code);
    expect(orders).toHaveLength(1);
  });

  it("does not oversell the last piece", async () => {
    const { placeOrder } = await import("@/lib/orders");
    const { mutate } = await import("@/lib/store");
    await mutate((store) => {
      const variant = store.products[0].variants.find((item) => item.id === "var_l");
      if (variant) variant.stock = 1;
    });
    const [a, b] = await Promise.all([
      placeOrder(input({ lines: [{ productId: "prd_1", variantId: "var_l", qty: 1 }], phone: "0944000000", identity: { lineUserId: "", lineName: "甲", lineId: "", verified: false, phone: "0944000000" } })),
      placeOrder(input({ lines: [{ productId: "prd_1", variantId: "var_l", qty: 1 }], phone: "0955000000", identity: { lineUserId: "", lineName: "乙", lineId: "", verified: false, phone: "0955000000" } })),
    ]);
    const wins = [a, b].filter((result) => result.ok);
    expect(wins).toHaveLength(1);
  });

  it("restores stock once when a cancellable order is cancelled", async () => {
    const { placeOrder, changeOrder } = await import("@/lib/orders");
    const { getStore, mutate } = await import("@/lib/store");
    await mutate((store) => {
      const variant = store.products[0].variants.find((item) => item.id === "var_m");
      if (variant) variant.stock = 2;
    });
    const before = (await getStore()).products[0].variants.find((variant) => variant.id === "var_m")?.stock ?? 0;
    const placed = await placeOrder(input({ lines: [{ productId: "prd_1", variantId: "var_m", qty: 1 }], phone: "0966000000", identity: { lineUserId: "", lineName: "丙", lineId: "", verified: false, phone: "0966000000" } }));
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const cancelled = await changeOrder(placed.order.id, "cancelled", "");
    expect(cancelled.stockRestored).toBe(true);
    const again = await changeOrder(placed.order.id, "cancelled", "");
    expect(again.ok).toBe(true);
    expect(again.stockRestored).toBe(false);
    const after = (await getStore()).products[0].variants.find((variant) => variant.id === "var_m")?.stock;
    expect(after).toBe(before);
    const shipped = await placeOrder(input({ lines: [{ productId: "prd_1", variantId: "var_m", qty: 1 }], phone: "0977000000", identity: { lineUserId: "", lineName: "丁", lineId: "", verified: false, phone: "0977000000" } }));
    if (!shipped.ok) return;
    expect((await changeOrder(shipped.order.id, "completed", "")).ok).toBe(false);
    expect((await changeOrder(shipped.order.id, "shipped", "")).ok).toBe(true);
    expect((await changeOrder(shipped.order.id, "completed", "")).ok).toBe(true);
    expect((await changeOrder(shipped.order.id, "cancelled", "")).ok).toBe(false);
  });
});
