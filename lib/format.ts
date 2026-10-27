import type { Fulfillment, OrderStatus } from "./types";

export function formatPrice(n: number): string {
  return `NT$ ${Math.round(n).toLocaleString("en-US")}`;
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "待確認",
  paid: "已付款",
  shipped: "已出貨",
  completed: "已完成",
  cancelled: "已取消",
};

export const ORDER_STATUSES: OrderStatus[] = ["pending", "paid", "shipped", "completed", "cancelled"];
export const OPEN_STATUSES: OrderStatus[] = ["pending", "paid"];

export function fulfillmentLabel(kind: Fulfillment | undefined): string {
  return kind === "pickup" ? "自取" : "宅配";
}
