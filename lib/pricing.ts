import type { Fulfillment } from "./types";

/** Defaults for a new shop. Existing stores keep the fees saved in settings. */
export const DEFAULT_SHIPPING_FEE = 70;
export const DEFAULT_CVS_FEE = 65;
export const DEFAULT_FREE_SHIPPING = 2000;

export function shippingFor(
  subtotal: number,
  settings: { shippingFee: number; freeShippingThreshold: number; cvsShippingFee?: number },
  fulfillment: Fulfillment
): number {
  if (fulfillment === "pickup" || subtotal <= 0) return 0;
  const threshold = settings.freeShippingThreshold;
  if (threshold > 0 && subtotal >= threshold) return 0;
  const fee = fulfillment === "cvs" ? (settings.cvsShippingFee ?? DEFAULT_CVS_FEE) : settings.shippingFee;
  return Math.max(0, Math.round(fee));
}
