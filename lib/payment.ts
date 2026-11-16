import type { Fulfillment, Order, PaymentMethod } from "./types";

/** Unpaid online / COD orders keep their stock for this long. */
export const HOLD_MINUTES = 30;
/** Never extend a hold beyond this after the order was created. */
export const MAX_HOLD_MINUTES = 120;
/** NewebPay shows 超商取貨 only between 30 and 20,000. */
export const CVS_MIN_TOTAL = 30;
export const CVS_MAX_TOTAL = 20000;

export type PaymentOptions = {
  /** Credit card / Apple Pay on NewebPay. */
  card: boolean;
  applePay: boolean;
  /** 超商店到店 (pay at pickup, or prepaid pickup). */
  cvs: boolean;
};

export const NO_PAYMENT_OPTIONS: PaymentOptions = { card: false, applePay: false, cvs: false };

export function paymentAllowed(fulfillment: Fulfillment, payment: PaymentMethod): boolean {
  if (fulfillment === "cvs") return payment === "online" || payment === "cod";
  return payment === "line" || payment === "online";
}

export function optionsAllow(options: PaymentOptions, fulfillment: Fulfillment, payment: PaymentMethod): boolean {
  if (!paymentAllowed(fulfillment, payment)) return false;
  if (fulfillment === "cvs" && !options.cvs) return false;
  if (payment === "online") return options.card;
  if (payment === "cod") return options.cvs;
  return true;
}

export function paymentLabel(payment: PaymentMethod, fulfillment?: Fulfillment): string {
  if (payment === "cod") return "超商取貨付款";
  if (payment === "online") return fulfillment === "cvs" ? "信用卡／Apple Pay（超商取貨不付款）" : "信用卡／Apple Pay";
  return "LINE 確認付款";
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
