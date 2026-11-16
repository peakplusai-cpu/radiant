import { createCipheriv, createDecipheriv, createHash, timingSafeEqual } from "crypto";
import { publicSiteUrl } from "./site";
import { NO_PAYMENT_OPTIONS, type PaymentOptions } from "./payment";
import type { CvsInfo, Order } from "./types";

export type NewebpayConfig = {
  merchantId: string;
  hashKey: string;
  hashIV: string;
  sandbox: boolean;
  card: boolean;
  applePay: boolean;
  cvs: boolean;
};

type Env = Record<string, string | undefined>;

/**
 * Credentials live only in environment variables. Without all three (and the
 * correct key lengths) the shop keeps working in LINE-confirmation mode.
 */
export function newebpayConfig(env: Env = process.env): NewebpayConfig | null {
  const merchantId = (env.NEWEBPAY_MERCHANT_ID ?? "").trim();
  const hashKey = (env.NEWEBPAY_HASH_KEY ?? "").trim();
  const hashIV = (env.NEWEBPAY_HASH_IV ?? "").trim();
  if (!merchantId || hashKey.length !== 32 || hashIV.length !== 16) return null;
  const methods = (env.NEWEBPAY_METHODS ?? "credit,applepay")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return {
    merchantId,
    hashKey,
    hashIV,
    sandbox: (env.NEWEBPAY_ENV ?? "").trim().toLowerCase() !== "production",
    card: methods.includes("credit") || methods.includes("applepay"),
    applePay: methods.includes("applepay"),
    cvs: (env.NEWEBPAY_CVS ?? "on").trim().toLowerCase() !== "off",
  };
}

export function paymentOptions(env: Env = process.env): PaymentOptions {
  const config = newebpayConfig(env);
  if (!config) return NO_PAYMENT_OPTIONS;
  return { card: config.card, applePay: config.applePay, cvs: config.cvs };
}

export function gatewayUrl(config: NewebpayConfig): string {
  return config.sandbox ? "https://ccore.newebpay.com/MPG/mpg_gateway" : "https://core.newebpay.com/MPG/mpg_gateway";
}

export function aesEncrypt(plain: string, hashKey: string, hashIV: string): string {
  const cipher = createCipheriv("aes-256-cbc", hashKey, hashIV);
  return Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]).toString("hex");
}

export function aesDecrypt(hex: string, hashKey: string, hashIV: string): string {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 32 !== 0) throw new Error("bad ciphertext");
  const raw = Buffer.from(hex, "hex");
  try {
    const decipher = createDecipheriv("aes-256-cbc", hashKey, hashIV);
    return Buffer.concat([decipher.update(raw), decipher.final()]).toString("utf8");
  } catch {
    // Some NewebPay responses carry non-PKCS7 padding; strip trailing control bytes instead.
    const decipher = createDecipheriv("aes-256-cbc", hashKey, hashIV);
    decipher.setAutoPadding(false);
    const text = Buffer.concat([decipher.update(raw), decipher.final()]).toString("utf8");
    return text.replace(/[\u0000-\u001f]+$/, "");
  }
}

/** SHA-256 over HashKey=…&data&HashIV=…, upper-case hex (TradeSha). */
export function tradeSha(data: string, hashKey: string, hashIV: string): string {
  return createHash("sha256").update(`HashKey=${hashKey}&${data}&HashIV=${hashIV}`).digest("hex").toUpperCase();
}

function shaMatches(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual.toUpperCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

export function merchantOrderNo(code: string, attempt: number): string {
  return `${code}_${attempt}`;
}

export function codeFromMerchantOrderNo(value: string): string {
  return value.split("_")[0] ?? "";
}

export type PaymentSite = { returnUrl: string; notifyUrl: string; backUrl: string };

const URL_LIMIT = 50;

export function paymentSite(code: string, base = publicSiteUrl()): PaymentSite {
  const site = {
    returnUrl: `${base}/api/pay/return`,
    notifyUrl: `${base}/api/pay/notify`,
    backUrl: `${base}/order/${code}`,
  };
  if (site.returnUrl.length > URL_LIMIT || site.notifyUrl.length > URL_LIMIT) {
    throw new Error("NEXT_PUBLIC_SITE_URL is too long for NewebPay (ReturnURL and NotifyURL are limited to 50 characters)");
  }
  return site;
}

export type CheckoutPayload = { action: string; fields: Record<string, string> };

/**
 * One MPG request per attempt. Card / Apple Pay orders send only the card flags;
 * convenience-store pay-at-pickup sends only CVSCOM (NewebPay: 取貨付款 must not be
 * combined with other tools); prepaid pickup adds CVSCOM=1 (取貨不付款).
 */
export function buildCheckoutPayload(
  config: NewebpayConfig,
  order: Pick<Order, "code" | "total" | "paymentMethod" | "fulfillment">,
  attempt: number,
  now = Date.now(),
  base = publicSiteUrl()
): CheckoutPayload {
  const site = paymentSite(order.code, base);
  const params: Record<string, string | number> = {
    MerchantID: config.merchantId,
    RespondType: "JSON",
    TimeStamp: Math.floor(now / 1000),
    Version: "2.0",
    LangType: "zh-tw",
    MerchantOrderNo: merchantOrderNo(order.code, attempt),
    Amt: order.total,
    ItemDesc: `Radiant 訂單 ${order.code}`,
    ReturnURL: site.returnUrl,
    NotifyURL: site.notifyUrl,
    ClientBackURL: site.backUrl,
    LoginType: 0,
  };
  if (order.paymentMethod === "cod") {
    params.CVSCOM = 2;
    params.CustomerURL = site.returnUrl;
  } else {
    if (config.card) params.CREDIT = 1;
    if (config.applePay) params.APPLEPAY = 1;
    if (order.fulfillment === "cvs") params.CVSCOM = 1;
  }
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString();
  const tradeInfo = aesEncrypt(query, config.hashKey, config.hashIV);
  return {
    action: gatewayUrl(config),
    fields: {
      MerchantID: config.merchantId,
      TradeInfo: tradeInfo,
      TradeSha: tradeSha(tradeInfo, config.hashKey, config.hashIV),
      Version: "2.0",
    },
  };
}

export type PaymentNotice = {
  success: boolean;
  status: string;
  message: string;
  merchantOrderNo: string;
  code: string;
  amt: number;
  tradeNo: string;
  paymentType: string;
  /** Empty for a COD order that was only just established. */
  payTime: string;
  store: Partial<CvsInfo> | null;
};

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function parsePaymentNotice(
  config: NewebpayConfig,
  form: { get(name: string): FormDataEntryValue | null }
): { ok: true; notice: PaymentNotice } | { ok: false; reason: string } {
  const tradeInfo = text(form.get("TradeInfo"));
  const sha = text(form.get("TradeSha"));
  if (!tradeInfo || !sha) return { ok: false, reason: "missing" };
  if (!shaMatches(tradeSha(tradeInfo, config.hashKey, config.hashIV), sha)) return { ok: false, reason: "signature" };
  const merchant = text(form.get("MerchantID"));
  if (merchant && merchant !== config.merchantId) return { ok: false, reason: "merchant" };

  let body: unknown;
  try {
    body = JSON.parse(aesDecrypt(tradeInfo, config.hashKey, config.hashIV));
  } catch {
    return { ok: false, reason: "decrypt" };
  }
  if (!body || typeof body !== "object") return { ok: false, reason: "decrypt" };
  const record = body as { Status?: unknown; Message?: unknown; Result?: unknown };
  const result = (record.Result && typeof record.Result === "object" ? record.Result : {}) as Record<string, unknown>;
  const resultMerchant = text(result.MerchantID);
  if (resultMerchant && resultMerchant !== config.merchantId) return { ok: false, reason: "merchant" };

  const orderNo = text(result.MerchantOrderNo);
  const hasStore = Boolean(text(result.StoreCode) || text(result.LgsNo));
  const status = text(record.Status) || text(form.get("Status"));
  return {
    ok: true,
    notice: {
      success: status === "SUCCESS",
      status,
      message: text(record.Message),
      merchantOrderNo: orderNo,
      code: codeFromMerchantOrderNo(orderNo),
      amt: Number(result.Amt),
      tradeNo: text(result.TradeNo),
      paymentType: text(result.PaymentType),
      payTime: text(result.PayTime),
      store: hasStore
        ? {
            storeCode: text(result.StoreCode).slice(0, 20),
            storeName: text(result.StoreName).slice(0, 40),
            storeAddr: text(result.StoreAddr).slice(0, 120),
            storeType: text(result.StoreType).slice(0, 20),
            pickupName: text(result.CVSCOMName).slice(0, 40),
            pickupPhone: text(result.CVSCOMPhone).slice(0, 20),
            lgsNo: text(result.LgsNo).slice(0, 30),
          }
        : null,
    },
  };
}
