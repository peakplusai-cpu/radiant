import type { Fulfillment, Order, PaymentMethod } from "./types";

/** Unpaid card orders keep their stock for this long. ATM/CVS extends this to ExpireDate after 取號. */
export const HOLD_MINUTES = 30;
/** Never extend a card hold beyond this after the order was created. */
export const MAX_HOLD_MINUTES = 120;
/** NewebPay CVS code and 超商取貨 only between 30 and 20,000. */
export const CVS_MIN_TOTAL = 30;
export const CVS_MAX_TOTAL = 20000;
/** ATM and WebATM are hidden by NewebPay above this amount. */
export const VACC_MAX_TOTAL = 49999;

export type PaymentOptions = {
  credit: boolean;
  applePay: boolean;
  googlePay: boolean;
  linePay: boolean;
  webatm: boolean;
  /** ATM virtual account (VACC). */
  vacc: boolean;
  /** Convenience-store payment code (CVS), not 超商取貨物流. */
  cvsCode: boolean;
  /** 超商店到店 logistics. */
  cvs: boolean;
};

export const NO_PAYMENT_OPTIONS: PaymentOptions = {
  credit: false,
  applePay: false,
  googlePay: false,
  linePay: false,
  webatm: false,
  vacc: false,
  cvsCode: false,
  cvs: false,
};

export function onlineEnabled(options: PaymentOptions): boolean {
  return options.credit || options.applePay || options.googlePay || options.linePay || options.webatm || options.vacc || options.cvsCode;
}

export function onlineTitle(options: PaymentOptions): string {
  const parts = [
    options.credit ? "信用卡" : "",
    options.applePay ? "Apple Pay" : "",
    options.googlePay ? "Google Pay" : "",
    options.linePay ? "LINE Pay" : "",
    options.webatm ? "WebATM" : "",
    options.vacc ? "ATM" : "",
    options.cvsCode ? "超商代碼" : "",
  ].filter(Boolean);
  return parts.join("／") || "線上付款";
}

export function paymentAllowed(fulfillment: Fulfillment, payment: PaymentMethod): boolean {
  if (fulfillment === "cvs") return payment === "online" || payment === "cod";
  return payment === "line" || payment === "online";
}

export function optionsAllow(options: PaymentOptions, fulfillment: Fulfillment, payment: PaymentMethod): boolean {
  if (!paymentAllowed(fulfillment, payment)) return false;
  if (fulfillment === "cvs" && !options.cvs) return false;
  if (payment === "online") return onlineEnabled(options);
  if (payment === "cod") return options.cvs;
  return true;
}

export function paymentLabel(payment: PaymentMethod, fulfillment?: Fulfillment): string {
  if (payment === "cod") return "超商取貨付款";
  if (payment === "online") return fulfillment === "cvs" ? "線上付款（超商取貨不付款）" : "線上付款";
  return "LINE 確認付款";
}

const PAY_TYPE_LABEL: Record<string, string> = {
  CREDIT: "信用卡",
  WEBATM: "WebATM",
  VACC: "ATM 轉帳",
  CVS: "超商代碼",
  BARCODE: "超商條碼",
  APPLEPAY: "Apple Pay",
  ANDROIDPAY: "Google Pay",
  GOOGLEPAY: "Google Pay",
  SAMSUNGPAY: "Samsung Pay",
  LINEPAY: "LINE Pay",
  TAIWANPAY: "台灣 Pay",
  ESUNWALLET: "玉山 Wallet",
  CVSCOM: "超商取貨",
};

export function payTypeLabel(type: string): string {
  if (!type) return "";
  return PAY_TYPE_LABEL[type.toUpperCase()] ?? type;
}

/** True while the customer still has to finish something on NewebPay. */
export function awaitingCustomer(order: Pick<Order, "paymentMethod" | "status" | "holdUntil">): boolean {
  return order.paymentMethod !== "line" && order.status === "pending" && Boolean(order.holdUntil);
}

export function holdExpired(order: Pick<Order, "paymentMethod" | "status" | "holdUntil">, now = Date.now()): boolean {
  if (!awaitingCustomer(order)) return false;
  const until = Date.parse(order.holdUntil);
  return Number.isFinite(until) && until <= now;
}
