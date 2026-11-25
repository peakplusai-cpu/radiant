import { createHmac } from "crypto";
import { formatPrice, fulfillmentLabel } from "./format";
import { safeEqual } from "./session-token";
import { publicSiteUrl } from "./site";
import { variantLabel } from "./variants";
import type { Order, PendingNotify, Settings } from "./types";

const TARGET = /^[UCR][0-9a-fA-F]{32}$/;
const MAX_TARGETS = 20;

export function messagingChannelSecret(settings: Settings): string {
  return settings.messagingChannelSecret || process.env.LINE_MESSAGING_CHANNEL_SECRET || "";
}

/** HMAC-SHA256 of the raw body, Base64, compared in constant time. */
export function verifyLineSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  return safeEqual(expected, signature.trim());
}

export function isLineTarget(id: string): boolean {
  return TARGET.test(id);
}

/** User, group, and room IDs. Commas, whitespace, and fullwidth commas are separators. */
export function parseNotifyTargets(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\s,，、]+/)) {
    const id = part.trim();
    if (!TARGET.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_TARGETS) break;
  }
  return out;
}

/** 0912345678 → 0912***678. Short values become a mask. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "***";
  return `${digits.slice(0, 4)}***${digits.slice(-3)}`;
}

function deliveryLine(order: Pick<Order, "fulfillment" | "pickupPointName" | "cvs">): string {
  if (order.fulfillment === "cvs") {
    const store = [order.cvs?.storeType, order.cvs?.storeName].filter(Boolean).join(" ");
    return store ? `超商取貨 ${store}` : "超商取貨";
  }
  if (order.fulfillment === "pickup") {
    return order.pickupPointName ? `自取 ${order.pickupPointName}` : "自取";
  }
  return fulfillmentLabel(order.fulfillment);
}

export function staffOrderMessage(headline: string, order: Order): string {
  const items = order.items
    .map((item) => `· ${item.name} ${variantLabel(item.color, item.size)} × ${item.qty}`)
    .join("\n");
  return [
    headline,
    `訂單編號 ${order.code}`,
    `金額 ${formatPrice(order.total)}`,
    `配送 ${deliveryLine(order)}`,
    `${order.recipient} ${maskPhone(order.phone)}`,
    items,
    `後台 ${publicSiteUrl()}/admin/orders`,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4900);
}

export function newOrderHeadline(order: Pick<Order, "paymentMethod" | "fulfillment">): string {
  if (order.paymentMethod === "cod") return "新訂單（待選門市）";
  if (order.paymentMethod === "line" && order.fulfillment === "pickup") return "新訂單（自取，待確認）";
  if (order.paymentMethod === "line") return "新訂單（待確認）";
  if (order.fulfillment === "pickup") return "新訂單（自取，待付款）";
  return "新訂單（待付款）";
}

export function sanitizePendingNotifies(value: unknown): PendingNotify[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: PendingNotify[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<PendingNotify>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!TARGET.test(id) || seen.has(id)) continue;
    const kind = row.kind === "group" || row.kind === "room" ? row.kind : "user";
    const at = typeof row.at === "string" ? row.at.slice(0, 40) : "";
    seen.add(id);
    out.push({ id, kind, at });
    if (out.length >= MAX_TARGETS) break;
  }
  return out;
}
