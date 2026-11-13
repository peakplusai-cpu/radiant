import { randomBytes } from "crypto";
import { mutate } from "./store";
import { uid } from "./id";
import { variantPrice } from "./products";
import { shippingFor } from "./pricing";
import { formatPrice } from "./format";
import { pushLine } from "./line";
import { enabledPickupPoints, formatPickupAddress } from "./pickup";
import { canTransition } from "./order-flow";
import { variantLabel } from "./variants";
import type { CheckoutIdentity } from "./checkout";
import type { Customer, Fulfillment, Order, OrderItem, OrderStatus, Store } from "./types";

export type CartLine = { productId: string; variantId: string; qty: number };

export type CheckoutInput = {
  lines: CartLine[];
  recipient: string;
  phone: string;
  address: string;
  fulfillment: Fulfillment;
  pickupPointId: string;
  note: string;
  idempotencyKey: string;
  identity: CheckoutIdentity;
};

class OrderError extends Error {}

function upsertCustomer(store: Store, id: CheckoutIdentity): Customer {
  const now = new Date().toISOString();
  let customer: Customer | undefined;
  if (id.verified && id.lineUserId) {
    customer = store.customers.find((item) => item.lineUserId === id.lineUserId);
  } else if (id.phone) {
    customer = store.customers.find((item) => !item.verified && !item.lineUserId && item.phone === id.phone);
  }

  if (!customer) {
    customer = {
      id: uid("cus"),
      lineUserId: id.verified ? id.lineUserId : "",
      lineName: id.lineName,
      lineId: "",
      phone: id.phone,
      verified: id.verified,
      note: "",
      createdAt: now,
      lastOrderAt: now,
    };
    store.customers.push(customer);
    return customer;
  }

  if (id.verified && id.lineUserId) {
    customer.lineUserId = id.lineUserId;
    customer.verified = true;
  }
  if (id.lineName) customer.lineName = id.lineName;
  if (id.phone) customer.phone = id.phone;
  customer.lastOrderAt = now;
  return customer;
}

function newCode(store: Store): string {
  const stamp = new Date(Date.now() + 8 * 3600_000).toISOString().slice(2, 10).replace(/-/g, "");
  for (;;) {
    const code = `RD${stamp}${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
    if (!store.orders.some((order) => order.code === code)) return code;
  }
}

function rememberKey(store: Store, key: string, code: string): void {
  const now = new Date().toISOString();
  store.idempotency = [...store.idempotency.filter((item) => item.key !== key), { key, code, at: now }].slice(-200);
}

export async function placeOrder(
  input: CheckoutInput
): Promise<{ ok: true; order: Order; customer: Customer; replay?: boolean } | { ok: false; error: string }> {
  try {
    const result = await mutate((store) => {
      const hit = store.idempotency.find((item) => item.key === input.idempotencyKey);
      if (hit) {
        const existing = store.orders.find((order) => order.code === hit.code);
        const customer = existing ? store.customers.find((item) => item.id === existing.customerId) : undefined;
        if (existing && customer) return { order: existing, customer, priorOrders: 0, notifyTo: "", replay: true };
      }

      const merged = new Map<string, CartLine>();
      for (const line of input.lines) {
        const qty = Math.floor(Number(line.qty));
        if (!Number.isFinite(qty) || qty < 1 || qty > 99) throw new OrderError("數量不正確");
        const key = `${line.productId}:${line.variantId}`;
        const prev = merged.get(key);
        merged.set(key, { ...line, qty: (prev?.qty ?? 0) + qty });
      }
      if (!merged.size) throw new OrderError("購物袋是空的");

      const items: OrderItem[] = [];
      for (const line of merged.values()) {
        const product = store.products.find((item) => item.id === line.productId);
        if (!product || product.status !== "listed") throw new OrderError("部分商品已下架或庫存已更新，請回購物袋確認");
        const variant = product.variants.find((item) => item.id === line.variantId);
        if (!variant) throw new OrderError(`${product.name} 的款式已不存在，請重新選擇顏色與尺寸`);
        if (variant.stock < line.qty) {
          const label = variantLabel(variant.color, variant.size);
          throw new OrderError(`${product.name}（${label}）庫存不足，目前剩 ${Math.max(0, variant.stock)} 件`);
        }
        variant.stock -= line.qty;
        product.sold += line.qty;
        items.push({
          productId: product.id,
          variantId: variant.id,
          name: product.name,
          color: variant.color,
          size: variant.size,
          hex: variant.hex,
          price: variantPrice(product, variant),
          qty: line.qty,
          photo: product.photos[0] ?? "",
        });
      }

      const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
      const pickup = input.fulfillment === "pickup";
      let address = input.address;
      let pickupPointId = "";
      let pickupPointName = "";
      if (pickup) {
        const point = enabledPickupPoints(store.settings).find((item) => item.id === input.pickupPointId);
        if (!point) throw new OrderError("請選擇有效的自取地點");
        pickupPointId = point.id;
        pickupPointName = point.name;
        address = formatPickupAddress(point);
      }
      const shipping = shippingFor(subtotal, store.settings, pickup ? "pickup" : "delivery");
      const customer = upsertCustomer(store, input.identity);
      const now = new Date().toISOString();
      const order: Order = {
        id: uid("ord"),
        code: newCode(store),
        token: randomBytes(32).toString("base64url"),
        customerId: customer.id,
        recipient: input.recipient,
        phone: input.phone,
        address,
        fulfillment: pickup ? "pickup" : "delivery",
        pickupPointId,
        pickupPointName,
        note: input.note,
        items,
        subtotal,
        shipping,
        total: subtotal + shipping,
        status: "pending",
        internalNote: "",
        createdAt: now,
        updatedAt: now,
      };
      store.orders.push(order);
      rememberKey(store, input.idempotencyKey, order.code);
      const priorOrders = store.orders.filter((item) => item.customerId === customer.id && item.id !== order.id).length;
      return { order, customer, priorOrders, notifyTo: store.settings.notifyTo, replay: false };
    });

    if (!result.replay) {
      const lines = result.order.items.map((item) => `· ${item.name} ${variantLabel(item.color, item.size)} × ${item.qty}`).join("\n");
      const how = result.order.fulfillment === "pickup" ? `自取：${result.order.pickupPointName}` : `宅配：${result.order.address}`;
      const shopMsg =
        `新訂單 ${result.order.code}\n` +
        `${result.customer.lineName}${result.customer.verified ? "" : "（訪客）"}\n` +
        `${result.order.recipient} ${result.order.phone}\n` +
        `${how}` +
        `${result.priorOrders > 0 ? `\n此客戶累計第 ${result.priorOrders + 1} 張單，請合併處理` : ""}\n` +
        `${lines}\n合計 ${formatPrice(result.order.total)}`;
      void pushLine(result.notifyTo, shopMsg);
      if (result.customer.lineUserId) {
        void pushLine(
          result.customer.lineUserId,
          `Radiant 已收到您的訂單 ${result.order.code}\n${how}\n${lines}\n合計 ${formatPrice(result.order.total)}\n我們會盡快與您確認。`
        );
      }
    }
    return { ok: true, order: result.order, customer: result.customer, replay: result.replay };
  } catch (err) {
    if (err instanceof OrderError) return { ok: false, error: err.message };
    throw err;
  }
}

export async function changeOrder(
  id: string,
  status: OrderStatus,
  internalNote: string
): Promise<{ ok: boolean; error?: string; order?: Order; stockRestored?: boolean; customer?: Customer }> {
  return mutate((store) => {
    const order = store.orders.find((item) => item.id === id);
    if (!order) return { ok: false, error: "找不到訂單" };
    if (!canTransition(order.status, status)) return { ok: false, error: "這個狀態無法這樣變更" };
    let stockRestored = false;
    if (status === "cancelled" && order.status !== "cancelled") {
      for (const item of order.items) {
        const product = store.products.find((entry) => entry.id === item.productId);
        const variant = product?.variants.find((entry) => entry.id === item.variantId);
        if (variant) variant.stock += item.qty;
        if (product) product.sold = Math.max(0, product.sold - item.qty);
      }
      stockRestored = true;
    }
    order.status = status;
    order.internalNote = internalNote;
    order.updatedAt = new Date().toISOString();
    const customer = store.customers.find((item) => item.id === order.customerId);
    return { ok: true, order, stockRestored, customer };
  });
}
