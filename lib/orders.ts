import { randomBytes } from "crypto";
import { mutate } from "./store";
import { uid } from "./id";
import { variantPrice } from "./products";
import { formatPrice } from "./format";
import { pushLine } from "./line";
import { enabledPickupPoints, formatPickupAddress } from "./pickup";
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
  identity: { lineUserId: string; lineName: string; lineId: string; verified: boolean };
};

class OrderError extends Error {}

function upsertCustomer(store: Store, id: CheckoutInput["identity"]): Customer {
  const now = new Date().toISOString();
  const idKey = id.lineId.trim().toLowerCase();
  let customer: Customer | undefined;

  if (id.lineUserId) {
    customer = store.customers.find((c) => c.lineUserId === id.lineUserId);
    if (!customer && idKey) {
      customer = store.customers.find((c) => !c.lineUserId && c.lineId.toLowerCase() === idKey);
    }
  } else if (idKey) {
    customer = store.customers.find((c) => c.lineId.toLowerCase() === idKey);
  }

  if (!customer) {
    customer = {
      id: uid("cus"),
      lineUserId: id.lineUserId,
      lineName: id.lineName,
      lineId: id.lineId.trim(),
      verified: id.verified,
      note: "",
      createdAt: now,
      lastOrderAt: now,
    };
    store.customers.push(customer);
    return customer;
  }

  if (id.lineUserId) {
    customer.lineUserId = id.lineUserId;
    customer.verified = true;
  }
  if (id.lineName) customer.lineName = id.lineName;
  if (id.lineId.trim()) customer.lineId = id.lineId.trim();
  customer.lastOrderAt = now;
  return customer;
}

function newCode(store: Store): string {
  const d = new Date(Date.now() + 8 * 3600_000);
  const stamp = d.toISOString().slice(2, 10).replace(/-/g, "");
  for (;;) {
    const code = `RD${stamp}${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
    if (!store.orders.some((o) => o.code === code)) return code;
  }
}

export async function placeOrder(
  input: CheckoutInput
): Promise<{ ok: true; order: Order; customer: Customer } | { ok: false; error: string }> {
  try {
    const result = await mutate((store) => {
      const merged = new Map<string, CartLine>();
      for (const line of input.lines) {
        const qty = Math.floor(Number(line.qty));
        if (!Number.isFinite(qty) || qty < 1) throw new OrderError("數量不正確");
        const key = `${line.productId}:${line.variantId}`;
        const prev = merged.get(key);
        merged.set(key, { ...line, qty: (prev?.qty ?? 0) + qty });
      }
      if (!merged.size) throw new OrderError("購物袋是空的");

      const items: OrderItem[] = [];
      for (const line of merged.values()) {
        const product = store.products.find((p) => p.id === line.productId);
        if (!product || product.status !== "listed") throw new OrderError("部分商品已下架");
        const variant = product.variants.find((v) => v.id === line.variantId);
        if (!variant) throw new OrderError(`${product.name} 的款式已不存在`);
        if (variant.stock < line.qty) {
          throw new OrderError(`${product.name}（${variant.color}）庫存不足，目前剩 ${Math.max(0, variant.stock)} 件`);
        }
        variant.stock -= line.qty;
        product.sold += line.qty;
        items.push({
          productId: product.id,
          variantId: variant.id,
          name: product.name,
          color: variant.color,
          hex: variant.hex,
          price: variantPrice(product, variant),
          qty: line.qty,
          photo: product.photos[0] ?? "",
        });
      }

      const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
      const pickup = input.fulfillment === "pickup";
      let shipping = 0;
      let address = input.address;
      let pickupPointId = "";
      let pickupPointName = "";
      if (pickup) {
        const point = enabledPickupPoints(store.settings).find((p) => p.id === input.pickupPointId);
        if (!point) throw new OrderError("請選擇有效的自取地點");
        pickupPointId = point.id;
        pickupPointName = point.name;
        address = formatPickupAddress(point);
      } else {
        const { shippingFee, freeShippingThreshold } = store.settings;
        shipping = freeShippingThreshold > 0 && subtotal >= freeShippingThreshold ? 0 : shippingFee;
      }
      const customer = upsertCustomer(store, input.identity);
      const now = new Date().toISOString();
      const order: Order = {
        id: uid("ord"),
        code: newCode(store),
        token: randomBytes(12).toString("hex"),
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
      const priorOrders = store.orders.filter((o) => o.customerId === customer.id && o.id !== order.id).length;
      return { order, customer, priorOrders, notifyTo: store.settings.notifyTo };
    });

    const lines = result.order.items.map((i) => `· ${i.name} ${i.color} × ${i.qty}`).join("\n");
    const how =
      result.order.fulfillment === "pickup"
        ? `自取：${result.order.pickupPointName}`
        : `宅配：${result.order.address}`;
    const shopMsg =
      `新訂單 ${result.order.code}\n` +
      `${result.customer.lineName}${result.customer.lineId ? `（${result.customer.lineId}）` : ""}\n` +
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
    return { ok: true, order: result.order, customer: result.customer };
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
    const order = store.orders.find((o) => o.id === id);
    if (!order) return { ok: false, error: "找不到訂單" };
    if (order.status === "cancelled" && status !== "cancelled") {
      return { ok: false, error: "已取消的訂單無法恢復" };
    }
    if (order.status === "completed" && status === "cancelled") {
      return { ok: false, error: "已完成的訂單無法取消" };
    }
    let stockRestored = false;
    if (status === "cancelled" && order.status !== "cancelled") {
      for (const item of order.items) {
        const product = store.products.find((p) => p.id === item.productId);
        const variant = product?.variants.find((v) => v.id === item.variantId);
        if (variant) variant.stock += item.qty;
        if (product) product.sold = Math.max(0, product.sold - item.qty);
      }
      stockRestored = true;
    }
    order.status = status;
    order.internalNote = internalNote;
    order.updatedAt = new Date().toISOString();
    const customer = store.customers.find((c) => c.id === order.customerId);
    return { ok: true, order, stockRestored, customer };
  });
}
