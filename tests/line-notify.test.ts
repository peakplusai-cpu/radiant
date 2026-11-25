import { createHmac, randomBytes } from "crypto";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { maskPhone, parseNotifyTargets, staffOrderMessage, verifyLineSignature } from "@/lib/line-notify";
import type { Order } from "@/lib/types";

const dir = mkdtempSync(join(tmpdir(), "radiant-line-"));
process.env.RADIANT_DATA_FILE = join(dir, "store.json");

const USER = `U${"a".repeat(32)}`;
const GROUP = `C${"b".repeat(32)}`;
const SECRET = "line-channel-secret";
const calls: { url: string; body: string; auth: string }[] = [];

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("base64");
}

function order(patch: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    code: "RD2511250001",
    token: "tok",
    customerId: "cus_1",
    recipient: "王小明",
    phone: "0912345678",
    email: "guest@example.com",
    address: "台北市中山區南京東路一段1號",
    fulfillment: "delivery",
    pickupPointId: "",
    pickupPointName: "",
    paymentMethod: "online",
    paidAt: "",
    payTradeNo: "",
    payType: "",
    payBankCode: "",
    payCodeNo: "",
    payExpire: "",
    payAttempts: 1,
    alerts: [],
    holdUntil: "",
    cvs: null,
    note: "",
    items: [{ productId: "prd_1", variantId: "var_m", name: "測試上衣", color: "藍", size: "M", hex: "#3d5f8a", price: 500, qty: 2, photo: "" }],
    subtotal: 1000,
    discount: 0,
    appliedPromos: [],
    shipping: 70,
    total: 1070,
    status: "pending",
    internalNote: "",
    createdAt: "",
    updatedAt: "",
    ...patch,
  };
}

describe("LINE signature, targets, and staff payload", () => {
  it("accepts a valid signature and rejects a tampered body or secret", () => {
    const body = JSON.stringify({ events: [] });
    expect(verifyLineSignature(body, sign(body), SECRET)).toBe(true);
    expect(verifyLineSignature(`${body} `, sign(body), SECRET)).toBe(false);
    expect(verifyLineSignature(body, sign(body, "other"), SECRET)).toBe(false);
    expect(verifyLineSignature(body, "", SECRET)).toBe(false);
    expect(verifyLineSignature(body, sign(body), "")).toBe(false);
  });

  it("splits user and group ids and drops junk", () => {
    const room = `R${"c".repeat(32)}`;
    expect(parseNotifyTargets(`${USER}, ${GROUP}\n${USER}、${room} not-an-id`)).toEqual([USER, GROUP, room]);
    expect(parseNotifyTargets("Ushort")).toEqual([]);
  });

  it("masks the phone and includes the order fields staff need", () => {
    const text = staffOrderMessage("已付款", order());
    expect(maskPhone("0912345678")).toBe("0912***678");
    expect(text).toContain("訂單編號 RD2511250001");
    expect(text).toContain("NT$ 1,070");
    expect(text).toContain("測試上衣 藍 / M × 2");
    expect(text).toContain("配送 宅配");
    expect(text).toContain("王小明 0912***678");
    expect(text).toContain("/admin/orders");
    expect(text).not.toContain("0912345678");
    expect(text).not.toContain("南京東路");
  });
});

describe("webhook and payment notification idempotency", () => {
  beforeAll(async () => {
    const { mutate } = await import("@/lib/store");
    await mutate((store) => {
      store.settings.messagingToken = "token";
      store.settings.messagingChannelSecret = SECRET;
      store.settings.notifyTo = USER;
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
        variants: [{ id: "var_m", color: "藍", size: "M", hex: "#3d5f8a", sku: "", stock: 8, price: null }],
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
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? ""), auth: String(init?.headers && (init.headers as Record<string, string>).Authorization || "") });
      return new Response("{}", { status: 200 });
    });
  }

  it("rejects a bad webhook signature and does not store the sender", async () => {
    mockFetch();
    const body = JSON.stringify({
      events: [{ type: "message", replyToken: "r1", source: { type: "user", userId: GROUP.replace("C", "U") }, message: { type: "text", text: "綁定通知" } }],
    });
    const { POST } = await import("@/app/api/line/webhook/route");
    const denied = await POST(new Request("https://shop.example/api/line/webhook", { method: "POST", body, headers: { "x-line-signature": "bad" } }));
    expect(denied.status).toBe(401);
    const { getStore } = await import("@/lib/store");
    expect((await getStore()).settings.pendingNotifies).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("stores a bind request for approval and replies without putting it in notifyTo", async () => {
    mockFetch();
    const body = JSON.stringify({
      events: [
        { type: "message", replyToken: "r2", source: { type: "group", groupId: GROUP, userId: USER }, message: { type: "text", text: " 綁定通知 " } },
        { type: "message", replyToken: "no", source: { type: "user", userId: USER }, message: { type: "text", text: "你好" } },
      ],
    });
    const { POST } = await import("@/app/api/line/webhook/route");
    const ok = await POST(new Request("https://shop.example/api/line/webhook", {
      method: "POST",
      body,
      headers: { "x-line-signature": sign(body) },
    }));
    expect(ok.status).toBe(200);
    const { getStore } = await import("@/lib/store");
    const settings = (await getStore()).settings;
    expect(settings.notifyTo).toBe(USER);
    expect(settings.pendingNotifies.map((item) => item.id)).toEqual([GROUP]);
    expect(settings.pendingNotifies[0]?.kind).toBe("group");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain("/message/reply");
    expect(calls[0]?.body).toContain("核准");
    expect(calls[0]?.auth).toBe("Bearer token");
    expect(calls[0]?.body).not.toContain(SECRET);
  });

  it("pushes a new online order once, then a paid alert once across NewebPay retries", async () => {
    mockFetch();
    const { placeOrder, beginPayment, applyPaymentNotice } = await import("@/lib/orders");
    const phone = "0912000111";
    const placed = await placeOrder({
      lines: [{ productId: "prd_1", variantId: "var_m", qty: 1 }],
      recipient: "王小明",
      phone,
      email: "line@example.com",
      address: "台北市中山區南京東路一段1號",
      fulfillment: "delivery",
      payment: "online",
      pickupPointId: "",
      note: "",
      idempotencyKey: `line-${randomBytes(4).toString("hex")}`,
      identity: { lineUserId: "", lineName: "王小明", lineId: "", verified: false, phone },
    });
    if (!placed.ok) throw new Error(placed.error);
    expect((await beginPayment(placed.order.code)).ok).toBe(true);
    const notice = {
      success: true,
      status: "SUCCESS",
      message: "",
      code: placed.order.code,
      merchantOrderNo: `${placed.order.code}_1`,
      tradeNo: "LINEPAY1",
      amt: placed.order.total,
      paymentType: "CREDIT",
      wallet: "",
      payTime: "2026-11-16 22:00:00",
      bankCode: "",
      codeNo: "",
      expireDate: "",
      store: null,
    };
    expect((await applyPaymentNotice(notice)).kind).toBe("confirmed");
    expect((await applyPaymentNotice(notice)).kind).toBe("duplicate");
    const paid = calls.filter((call) => call.url.endsWith("/message/push") && call.body.includes("已付款"));
    const opened = calls.filter((call) => call.url.endsWith("/message/push") && call.body.includes("待付款"));
    expect(opened).toHaveLength(1);
    expect(paid).toHaveLength(1);
    expect(paid[0]?.body).toContain(placed.order.code);
    expect(paid[0]?.body).toContain("0912***111");
    expect(paid[0]?.body).not.toContain(phone);
    expect(paid[0]?.body).toContain("測試上衣 藍 / M × 1");

    const second = await placeOrder({
      lines: [{ productId: "prd_1", variantId: "var_m", qty: 1 }],
      recipient: "王小明",
      phone: "0912000222",
      email: "fail@example.com",
      address: "台北市中山區南京東路一段1號",
      fulfillment: "delivery",
      payment: "online",
      pickupPointId: "",
      note: "",
      idempotencyKey: `line-fail-${randomBytes(4).toString("hex")}`,
      identity: { lineUserId: "", lineName: "王小明", lineId: "", verified: false, phone: "0912000222" },
    });
    if (!second.ok) throw new Error(second.error);
    expect((await beginPayment(second.order.code)).ok).toBe(true);
    calls.length = 0;
    const failed = {
      ...notice,
      success: false,
      status: "TRA10031",
      tradeNo: "LINEFAIL",
      code: second.order.code,
      merchantOrderNo: `${second.order.code}_1`,
      amt: second.order.total,
    };
    expect((await applyPaymentNotice(failed)).kind).toBe("failed");
    expect((await applyPaymentNotice(failed)).kind).toBe("failed");
    expect(calls.filter((call) => call.body.includes("付款未成功"))).toHaveLength(1);
    const { getStore } = await import("@/lib/store");
    const saved = await getStore();
    expect(saved.orders.find((item) => item.code === placed.order.code)?.status).toBe("paid");
    expect(saved.orders.find((item) => item.code === second.order.code)?.status).toBe("pending");
  });
});
