import { z } from "zod";
import { cleanNote, cleanPersonName, normalizeTaiwanPhone } from "./phone";
import type { Fulfillment } from "./types";

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
    address: z.string().trim().max(200).optional().default(""),
    note: z.string().max(300).optional().default(""),
    fulfillment: z.enum(["delivery", "pickup"]).optional().default("delivery"),
    pickupPointId: z.string().trim().max(80).optional().default(""),
    idempotencyKey: z.string().trim().regex(/^[A-Za-z0-9_-]{8,80}$/),
  })
  .strict();

export type CheckoutBody = {
  items: { productId: string; variantId: string; qty: number }[];
  recipient: string;
  phone: string;
  address: string;
  note: string;
  fulfillment: Fulfillment;
  pickupPointId: string;
  idempotencyKey: string;
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
  const phone = normalizeTaiwanPhone(parsed.data.phone);
  if (!phone) return { ok: false, error: "請填寫有效的台灣電話，例如 0912345678" };
  const fulfillment = parsed.data.fulfillment;
  const address = cleanNote(parsed.data.address, 200);
  if (fulfillment === "delivery" && address.length < 6) return { ok: false, error: "請填寫完整收件地址" };
  if (fulfillment === "pickup" && !parsed.data.pickupPointId) return { ok: false, error: "請選擇自取地點" };
  return {
    ok: true,
    data: {
      ...parsed.data,
      recipient,
      phone,
      address,
      note: cleanNote(parsed.data.note, 300),
      fulfillment,
    },
  };
}

/**
 * Identity comes only from the verified LINE session.
 * Client-supplied lineName / lineId / lineUserId are ignored.
 * When LINE Login is not configured, checkout is a guest order keyed by phone.
 */
export function resolveCheckoutIdentity(input: {
  loginRequired: boolean;
  session: { userId: string; name: string } | null;
  recipient: string;
  phone: string;
}): { ok: true; identity: CheckoutIdentity } | { ok: false; error: string; status: number } {
  if (input.loginRequired && !input.session) {
    return { ok: false, error: "請先使用 LINE 登入", status: 401 };
  }
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
