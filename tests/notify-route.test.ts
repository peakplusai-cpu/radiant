import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aesEncrypt, tradeSha } from "@/lib/newebpay";

const dir = mkdtempSync(join(tmpdir(), "radiant-notify-"));
process.env.RADIANT_DATA_FILE = join(dir, "store.json");
process.env.NEWEBPAY_MERCHANT_ID = "MSROUTE01";
process.env.NEWEBPAY_HASH_KEY = "r".repeat(32);
process.env.NEWEBPAY_HASH_IV = "v".repeat(16);
process.env.NEWEBPAY_ENV = "test";

const KEY = "r".repeat(32);
const IV = "v".repeat(16);

function signed(body: unknown, sha?: string) {
  const tradeInfo = aesEncrypt(JSON.stringify(body), KEY, IV);
  const form = new FormData();
  form.set("Status", "SUCCESS");
  form.set("MerchantID", "MSROUTE01");
  form.set("TradeInfo", tradeInfo);
  form.set("TradeSha", sha ?? tradeSha(tradeInfo, KEY, IV));
  form.set("Version", "2.0");
  return form;
}

async function post(path: string, form: FormData) {
  const route = path.endsWith("return")
    ? await import("@/app/api/pay/return/route")
    : await import("@/app/api/pay/notify/route");
  return route.POST(new Request(`https://shop.example${path}`, { method: "POST", body: form }));
}

describe("NewebPay notify route", () => {
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
        variants: [{ id: "var_m", color: "藍", size: "M", hex: "#3d5f8a", sku: "", stock: 5, price: null }],
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

  it("rejects a tampered notice, ignores a wrong amount, and marks a valid notice paid once", async () => {
    const { placeOrder, beginPayment } = await import("@/lib/orders");
    const { getStore } = await import("@/lib/store");
    const placed = await placeOrder({
      lines: [{ productId: "prd_1", variantId: "var_m", qty: 1 }],
      recipient: "王小明",
      phone: "0912000111",
      email: "route@example.com",
      address: "台北市中山區南京東路一段1號",
      fulfillment: "delivery",
      payment: "online",
      pickupPointId: "",
      note: "",
      idempotencyKey: "notify-route-key",
      identity: { lineUserId: "", lineName: "王小明", lineId: "", verified: false, phone: "0912000111" },
    });
    if (!placed.ok) throw new Error(placed.error);
    const started = await beginPayment(placed.order.code);
    if (!started.ok) throw new Error(started.error);
    const result = { MerchantID: "MSROUTE01", Amt: placed.order.total, TradeNo: "ROUTE1", MerchantOrderNo: `${placed.order.code}_1`, PaymentType: "CREDIT", PayTime: "2026-11-16 22:00:00" };

    const forged = await post("/api/pay/notify", signed({ Status: "SUCCESS", Result: result }, "0".repeat(64)));
    expect(forged.status).toBe(400);

    const early = await post("/api/pay/return", signed({ Status: "SUCCESS", Result: result }));
    expect(early.status).toBe(303);
    expect(early.headers.get("location")).toContain(`pay=returned`);
    expect((await getStore()).orders.find((order) => order.code === placed.order.code)?.status).toBe("pending");

    const wrong = await post("/api/pay/notify", signed({ Status: "SUCCESS", Result: { ...result, Amt: 1 } }));
    expect(wrong.status).toBe(200);
    expect((await getStore()).orders.find((order) => order.code === placed.order.code)?.status).toBe("pending");

    const ok = await post("/api/pay/notify", signed({ Status: "SUCCESS", Result: result }));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("OK");
    const again = await post("/api/pay/notify", signed({ Status: "SUCCESS", Result: result }));
    expect(again.status).toBe(200);
    const saved = (await getStore()).orders.find((order) => order.code === placed.order.code);
    expect(saved).toMatchObject({ status: "paid", payTradeNo: "ROUTE1" });
    expect((await getStore()).products[0].variants[0].stock).toBe(4);
  });
});
