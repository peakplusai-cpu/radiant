import { randomBytes } from "crypto";
import { getStore, mutate } from "./store";
import { uid } from "./id";
import { variantPrice } from "./products";
import { formatPrice } from "./format";
import { effectiveCategories } from "./categories";
import { customerUses, quoteCart, reinstatePromoUses, restorePromoUses, validGuestToken, type CustomerKeys } from "./promos";
import { pushLine } from "./line";
import { newOrderHeadline, staffOrderMessage } from "./line-notify";
import { enabledPickupPoints, formatPickupAddress } from "./pickup";
import { canTransition } from "./order-flow";
import { variantLabel } from "./variants";
import { CVS_MAX_TOTAL, CVS_MIN_TOTAL, HOLD_MINUTES, MAX_HOLD_MINUTES, awaitingCustomer, holdExpired, paymentAllowed } from "./payment";
import { isVoucherNotice, noticePayType, voucherDeadline, type PaymentNotice } from "./newebpay";
import type { CheckoutIdentity } from "./checkout";
import type { Customer, Fulfillment, Order, OrderItem, OrderStatus, PaymentMethod, Store } from "./types";

export type CartLine = { productId: string; variantId: string; qty: number };

export type CheckoutInput = {
  lines: CartLine[];
  recipient: string;
  phone: string;
  email: string;
  address: string;
  fulfillment: Fulfillment;
  payment?: PaymentMethod;
  pickupPointId: string;
  note: string;
  idempotencyKey: string;
  identity: CheckoutIdentity;
  coupon?: string;
  guestToken?: string;
  shownPromoIds?: string[];
};

class OrderError extends Error {}

function upsertCustomer(store: Store, id: CheckoutIdentity, email: string): Customer {
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
      email,
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
  if (email) customer.email = email;
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
    restorePromoUses(store.promotions, store.promoUses, order.id);
    order.status = "cancelled";
    order.updatedAt = new Date(now).toISOString();
    appendNote(order, "逾時未完成付款或選擇門市，系統自動取消並歸還庫存");
    count += 1;
  }
  return count;
}

async function notifyReleased(orders: Order[]): Promise<void> {
  if (!orders.length) return;
  const { settings } = await getStore();
  const shown = orders.slice(0, 20);
  const extra = orders.length - shown.length;
  const text =
    shown.map((order) => staffOrderMessage("逾時未付款，已自動取消並歸還庫存", order)).join("\n\n") +
    (extra > 0 ? `\n\n另有 ${extra} 筆逾時訂單已取消` : "");
  await pushLine(settings.notifyTo, text);
}

/**
 * Runs `fn` inside the version lock after releasing overdue holds.
 * A retried write only notifies for orders the successful attempt actually cancelled.
 */
async function mutateSettled<T>(fn: (store: Store) => T): Promise<{ value: T; released: number }> {
  let released = 0;
  let pendingNotice: Order[] = [];
  const value = await mutate((store) => {
    const dueIds = new Set(store.orders.filter((order) => holdExpired(order)).map((order) => order.id));
    if (dueIds.size) expireHolds(store);
    const result = fn(store);
    released = dueIds.size;
    pendingNotice = store.orders
      .filter((order) => dueIds.has(order.id) && order.status === "cancelled" && !order.paidAt)
      .map((order) => ({ ...order, items: order.items.map((item) => ({ ...item })), cvs: order.cvs ? { ...order.cvs } : null, alerts: [...(order.alerts ?? [])] }));
    return result;
  });
  try {
    await notifyReleased(pendingNotice);
  } catch {
    console.error("line notify failed");
  }
  return { value, released };
}

let releaseInflight: Promise<number> | null = null;

/** Cancels overdue unpaid orders once. Concurrent callers share one write. */
export function releaseExpiredHolds(): Promise<number> {
  if (!releaseInflight) {
    releaseInflight = releaseExpiredHoldsNow().finally(() => {
      releaseInflight = null;
    });
  }
  return releaseInflight;
}

async function releaseExpiredHoldsNow(): Promise<number> {
  const store = await getStore();
  if (!store.orders.some((order) => holdExpired(order))) return 0;
  const { released } = await mutateSettled(() => undefined);
  return released;
}

/** Store read for cart, checkout, lookup, and admin. Releases overdue holds first. */
export async function readSettledStore(): Promise<Store> {
  const store = await getStore();
  if (!store.orders.some((order) => holdExpired(order))) return store;
  await releaseExpiredHolds();
  return getStore();
}

export async function expireUnpaidOrders(): Promise<number> {
  const { released } = await mutateSettled(() => undefined);
  return released;
}

function commitPromoUses(store: Store, orderId: string, applied: { id: string; name: string; discount: number }[], who: CustomerKeys): void {
  const now = new Date().toISOString();
  for (const item of applied) {
    const promo = store.promotions.find((entry) => entry.id === item.id);
    if (!promo) throw new OrderError(`優惠「${item.name}」已結束，請確認金額後再送出`);
    const used = store.promoUses.filter((entry) => entry.promoId === promo.id && !entry.restored).length;
    if (promo.usageLimit > 0 && Math.max(used, promo.used) >= promo.usageLimit) {
      throw new OrderError(`優惠「${promo.name}」已額滿，請確認金額後再送出`);
    }
    if (promo.perCustomer > 0 && customerUses(store.promoUses, promo.id, who) >= promo.perCustomer) {
      throw new OrderError(`優惠「${promo.name}」已達使用上限，請確認金額後再送出`);
    }
    promo.used = Math.max(used, promo.used) + 1;
    store.promoUses.push({
      id: uid("use"),
      promoId: promo.id,
      orderId,
      phone: who.phone,
      email: who.email,
      lineUserId: who.lineUserId,
      discount: item.discount,
      restored: false,
      createdAt: now,
    });
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
    const payment: PaymentMethod = input.payment ?? "line";
    if (!paymentAllowed(input.fulfillment, payment)) return { ok: false, error: "這個取貨方式不能使用所選的付款方式" };
    const { value: result } = await mutateSettled((store) => {
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

      const prepared: { product: Store["products"][number]; variant: Store["products"][number]["variants"][number]; qty: number; price: number }[] = [];
      for (const line of merged.values()) {
        const product = store.products.find((item) => item.id === line.productId);
        if (!product || product.status !== "listed") throw new OrderError("部分商品已下架或庫存已更新，請回購物袋確認");
        const variant = product.variants.find((item) => item.id === line.variantId);
        if (!variant) throw new OrderError(`${product.name} 的款式已不存在，請重新選擇顏色與尺寸`);
        if (variant.stock < line.qty) {
          const label = variantLabel(variant.color, variant.size);
          throw new OrderError(`${product.name}（${label}）庫存不足，目前剩 ${Math.max(0, variant.stock)} 件`);
        }
        prepared.push({ product, variant, qty: line.qty, price: variantPrice(product, variant) });
      }

      const who: CustomerKeys = {
        phone: input.phone,
        email: input.email.trim().toLowerCase(),
        lineUserId: input.identity.verified ? input.identity.lineUserId : "",
      };
      const quote = quoteCart(store.promotions, store.promoUses, store.promoClaims, {
        now: Date.now(),
        lines: prepared.map((row) => ({
          productId: row.product.id,
          qty: row.qty,
          unitPrice: row.price,
          categories: effectiveCategories(row.product),
        })),
        fulfillment: input.fulfillment,
        settings: store.settings,
        coupon: input.coupon ?? "",
        guestToken: input.guestToken && validGuestToken(input.guestToken) ? input.guestToken : "",
        lineUserId: who.lineUserId,
        phone: who.phone,
        email: who.email,
        expectIds: (input.shownPromoIds ?? []).filter((id) => typeof id === "string").slice(0, 10),
      });
      if (quote.error) throw new OrderError(quote.error);

      const items: OrderItem[] = [];
      for (const row of prepared) {
        row.variant.stock -= row.qty;
        row.product.sold += row.qty;
        items.push({
          productId: row.product.id,
          variantId: row.variant.id,
          name: row.product.name,
          color: row.variant.color,
          size: row.variant.size,
          hex: row.variant.hex,
          price: row.price,
          qty: row.qty,
          photo: row.product.photos[0] ?? "",
        });
      }

      const subtotal = quote.subtotal;
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
      const shipping = quote.shipping;
      const discount = quote.discount;
      const total = quote.total;
      if (cvs && (total < CVS_MIN_TOTAL || total > CVS_MAX_TOTAL)) {
        throw new OrderError(`超商取貨的訂單金額須在 NT$ ${CVS_MIN_TOTAL} 至 NT$ ${CVS_MAX_TOTAL.toLocaleString("en-US")} 之間，請改用宅配或分開下單`);
      }
      const customer = upsertCustomer(store, input.identity, input.email);
      const now = new Date().toISOString();
      const orderId = uid("ord");
      commitPromoUses(store, orderId, quote.applied, who);
      const order: Order = {
        id: orderId,
        code: newCode(store),
        token: randomBytes(32).toString("base64url"),
        customerId: customer.id,
        recipient: input.recipient,
        phone: input.phone,
        email: input.email,
        address,
        fulfillment: input.fulfillment,
        pickupPointId,
        pickupPointName,
        paymentMethod: payment,
        paidAt: "",
        payTradeNo: "",
        payType: "",
        payBankCode: "",
        payCodeNo: "",
        payExpire: "",
        payAttempts: 0,
        alerts: [],
        holdUntil: payment === "line" ? "" : new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString(),
        cvs: null,
        note: input.note,
        items,
        subtotal,
        discount,
        appliedPromos: quote.applied.map(({ endsAt: _endsAt, ...promo }) => promo),
        shipping,
        total,
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
      try {
        await pushLine(result.notifyTo, staffOrderMessage(newOrderHeadline(result.order), result.order));
      } catch {
        console.error("line notify failed");
      }
      if (result.order.paymentMethod === "line" && result.customer.lineUserId) {
        const lines = result.order.items.map((item) => `· ${item.name} ${variantLabel(item.color, item.size)} × ${item.qty}`).join("\n");
        const how = result.order.fulfillment === "pickup" ? `自取：${result.order.pickupPointName}` : result.order.fulfillment === "cvs" ? "超商取貨" : `宅配：${result.order.address}`;
        try {
          await pushLine(
            result.customer.lineUserId,
            `Radiant 已收到您的訂單 ${result.order.code}\n${how}\n${lines}\n合計 ${formatPrice(result.order.total)}\n我們會盡快與您確認。`
          );
        } catch {
          console.error("line notify failed");
        }
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
      restorePromoUses(store.promotions, store.promoUses, order.id);
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
  const { value } = await mutateSettled((store): BeginPayment => {
    const order = store.orders.find((item) => item.code === code);
    if (!order) return { ok: false, error: "找不到訂單", status: 404 };
    if (order.paymentMethod === "line") return { ok: false, error: "這張訂單不需要線上付款", status: 400 };
    if (order.status === "cancelled") return { ok: false, error: "訂單已取消（逾時未付款），請重新下單", status: 409 };
    if (order.payCodeNo && order.status === "pending" && !order.paidAt) {
      return { ok: false, error: "已取得繳費代碼，請依訂單頁面的帳號或代碼完成繳費", status: 409 };
    }
    if (!awaitingCustomer(order)) return { ok: false, error: "這張訂單已完成付款或選擇門市", status: 409 };
    const now = Date.now();
    const cap = Date.parse(order.createdAt) + MAX_HOLD_MINUTES * 60_000;
    const extended = Math.min(cap, now + HOLD_MINUTES * 60_000);
    if (extended > Date.parse(order.holdUntil)) order.holdUntil = new Date(extended).toISOString();
    order.payAttempts += 1;
    order.updatedAt = new Date(now).toISOString();
    return { ok: true, order: { ...order }, attempt: order.payAttempts };
  });
  return value;
}

export type PaymentOutcome =
  | { kind: "ignored" }
  | { kind: "failed"; order: Order; fresh: boolean }
  | { kind: "duplicate"; order: Order }
  | { kind: "mismatch"; order: Order }
  | { kind: "voucher"; order: Order; customer?: Customer }
  | { kind: "confirmed"; order: Order; customer?: Customer; revived: boolean }
  | { kind: "completed"; order: Order; customer?: Customer }
  | { kind: "refund"; order: Order; customer?: Customer };

function isConfirmed(order: Order): boolean {
  if (order.paidAt) return true;
  return order.paymentMethod === "cod" && Boolean(order.cvs?.storeCode || order.cvs?.lgsNo);
}

/**
 * Applies a verified NewebPay notify. The browser return URL does not call this.
 * Every branch is safe to run twice.
 */
export async function applyPaymentNotice(notice: PaymentNotice): Promise<PaymentOutcome> {
  const { value: outcome } = await mutateSettled((store): PaymentOutcome => {
    const order = store.orders.find((item) => item.code === notice.code);
    if (!order || order.paymentMethod === "line") return { kind: "ignored" };
    const attempt = Number(notice.merchantOrderNo.split("_")[1]);
    if (!Number.isInteger(attempt) || attempt < 1 || attempt > order.payAttempts) return { kind: "ignored" };
    if (!notice.success) {
      if (order.status !== "pending" || order.paidAt || isConfirmed(order)) return { kind: "failed", order, fresh: false };
      const key = `fail:${notice.merchantOrderNo}`;
      const alerts = order.alerts ?? [];
      if (alerts.includes(key)) return { kind: "failed", order, fresh: false };
      order.alerts = [...alerts, key].slice(-20);
      appendNote(order, `付款未成功（${notice.status || "失敗"}），庫存仍保留到付款期限`);
      order.updatedAt = new Date().toISOString();
      return { kind: "failed", order, fresh: true };
    }
    const customer = store.customers.find((item) => item.id === order.customerId);
    const now = new Date().toISOString();

    if (notice.amt !== order.total) {
      appendNote(order, `藍新回報金額 ${notice.amt} 與訂單金額 ${order.total} 不符，未自動入帳（交易序號 ${notice.tradeNo}）`);
      order.updatedAt = now;
      return { kind: "mismatch", order };
    }

    if (isVoucherNotice(notice)) {
      if (order.paymentMethod !== "online") return { kind: "ignored" };
      if (order.paidAt || (order.payCodeNo && order.payTradeNo === notice.tradeNo)) return { kind: "duplicate", order };
      if (order.status === "cancelled") {
        appendNote(order, `訂單已取消後才取得繳費代碼（藍新序號 ${notice.tradeNo}），未保留庫存`);
        order.updatedAt = now;
        return { kind: "ignored" };
      }
      order.payBankCode = notice.bankCode;
      order.payCodeNo = notice.codeNo;
      order.payExpire = notice.expireDate;
      order.payTradeNo = notice.tradeNo;
      order.payType = noticePayType(notice);
      order.holdUntil = voucherDeadline(notice.expireDate, Date.parse(now));
      order.updatedAt = now;
      return { kind: "voucher", order, customer };
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
        reinstatePromoUses(store.promotions, store.promoUses, order.id);
        appendNote(order, "逾時取消後收到款項或門市資料，已重新保留庫存");
      } else {
        order.payTradeNo = notice.tradeNo;
        order.payType = notice.paymentType;
        if (order.paymentMethod === "online") order.paidAt = now;
        order.holdUntil = "";
        order.updatedAt = now;
        appendNote(order, `待人工處理：訂單已取消但客戶仍完成了付款或選門市（藍新序號 ${notice.tradeNo}），${expiredByHold ? "庫存已不足，" : ""}請與客戶聯絡並退款或取消物流單`);
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
    order.payType = noticePayType(notice);
    order.holdUntil = "";
    order.updatedAt = now;
    return pickedUp
      ? { kind: "completed", order, customer }
      : { kind: "confirmed", order, customer, revived };
  });

  try {
    await notifyPayment(outcome);
  } catch {
    console.error("line notify failed");
  }
  return outcome;
}

function stripEmpty<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== "")) as Partial<T>;
}

async function notifyPayment(outcome: PaymentOutcome): Promise<void> {
  if (outcome.kind === "ignored" || outcome.kind === "duplicate") return;
  if (outcome.kind === "failed" && !outcome.fresh) return;
  const { settings } = await getStore();
  const order = outcome.order;
  const toShop = (headline: string) => pushLine(settings.notifyTo, staffOrderMessage(headline, order));

  if (outcome.kind === "failed") {
    await toShop("付款未成功");
    return;
  }
  if (outcome.kind === "voucher") {
    const how = order.payType === "VACC" ? "ATM 轉帳" : "超商代碼";
    await toShop(`已取得${how}繳費代碼，期限 ${order.payExpire || "見後台"}`);
    return;
  }
  if (outcome.kind === "mismatch") {
    await toShop("付款金額不符，請到藍新後台確認");
    return;
  }
  if (outcome.kind === "refund") {
    await toShop("已付款，但庫存不足需人工處理");
    return;
  }
  if (outcome.kind === "completed") {
    await toShop("取貨付款已完成");
    return;
  }
  const cod = order.paymentMethod === "cod";
  await toShop(cod ? "新訂單（超商取貨付款）" : "已付款");
  if (!outcome.customer?.lineUserId) return;
  const lines = order.items.map((item) => `· ${item.name} ${variantLabel(item.color, item.size)} × ${item.qty}`).join("\n");
  const how = order.fulfillment === "cvs"
    ? `超商取貨：${order.cvs ? `${order.cvs.storeType} ${order.cvs.storeName}`.trim() : "（門市資料待確認）"}`
    : order.fulfillment === "pickup"
      ? `自取：${order.pickupPointName}`
      : `宅配：${order.address}`;
  await pushLine(
    outcome.customer.lineUserId,
    `Radiant 已收到您的訂單 ${order.code}\n${cod ? "取貨時於門市付款" : "已完成付款"}\n${how}\n${lines}\n合計 ${formatPrice(order.total)}\n商品出貨後會再通知您。`
  );
}
