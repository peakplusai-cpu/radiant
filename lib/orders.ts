import { randomBytes } from "crypto";
import { getStore, mutate } from "./store";
import { uid } from "./id";
import { variantPrice } from "./products";
import { shippingFor } from "./pricing";
import { formatPrice } from "./format";
import { pushLine } from "./line";
import { enabledPickupPoints, formatPickupAddress } from "./pickup";
import { canTransition } from "./order-flow";
import { variantLabel } from "./variants";
import { CVS_MAX_TOTAL, CVS_MIN_TOTAL, HOLD_MINUTES, MAX_HOLD_MINUTES, awaitingCustomer, holdExpired, paymentAllowed, paymentLabel } from "./payment";
import type { PaymentNotice } from "./newebpay";
import type { CheckoutIdentity } from "./checkout";
import type { Customer, Fulfillment, Order, OrderItem, OrderStatus, PaymentMethod, Store } from "./types";

export type CartLine = { productId: string; variantId: string; qty: number };

export type CheckoutInput = {
  lines: CartLine[];
  recipient: string;
  phone: string;
  address: string;
  fulfillment: Fulfillment;
  payment?: PaymentMethod;
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

function restock(store: Store, order: Order): void {
  for (const item of order.items) {
    const product = store.products.find((entry) => entry.id === item.productId);
    const variant = product?.variants.find((entry) => entry.id === item.variantId);
    if (variant) variant.stock += item.qty;
    if (product) product.sold = Math.max(0, product.sold - item.qty);
  }
}

/** Takes the stock back for an order that was cancelled, or fails without changing anything. */
function reserveAgain(store: Store, order: Order): boolean {
  const wanted = new Map<string, number>();
  for (const item of order.items) {
    const key = `${item.productId}:${item.variantId}`;
    wanted.set(key, (wanted.get(key) ?? 0) + item.qty);
  }
  for (const [key, qty] of wanted) {
    const [productId, variantId] = key.split(":");
    const variant = store.products.find((entry) => entry.id === productId)?.variants.find((entry) => entry.id === variantId);
    if (!variant || variant.stock < qty) return false;
  }
  for (const item of order.items) {
    const product = store.products.find((entry) => entry.id === item.productId);
    const variant = product?.variants.find((entry) => entry.id === item.variantId);
    if (variant) variant.stock -= item.qty;
    if (product) product.sold += item.qty;
  }
  return true;
}

function appendNote(order: Order, line: string): void {
  order.internalNote = [order.internalNote, line].filter(Boolean).join("\n").slice(0, 1000);
}

/** Cancels unpaid online / COD orders whose hold ran out. The hold time stays on the order. */
export function expireHolds(store: Store, now = Date.now()): number {
  let count = 0;
  for (const order of store.orders) {
    if (!holdExpired(order, now)) continue;
    restock(store, order);
    order.status = "cancelled";
    order.updatedAt = new Date(now).toISOString();
    appendNote(order, "逾時未完成付款或選擇門市，系統自動取消並歸還庫存");
    count += 1;
  }
  return count;
}

export async function expireUnpaidOrders(): Promise<number> {
  return mutate((store) => expireHolds(store));
}

function rememberKey(store: Store, key: string, code: string): void {
  const now = new Date().toISOString();
  store.idempotency = [...store.idempotency.filter((item) => item.key !== key), { key, code, at: now }].slice(-200);
}

export async function placeOrder(
  input: CheckoutInput
): Promise<{ ok: true; order: Order; customer: Customer; replay?: boolean } | { ok: false; error: string }> {
  try {
    const payment: PaymentMethod = input.payment ?? "line";
    if (!paymentAllowed(input.fulfillment, payment)) return { ok: false, error: "這個取貨方式不能使用所選的付款方式" };
    const result = await mutate((store) => {
      expireHolds(store);
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
      const cvs = input.fulfillment === "cvs";
      let address = cvs ? "" : input.address;
      let pickupPointId = "";
      let pickupPointName = "";
      if (pickup) {
        const point = enabledPickupPoints(store.settings).find((item) => item.id === input.pickupPointId);
        if (!point) throw new OrderError("請選擇有效的自取地點");
        pickupPointId = point.id;
        pickupPointName = point.name;
        address = formatPickupAddress(point);
      }
      const shipping = shippingFor(subtotal, store.settings, input.fulfillment);
      if (cvs && (subtotal + shipping < CVS_MIN_TOTAL || subtotal + shipping > CVS_MAX_TOTAL)) {
        throw new OrderError(`超商取貨的訂單金額須在 NT$ ${CVS_MIN_TOTAL} 至 NT$ ${CVS_MAX_TOTAL.toLocaleString("en-US")} 之間，請改用宅配或分開下單`);
      }
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
        fulfillment: input.fulfillment,
        pickupPointId,
        pickupPointName,
        paymentMethod: payment,
        paidAt: "",
        payTradeNo: "",
        payType: "",
        payAttempts: 0,
        holdUntil: payment === "line" ? "" : new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString(),
        cvs: null,
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

    if (!result.replay && result.order.paymentMethod === "line") {
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
    if (awaitingCustomer(order) && (status === "shipped" || status === "completed")) {
      return { ok: false, error: "客戶尚未完成付款或選擇門市，無法出貨" };
    }
    let stockRestored = false;
    if (status === "cancelled" && order.status !== "cancelled") {
      restock(store, order);
      order.holdUntil = "";
      stockRestored = true;
    }
    if (status === "paid" && order.status !== "paid" && order.holdUntil) {
      order.holdUntil = "";
      order.paidAt = order.paidAt || new Date().toISOString();
    }
    order.status = status;
    order.internalNote = internalNote;
    order.updatedAt = new Date().toISOString();
    const customer = store.customers.find((item) => item.id === order.customerId);
    return { ok: true, order, stockRestored, customer };
  });
}

export type BeginPayment =
  | { ok: true; order: Order; attempt: number }
  | { ok: false; error: string; status: number };

/** Reserves a fresh MerchantOrderNo for one trip to the NewebPay page. */
export async function beginPayment(code: string): Promise<BeginPayment> {
  return mutate((store): BeginPayment => {
    expireHolds(store);
    const order = store.orders.find((item) => item.code === code);
    if (!order) return { ok: false, error: "找不到訂單", status: 404 };
    if (order.paymentMethod === "line") return { ok: false, error: "這張訂單不需要線上付款", status: 400 };
    if (order.status === "cancelled") return { ok: false, error: "訂單已取消（逾時未付款），請重新下單", status: 409 };
    if (!awaitingCustomer(order)) return { ok: false, error: "這張訂單已完成付款或選擇門市", status: 409 };
    const now = Date.now();
    const cap = Date.parse(order.createdAt) + MAX_HOLD_MINUTES * 60_000;
    const extended = Math.min(cap, now + HOLD_MINUTES * 60_000);
    if (extended > Date.parse(order.holdUntil)) order.holdUntil = new Date(extended).toISOString();
    order.payAttempts += 1;
    order.updatedAt = new Date(now).toISOString();
    return { ok: true, order: { ...order }, attempt: order.payAttempts };
  });
}

export type PaymentOutcome =
  | { kind: "ignored" }
  | { kind: "failed"; order: Order }
  | { kind: "duplicate"; order: Order }
  | { kind: "mismatch"; order: Order }
  | { kind: "confirmed"; order: Order; customer?: Customer; revived: boolean }
  | { kind: "completed"; order: Order; customer?: Customer }
  | { kind: "refund"; order: Order; customer?: Customer };

function isConfirmed(order: Order): boolean {
  if (order.paidAt) return true;
  return order.paymentMethod === "cod" && Boolean(order.cvs?.storeCode || order.cvs?.lgsNo);
}

/**
 * Applies a verified NewebPay notice. Notify and Return both land here, so every
 * branch must be safe to run twice.
 */
export async function applyPaymentNotice(notice: PaymentNotice): Promise<PaymentOutcome> {
  const outcome = await mutate((store): PaymentOutcome => {
    const order = store.orders.find((item) => item.code === notice.code);
    if (!order || order.paymentMethod === "line") return { kind: "ignored" };
    const attempt = Number(notice.merchantOrderNo.split("_")[1]);
    if (!Number.isInteger(attempt) || attempt < 1 || attempt > order.payAttempts) return { kind: "ignored" };
    if (!notice.success) return { kind: "failed", order };
    const customer = store.customers.find((item) => item.id === order.customerId);
    const now = new Date().toISOString();

    if (notice.amt !== order.total) {
      appendNote(order, `藍新回報金額 ${notice.amt} 與訂單金額 ${order.total} 不符，未自動入帳（交易序號 ${notice.tradeNo}）`);
      order.updatedAt = now;
      return { kind: "mismatch", order };
    }

    const wasConfirmed = isConfirmed(order);
    let revived = false;
    if (order.fulfillment === "cvs" && notice.store) {
      order.cvs = { ...(order.cvs ?? { storeCode: "", storeName: "", storeAddr: "", storeType: "", pickupName: "", pickupPhone: "", lgsNo: "" }), ...stripEmpty(notice.store) };
    }

    const pickedUp = order.paymentMethod === "cod" && Boolean(notice.payTime);

    if (order.status === "cancelled") {
      if (wasConfirmed) return { kind: "duplicate", order };
      const expiredByHold = Boolean(order.holdUntil);
      if (expiredByHold && reserveAgain(store, order)) {
        order.status = "pending";
        revived = true;
        appendNote(order, "逾時取消後收到款項或門市資料，已重新保留庫存");
      } else {
        order.payTradeNo = notice.tradeNo;
        order.payType = notice.paymentType;
        if (order.paymentMethod === "online") order.paidAt = now;
        order.holdUntil = "";
        order.updatedAt = now;
        appendNote(order, `訂單已取消但客戶仍完成了付款或選門市（藍新序號 ${notice.tradeNo}），${expiredByHold ? "庫存已不足，" : ""}請與客戶聯絡並退款或取消物流單`);
        return { kind: "refund", order, customer };
      }
    } else if (wasConfirmed && !pickedUp) {
      return { kind: "duplicate", order };
    }

    if (order.paymentMethod === "online") {
      order.status = "paid";
      order.paidAt = now;
    } else if (pickedUp) {
      if (order.status === "completed") return { kind: "duplicate", order };
      order.status = "completed";
      order.paidAt = now;
    }
    order.payTradeNo = notice.tradeNo;
    order.payType = notice.paymentType;
    order.holdUntil = "";
    order.updatedAt = now;
    return pickedUp
      ? { kind: "completed", order, customer }
      : { kind: "confirmed", order, customer, revived };
  });

  await notifyPayment(outcome);
  return outcome;
}

function stripEmpty<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== "")) as Partial<T>;
}

async function notifyPayment(outcome: PaymentOutcome): Promise<void> {
  if (outcome.kind === "ignored" || outcome.kind === "failed" || outcome.kind === "duplicate") return;
  const { settings } = await getStore();
  const order = outcome.order;
  const lines = order.items.map((item) => `· ${item.name} ${variantLabel(item.color, item.size)} × ${item.qty}`).join("\n");
  const how = order.fulfillment === "cvs"
    ? `超商取貨：${order.cvs ? `${order.cvs.storeType} ${order.cvs.storeName}`.trim() : "（門市資料待確認）"}`
    : order.fulfillment === "pickup"
      ? `自取：${order.pickupPointName}`
      : `宅配：${order.address}`;
  const method = paymentLabel(order.paymentMethod, order.fulfillment);
  const toShop = (headline: string, extra = "") =>
    pushLine(settings.notifyTo, `${headline} ${order.code}\n${order.recipient} ${order.phone}\n${method}\n${how}${extra}\n${lines}\n合計 ${formatPrice(order.total)}`);

  if (outcome.kind === "mismatch") {
    void toShop("付款金額不符，請至藍新後台確認");
    return;
  }
  if (outcome.kind === "refund") {
    void toShop("訂單已取消但客戶完成付款，請聯絡客戶並退款");
    return;
  }
  if (outcome.kind === "completed") {
    void toShop("取貨付款已完成");
    return;
  }
  const cod = order.paymentMethod === "cod";
  void toShop(cod ? "新訂單（超商取貨付款）" : "新訂單（已付款）", order.cvs?.lgsNo ? `\n寄件代碼 ${order.cvs.lgsNo}` : "");
  if (outcome.customer?.lineUserId) {
    void pushLine(
      outcome.customer.lineUserId,
      `Radiant 已收到您的訂單 ${order.code}\n${cod ? "取貨時於門市付款" : "已完成付款"}\n${how}\n${lines}\n合計 ${formatPrice(order.total)}\n商品出貨後會再通知您。`
    );
  }
}
