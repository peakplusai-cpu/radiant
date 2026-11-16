import { z } from "zod";
import { cleanEmail, cleanNote, cleanPersonName, normalizeTaiwanMobile } from "./phone";
import { paymentAllowed } from "./payment";
import type { Fulfillment, PaymentMethod } from "./types";

const bodySchema = z
  .object({
    items: z
      .array(
        z.object({
          productId: z.string().trim().min(1).max(80),
          variantId: z.string().trim().min(1).max(80),
          qty: z.coerce.number().int().min(1).max(99),
        })
      )
      .min(1)
      .max(50),
    recipient: z.string().trim().min(1).max(40),
    phone: z.string().trim().min(1).max(30),
    email: z.string().trim().max(80).optional().default(""),
    address: z.string().trim().max(200).optional().default(""),
    note: z.string().max(300).optional().default(""),
    fulfillment: z.enum(["delivery", "pickup", "cvs"]).optional().default("delivery"),
    payment: z.enum(["line", "online", "cod"]).optional().default("line"),
    pickupPointId: z.string().trim().max(80).optional().default(""),
    idempotencyKey: z.string().trim().regex(/^[A-Za-z0-9_-]{8,80}$/),
    coupon: z.string().trim().max(40).optional().default(""),
    guestToken: z.string().trim().max(80).optional().default(""),
    shownPromoIds: z.array(z.string().trim().min(1).max(80)).max(10).optional().default([]),
  })
  .strict();

export type CheckoutBody = {
  items: { productId: string; variantId: string; qty: number }[];
  recipient: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  fulfillment: Fulfillment;
  payment: PaymentMethod;
  pickupPointId: string;
  idempotencyKey: string;
  coupon: string;
  guestToken: string;
  shownPromoIds: string[];
};

export type CheckoutIdentity = {
  lineUserId: string;
  lineName: string;
  lineId: string;
  verified: boolean;
  phone: string;
};

export function parseCheckoutBody(input: unknown): { ok: true; data: CheckoutBody } | { ok: false; error: string } {
  const parsed = bodySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "請檢查姓名、電話、地址與商品是否填寫正確" };
  const recipient = cleanPersonName(parsed.data.recipient);
  if (!recipient) return { ok: false, error: "請填寫收件人姓名" };
  const phone = normalizeTaiwanMobile(parsed.data.phone);
  if (!phone) return { ok: false, error: "請填寫有效的台灣手機，例如 0912345678" };
  const email = cleanEmail(parsed.data.email);
  if (!email) return { ok: false, error: "請填寫有效的 Email，以便寄送收據" };
  const fulfillment = parsed.data.fulfillment;
  const address = cleanNote(parsed.data.address, 200);
  if (fulfillment === "delivery" && address.length < 6) return { ok: false, error: "請填寫完整收件地址" };
  if (fulfillment === "pickup" && !parsed.data.pickupPointId) return { ok: false, error: "請選擇自取地點" };
  if (!paymentAllowed(fulfillment, parsed.data.payment)) return { ok: false, error: "這個取貨方式不能使用所選的付款方式" };
  return {
    ok: true,
    data: {
      ...parsed.data,
      recipient,
      phone,
      email,
      address: fulfillment === "delivery" ? address : "",
      pickupPointId: fulfillment === "pickup" ? parsed.data.pickupPointId : "",
      note: cleanNote(parsed.data.note, 300),
      fulfillment,
    },
  };
}

/**
 * LINE is optional. A signed-in session is attached when the browser already
 * has one; otherwise the order is a guest keyed by phone. Client-supplied
 * line ids are never read.
 */
export function resolveCheckoutIdentity(input: {
  session: { userId: string; name: string } | null;
  recipient: string;
  phone: string;
}): { ok: true; identity: CheckoutIdentity } {
  if (input.session?.userId) {
    const name = cleanPersonName(input.session.name) ?? input.recipient;
    return {
      ok: true,
      identity: { lineUserId: input.session.userId, lineName: name, lineId: "", verified: true, phone: input.phone },
    };
  }
  return {
    ok: true,
    identity: { lineUserId: "", lineName: input.recipient, lineId: "", verified: false, phone: input.phone },
  };
}
