import { createCipheriv, createDecipheriv, createHash, timingSafeEqual } from "crypto";
import { publicSiteUrl } from "./site";
import { CVS_MAX_TOTAL, CVS_MIN_TOTAL, NO_PAYMENT_OPTIONS, VACC_MAX_TOTAL, type PaymentOptions } from "./payment";
import type { CvsInfo, Order } from "./types";

if (typeof window !== "undefined") {
  throw new Error("lib/newebpay.ts is server-only");
}

export type NewebpayConfig = {
  merchantId: string;
  hashKey: string;
  hashIV: string;
  sandbox: boolean;
  credit: boolean;
  applePay: boolean;
  googlePay: boolean;
  linePay: boolean;
  webatm: boolean;
  vacc: boolean;
  cvsCode: boolean;
  cvs: boolean;
  expireDays: number;
};

type Env = Record<string, string | undefined>;

function methodSet(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "credit,applepay")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function expireDaysOf(raw: string | undefined): number {
  const parsed = Number((raw ?? "").trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return 3;
  return Math.min(180, Math.max(1, Math.floor(parsed)));
}

/**
 * Credentials live only in environment variables. Without all three (and the
 * correct key lengths) the shop keeps working without the card gateway.
 */
export function newebpayConfig(env: Env = process.env): NewebpayConfig | null {
  const merchantId = (env.NEWEBPAY_MERCHANT_ID ?? "").trim();
  const hashKey = (env.NEWEBPAY_HASH_KEY ?? "").trim();
  const hashIV = (env.NEWEBPAY_HASH_IV ?? "").trim();
  if (!merchantId || hashKey.length !== 32 || hashIV.length !== 16) return null;
  const methods = methodSet(env.NEWEBPAY_METHODS);
  return {
    merchantId,
    hashKey,
    hashIV,
    sandbox: (env.NEWEBPAY_ENV ?? "").trim().toLowerCase() !== "production",
    credit: methods.has("credit"),
    applePay: methods.has("applepay"),
    googlePay: methods.has("googlepay") || methods.has("google"),
    linePay: methods.has("linepay") || methods.has("line"),
    webatm: methods.has("webatm"),
    vacc: methods.has("vacc") || methods.has("atm"),
    cvsCode: methods.has("cvs") || methods.has("cvscode"),
    cvs: (env.NEWEBPAY_CVS ?? "on").trim().toLowerCase() !== "off",
    expireDays: expireDaysOf(env.NEWEBPAY_EXPIRE_DAYS),
  };
}

export function paymentOptions(env: Env = process.env): PaymentOptions {
  const config = newebpayConfig(env);
  if (!config) return NO_PAYMENT_OPTIONS;
  return {
    credit: config.credit,
    applePay: config.applePay,
    googlePay: config.googlePay,
    linePay: config.linePay,
    webatm: config.webatm,
    vacc: config.vacc,
    cvsCode: config.cvsCode,
    cvs: config.cvs,
  };
}

export function gatewayUrl(config: NewebpayConfig): string {
  return config.sandbox ? "https://ccore.newebpay.com/MPG/mpg_gateway" : "https://core.newebpay.com/MPG/mpg_gateway";
}

/** AES-256-CBC, PKCS7, lowercase hex. HashKey is the 32-byte key and HashIV the 16-byte IV. */
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

/** Older merchant panels still truncate these at 50. The current manual allows 200; we keep 50 so a long origin fails here. */
const URL_LIMIT = 50;

export function paymentSite(code: string, base = publicSiteUrl()): PaymentSite {
  const returnUrl = `${base}/api/pay/return`;
  const notifyUrl = `${base}/api/pay/notify`;
  const orderUrl = `${base}/order/${code}`;
  const listUrl = `${base}/orders`;
  const backUrl = orderUrl.length <= URL_LIMIT ? orderUrl : listUrl;
  if (returnUrl.length > URL_LIMIT || notifyUrl.length > URL_LIMIT || backUrl.length > URL_LIMIT) {
    throw new Error("NEXT_PUBLIC_SITE_URL is too long for NewebPay (ReturnURL and NotifyURL are limited to 50 characters)");
  }
  return { returnUrl, notifyUrl, backUrl };
}

/** Ymd in Asia/Taipei, `days` after today. NewebPay ExpireDate for ATM and CVS codes. */
export function expireDateYmd(days: number, now = Date.now()): string {
  const clamped = Math.min(180, Math.max(1, Math.floor(days) || 3));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
  const [year, month, day] = today.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + clamped);
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/** 23:59:59 Asia/Taipei on yyyy-mm-dd, as an ISO timestamp. Unparseable dates fall back to three days. */
export function voucherDeadline(expireDate: string, now = Date.now()): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expireDate.trim());
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 15, 59, 59)).toISOString();
  }
  return new Date(now + 3 * 24 * 3600_000).toISOString();
}

export class PaymentRequestError extends Error {}

export type CheckoutPayload = { action: string; fields: Record<string, string> };

function itemDesc(code: string): string {
  return `Radiant 訂單 ${code}`.replace(/[\r\n'"]/g, "").slice(0, 50);
}

/**
 * One MPG request per attempt. Amount, email and order number come from the
 * stored order. Card / wallet / ATM / CVS-code flags follow the server env.
 * Pay-at-pickup sends only CVSCOM=2. Prepaid pickup adds CVSCOM=1.
 */
export function buildCheckoutPayload(
  config: NewebpayConfig,
  order: Pick<Order, "code" | "total" | "email" | "paymentMethod" | "fulfillment">,
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
    ItemDesc: itemDesc(order.code),
    ReturnURL: site.returnUrl,
    NotifyURL: site.notifyUrl,
    ClientBackURL: site.backUrl,
    LoginType: 0,
  };
  if (order.email) {
    params.Email = order.email;
    params.EmailModify = 0;
  }
  if (order.paymentMethod === "cod") {
    params.CVSCOM = 2;
    params.CustomerURL = site.returnUrl;
  } else {
    let instruments = 0;
    if (config.credit) {
      params.CREDIT = 1;
      instruments += 1;
    }
    if (config.applePay) {
      params.APPLEPAY = 1;
      instruments += 1;
    }
    if (config.googlePay) {
      params.ANDROIDPAY = 1;
      instruments += 1;
    }
    if (config.linePay) {
      params.LINEPAY = 1;
      instruments += 1;
    }
    if (config.webatm && order.total <= VACC_MAX_TOTAL) {
      params.WEBATM = 1;
      instruments += 1;
    }
    if (config.vacc && order.total <= VACC_MAX_TOTAL) {
      params.VACC = 1;
      instruments += 1;
    }
    if (config.cvsCode && order.total >= CVS_MIN_TOTAL && order.total <= CVS_MAX_TOTAL) {
      params.CVS = 1;
      instruments += 1;
    }
    if (order.fulfillment === "cvs") params.CVSCOM = 1;
    if (!instruments) {
      throw new PaymentRequestError("此訂單金額無法使用目前開啟的付款方式，請聯絡店家");
    }
    if (params.VACC || params.CVS) {
      params.ExpireDate = expireDateYmd(config.expireDays, now);
      params.CustomerURL = site.returnUrl;
    }
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
  /** PaymentMethod when NewebPay reports a wallet under a card charge. */
  wallet: string;
  /** Empty for a COD order or an ATM/CVS number that is not paid yet. */
  payTime: string;
  bankCode: string;
  codeNo: string;
  /** yyyy-mm-dd from a 取號 notice. */
  expireDate: string;
  store: Partial<CvsInfo> | null;
};

const OFFLINE_TYPES = new Set(["VACC", "CVS", "BARCODE"]);

/** ATM / CVS code / barcode: SUCCESS without PayTime means the number was issued, not that money arrived. */
export function isVoucherNotice(notice: Pick<PaymentNotice, "success" | "paymentType" | "payTime">): boolean {
  return notice.success && OFFLINE_TYPES.has(notice.paymentType.toUpperCase()) && !notice.payTime;
}

export function noticePayType(notice: Pick<PaymentNotice, "paymentType" | "wallet">): string {
  const wallet = notice.wallet.toUpperCase();
  if (wallet === "APPLEPAY" || wallet === "GOOGLEPAY" || wallet === "SAMSUNGPAY" || wallet === "LINEPAY") return wallet;
  return notice.paymentType;
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parsePlain(plain: string): { status: string; message: string; result: Record<string, unknown> } | null {
  const trimmed = plain.trim().replace(/^\uFEFF/, "");
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    let body: unknown;
    try {
      body = JSON.parse(trimmed);
    } catch {
      return null;
    }
    const record = asRecord(body);
    if (!record) return null;
    return { status: text(record.Status), message: text(record.Message), result: asRecord(record.Result) ?? {} };
  }
  const params = new URLSearchParams(trimmed);
  const result: Record<string, unknown> = {};
  for (const [key, value] of params.entries()) result[key] = value;
  return { status: text(result.Status), message: text(result.Message), result };
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

  let parsed: { status: string; message: string; result: Record<string, unknown> } | null;
  try {
    parsed = parsePlain(aesDecrypt(tradeInfo, config.hashKey, config.hashIV));
  } catch {
    return { ok: false, reason: "decrypt" };
  }
  if (!parsed) return { ok: false, reason: "decrypt" };
  const result = parsed.result;
  const resultMerchant = text(result.MerchantID);
  if (!resultMerchant || resultMerchant !== config.merchantId) return { ok: false, reason: "merchant" };

  const amtRaw = text(result.Amt);
  if (!/^\d+$/.test(amtRaw)) return { ok: false, reason: "amount" };
  const orderNo = text(result.MerchantOrderNo);
  const code = codeFromMerchantOrderNo(orderNo);
  if (!/^[A-Za-z0-9]{4,24}$/.test(code)) return { ok: false, reason: "order" };

  const hasStore = Boolean(text(result.StoreCode) || text(result.LgsNo));
  const barcodes = [text(result.Barcode_1), text(result.Barcode_2), text(result.Barcode_3)].filter(Boolean).join(" ");
  const status = parsed.status || text(form.get("Status"));
  return {
    ok: true,
    notice: {
      success: status === "SUCCESS",
      status,
      message: parsed.message,
      merchantOrderNo: orderNo,
      code,
      amt: Number(amtRaw),
      tradeNo: text(result.TradeNo).slice(0, 30),
      paymentType: text(result.PaymentType).slice(0, 20),
      wallet: text(result.PaymentMethod).slice(0, 20),
      payTime: text(result.PayTime).slice(0, 30),
      bankCode: text(result.BankCode).slice(0, 10),
      codeNo: (text(result.CodeNo) || barcodes).slice(0, 80),
      expireDate: text(result.ExpireDate).slice(0, 10),
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
