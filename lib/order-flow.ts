import type { OrderStatus } from "./types";

export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["paid", "shipped", "cancelled"],
  paid: ["shipped", "cancelled"],
  shipped: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return [from, ...TRANSITIONS[from].filter((status) => status !== "cancelled")];
}
