import { describe, expect, it } from "vitest";
import {
  aesDecrypt,
  aesEncrypt,
  buildCheckoutPayload,
  codeFromMerchantOrderNo,
  newebpayConfig,
  paymentOptions,
  paymentSite,
  parsePaymentNotice,
  tradeSha,
  type NewebpayConfig,
} from "@/lib/newebpay";
import { optionsAllow, paymentAllowed } from "@/lib/payment";
import { parseCheckoutBody } from "@/lib/checkout";
import { DEFAULT_CVS_FEE, shippingFor } from "@/lib/pricing";

const config: NewebpayConfig = {
  merchantId: "MS123456789",
  hashKey: "12345678901234567890123456789012",
  hashIV: "1234567890123456",
  sandbox: true,
  card: true,
  applePay: true,
  cvs: true,
};

function form(fields: Record<string, string>) {
  return { get: (name: string) => fields[name] ?? null };
}

function signedNotice(body: unknown, overrides: Record<string, string> = {}) {
  const tradeInfo = aesEncrypt(JSON.stringify(body), config.hashKey, config.hashIV);
  return form({
    Status: "SUCCESS",
    MerchantID: config.merchantId,
    TradeInfo: tradeInfo,
    TradeSha: tradeSha(tradeInfo, config.hashKey, config.hashIV),
    Version: "2.0",
    ...overrides,
  });
}

describe("newebpay crypto", () => {
  it("matches the SHA-256 example in the NewebPay manual", () => {
    expect(tradeSha("AAAABBBBCCCCDDDD", "12345678901234567890123456789012", "12345678")).toBe(
      "5C6C504A2F2B2E3EB5CA80998F626307ACD327AC6DCE4FF84F86B021988B2576"
    );
  });

  it("round-trips AES-256-CBC as hex, including Chinese text", () => {
    const text = "MerchantOrderNo=RD2611160001_1&ItemDesc=Radiant 訂單";
    const hex = aesEncrypt(text, config.hashKey, config.hashIV);
    expect(hex).toMatch(/^[0-9a-f]+$/);
    expect(aesDecrypt(hex, config.hashKey, config.hashIV)).toBe(text);
  });

  it("rejects ciphertext that is not hex", () => {
    expect(() => aesDecrypt("not hex", config.hashKey, config.hashIV)).toThrow();
  });
});

describe("newebpay configuration", () => {
  const env = {
    NEWEBPAY_MERCHANT_ID: "MS1",
    NEWEBPAY_HASH_KEY: "k".repeat(32),
    NEWEBPAY_HASH_IV: "i".repeat(16),
  };

  it("stays off without all credentials or with wrong key lengths", () => {
    expect(newebpayConfig({})).toBeNull();
    expect(newebpayConfig({ ...env, NEWEBPAY_HASH_KEY: "short" })).toBeNull();
    expect(paymentOptions({})).toEqual({ card: false, applePay: false, cvs: false });
  });

  it("defaults to sandbox, card + Apple Pay and convenience-store pickup", () => {
    const parsed = newebpayConfig(env);
    expect(parsed).toMatchObject({ sandbox: true, card: true, applePay: true, cvs: true });
    expect(newebpayConfig({ ...env, NEWEBPAY_ENV: "production" })?.sandbox).toBe(false);
  });

  it("lets staff switch off Apple Pay or convenience-store pickup until approved", () => {
    expect(paymentOptions({ ...env, NEWEBPAY_METHODS: "credit" })).toEqual({ card: true, applePay: false, cvs: true });
    expect(paymentOptions({ ...env, NEWEBPAY_CVS: "off" })).toMatchObject({ cvs: false });
    expect(paymentOptions({ ...env, NEWEBPAY_METHODS: "" })).toMatchObject({ card: false });
  });
});

function decodeTradeInfo(payload: ReturnType<typeof buildCheckoutPayload>): URLSearchParams {
  expect(payload.fields.TradeSha).toBe(tradeSha(payload.fields.TradeInfo, config.hashKey, config.hashIV));
  return new URLSearchParams(aesDecrypt(payload.fields.TradeInfo, config.hashKey, config.hashIV));
}

describe("MPG request", () => {
  const base = "https://shop.example.com";

  it("sends only card flags for an online delivery order", () => {
    const payload = buildCheckoutPayload(config, { code: "RD2611160001", total: 1580, paymentMethod: "online", fulfillment: "delivery" }, 1, 1_700_000_000_000, base);
    expect(payload.action).toBe("https://ccore.newebpay.com/MPG/mpg_gateway");
    const params = decodeTradeInfo(payload);
    expect(params.get("MerchantOrderNo")).toBe("RD2611160001_1");
    expect(params.get("Amt")).toBe("1580");
    expect(params.get("CREDIT")).toBe("1");
    expect(params.get("APPLEPAY")).toBe("1");
    expect(params.get("CVSCOM")).toBeNull();
    expect(params.get("ReturnURL")).toBe(`${base}/api/pay/return`);
    expect(params.get("NotifyURL")).toBe(`${base}/api/pay/notify`);
    expect(params.get("TimeStamp")).toBe("1700000000");
  });

  it("omits Apple Pay when it is not enabled and uses the production gateway", () => {
    const payload = buildCheckoutPayload({ ...config, applePay: false, sandbox: false }, { code: "RD2611160001", total: 500, paymentMethod: "online", fulfillment: "pickup" }, 2, Date.now(), base);
    expect(payload.action).toBe("https://core.newebpay.com/MPG/mpg_gateway");
    const params = decodeTradeInfo(payload);
    expect(params.get("APPLEPAY")).toBeNull();
    expect(params.get("MerchantOrderNo")).toBe("RD2611160001_2");
  });

  it("sends only CVSCOM=2 for pay-at-pickup, never mixed with card flags", () => {
    const params = decodeTradeInfo(buildCheckoutPayload(config, { code: "RD2611160002", total: 1065, paymentMethod: "cod", fulfillment: "cvs" }, 1, Date.now(), base));
    expect(params.get("CVSCOM")).toBe("2");
    expect(params.get("CREDIT")).toBeNull();
    expect(params.get("APPLEPAY")).toBeNull();
    expect(params.get("CustomerURL")).toBe(`${base}/api/pay/return`);
  });

  it("adds CVSCOM=1 to a prepaid convenience-store order", () => {
    const params = decodeTradeInfo(buildCheckoutPayload(config, { code: "RD2611160003", total: 1065, paymentMethod: "online", fulfillment: "cvs" }, 1, Date.now(), base));
    expect(params.get("CVSCOM")).toBe("1");
    expect(params.get("CREDIT")).toBe("1");
  });

  it("refuses a site URL that NewebPay would truncate", () => {
    expect(() => paymentSite("RD1", "https://a-very-long-domain-name-for-a-small-shop.example.com")).toThrow();
  });
});

describe("payment notices", () => {
  const result = { MerchantID: config.merchantId, Amt: 1580, TradeNo: "26111612345678901", MerchantOrderNo: "RD2611160001_2", PaymentType: "CREDIT", PayTime: "2026-11-16 22:10:00" };

  it("accepts a correctly signed notice and extracts the order code", () => {
    const parsed = parsePaymentNotice(config, signedNotice({ Status: "SUCCESS", Message: "授權成功", Result: result }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.notice).toMatchObject({ success: true, code: "RD2611160001", amt: 1580, tradeNo: "26111612345678901", paymentType: "CREDIT" });
    expect(parsed.notice.store).toBeNull();
    expect(codeFromMerchantOrderNo("RD2611160001_2")).toBe("RD2611160001");
  });

  it("rejects a forged signature, a swapped payload, and another merchant", () => {
    const good = signedNotice({ Status: "SUCCESS", Result: result });
    const other = aesEncrypt(JSON.stringify({ Status: "SUCCESS", Result: { ...result, Amt: 1 } }), config.hashKey, config.hashIV);
    expect(parsePaymentNotice(config, signedNotice({ Status: "SUCCESS", Result: result }, { TradeSha: "0".repeat(64) }))).toEqual({ ok: false, reason: "signature" });
    expect(parsePaymentNotice(config, form({ Status: "SUCCESS", TradeInfo: other, TradeSha: String(good.get("TradeSha")) }))).toEqual({ ok: false, reason: "signature" });
    expect(parsePaymentNotice(config, signedNotice({ Status: "SUCCESS", Result: { ...result, MerchantID: "MS999" } }))).toEqual({ ok: false, reason: "merchant" });
    expect(parsePaymentNotice(config, form({}))).toEqual({ ok: false, reason: "missing" });
  });

  it("treats a failed payment as not successful", () => {
    const parsed = parsePaymentNotice(config, signedNotice({ Status: "TRA10031", Message: "授權失敗", Result: result }));
    expect(parsed.ok && parsed.notice.success).toBe(false);
  });

  it("reads store details for convenience-store orders", () => {
    const parsed = parsePaymentNotice(
      config,
      signedNotice({
        Status: "SUCCESS",
        Result: { ...result, PayTime: undefined, PaymentType: "CVSCOM", StoreCode: "131386", StoreName: "光輝", StoreType: "全家", StoreAddr: "台北市信義區", CVSCOMName: "王小明", CVSCOMPhone: "0912345678", LgsNo: "F1234567890" },
      })
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.notice.payTime).toBe("");
    expect(parsed.notice.store).toMatchObject({ storeCode: "131386", storeType: "全家", pickupName: "王小明", lgsNo: "F1234567890" });
  });
});

describe("payment rules", () => {
  it("only allows pay-at-pickup with convenience-store delivery", () => {
    expect(paymentAllowed("cvs", "cod")).toBe(true);
    expect(paymentAllowed("cvs", "line")).toBe(false);
    expect(paymentAllowed("delivery", "cod")).toBe(false);
    expect(paymentAllowed("pickup", "cod")).toBe(false);
    expect(paymentAllowed("delivery", "online")).toBe(true);
    expect(paymentAllowed("delivery", "line")).toBe(true);
  });

  it("follows what is switched on", () => {
    const off = { card: false, applePay: false, cvs: false };
    expect(optionsAllow(off, "delivery", "online")).toBe(false);
    expect(optionsAllow(off, "delivery", "line")).toBe(true);
    expect(optionsAllow(off, "cvs", "cod")).toBe(false);
    expect(optionsAllow({ card: true, applePay: false, cvs: true }, "cvs", "cod")).toBe(true);
    expect(optionsAllow({ card: false, applePay: false, cvs: true }, "cvs", "online")).toBe(false);
  });

  it("parses checkout bodies for each fulfillment and rejects bad combinations", () => {
    const base = { items: [{ productId: "p", variantId: "v", qty: 1 }], recipient: "王小明", phone: "0912345678", idempotencyKey: "abcdefgh12" };
    const cvs = parseCheckoutBody({ ...base, fulfillment: "cvs", payment: "cod" });
    expect(cvs.ok && cvs.data.address).toBe("");
    expect(parseCheckoutBody({ ...base, fulfillment: "cvs", payment: "line" }).ok).toBe(false);
    expect(parseCheckoutBody({ ...base, fulfillment: "delivery", payment: "cod", address: "台北市中山區南京東路一段1號" }).ok).toBe(false);
    expect(parseCheckoutBody({ ...base, fulfillment: "delivery", payment: "online", address: "台北市中山區南京東路一段1號" }).ok).toBe(true);
    expect(parseCheckoutBody({ ...base, fulfillment: "delivery" }).ok).toBe(false);
  });
});

describe("convenience-store shipping", () => {
  const settings = { shippingFee: 70, cvsShippingFee: DEFAULT_CVS_FEE, freeShippingThreshold: 2000 };

  it("charges the store fee below 2000 and nothing at 2000", () => {
    expect(DEFAULT_CVS_FEE).toBe(65);
    expect(shippingFor(1999, settings, "cvs")).toBe(65);
    expect(shippingFor(2000, settings, "cvs")).toBe(0);
    expect(shippingFor(1999, settings, "delivery")).toBe(70);
  });
});
