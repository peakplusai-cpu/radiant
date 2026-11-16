import { safeEqual } from "./session-token";
import { getLineIdentity } from "./line";
import { hasReceiptGrant } from "./receipt";
import type { Customer, Order } from "./types";

/** An order is visible to its LINE owner, to the browser that placed it, or to anyone with its secret link. */
export async function canViewOrder(order: Order, customers: Customer[], token?: string): Promise<boolean> {
  const identity = await getLineIdentity();
  const customer = customers.find((item) => item.id === order.customerId);
  if (identity && customer?.lineUserId && customer.lineUserId === identity.userId) return true;
  if (await hasReceiptGrant(order.code)) return true;
  return Boolean(token && safeEqual(token, order.token));
}
