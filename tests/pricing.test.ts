import { describe, expect, it } from "vitest";
import { DEFAULT_FREE_SHIPPING, DEFAULT_SHIPPING_FEE, shippingFor } from "@/lib/pricing";

describe("shipping", () => {
  const settings = { shippingFee: DEFAULT_SHIPPING_FEE, freeShippingThreshold: DEFAULT_FREE_SHIPPING };

  it("uses 70 and free shipping at 2000", () => {
    expect(DEFAULT_SHIPPING_FEE).toBe(70);
    expect(DEFAULT_FREE_SHIPPING).toBe(2000);
    expect(shippingFor(1999, settings, "delivery")).toBe(70);
    expect(shippingFor(2000, settings, "delivery")).toBe(0);
    expect(shippingFor(5000, settings, "pickup")).toBe(0);
  });
});
