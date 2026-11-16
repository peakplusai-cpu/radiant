import { effectiveCategories } from "./categories";
import { formatPrice } from "./format";
import { shippingFor } from "./pricing";
import { priceRange } from "./products";
import type {
  AppliedPromo,
  Fulfillment,
  Product,
  PromoKind,
  PromoScope,
  PromoStacking,
  PromoUse,
  Promotion,
  Settings,
} from "./types";

export type PromoStatus = "upcoming" | "active" | "ended" | "disabled";

export const PROMO_STATUS_LABEL: Record<PromoStatus, string> = {
  upcoming: "即將開始",
  active: "進行中",
  ended: "已結束",
  disabled: "已停用",
};

const TAIPEI_MS = 8 * 60 * 60 * 1000;

export function promoStatus(promo: Pick<Promotion, "enabled" | "startsAt" | "endsAt">, now: number): PromoStatus {
  if (!promo.enabled) return "disabled";
  const start = Date.parse(promo.startsAt);
  const end = Date.parse(promo.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "ended";
  if (now < start) return "upcoming";
  if (now >= end) return "ended";
  return "active";
}

/** "2026-11-16T20:30" is Taipei wall time, stored as UTC ISO. */
export function taipeiInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}:00+08:00`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

export function isoToTaipeiInput(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed + TAIPEI_MS).toISOString().slice(0, 16);
}

export function normalizeCoupon(code: string): string {
  return code.trim().replace(/\s+/g, "").toUpperCase();
}

export function validGuestToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,80}$/.test(value);
}

/** 20% off is 八折; 15% off is 85折. */
export function foldLabel(percentOff: number): string {
  const pay = Math.round(100 - percentOff);
  if (pay <= 0) return "免費";
  if (pay % 10 === 0) return `${pay / 10}折`;
  return `${pay}折`;
}

export function promoBadge(promo: Pick<Promotion, "kind" | "value" | "minSpend" | "freeShipping">): string {
  if (promo.kind === "percent" && promo.value > 0) return foldLabel(promo.value);
  if (promo.kind === "threshold" && promo.value > 0) return `滿額折`;
  if (promo.value > 0) return `折 ${promo.value}`;
  if (promo.freeShipping) return "免運";
  return "優惠";
}

export function promoSummary(promo: Promotion): string {
  const scope = promo.scope === "site" ? "全站" : promo.scope === "product" ? "指定商品" : `分類 ${promo.category}`;
  const off =
    promo.kind === "percent"
      ? foldLabel(promo.value)
      : promo.kind === "threshold"
        ? `滿 ${formatPrice(promo.minSpend)} 折 ${formatPrice(promo.value)}`
        : `折 ${formatPrice(promo.value)}`;
  return `${scope} · ${off}${promo.freeShipping ? " · 免運" : ""}`;
}

export type MoneyLine = {
  productId: string;
  qty: number;
  unitPrice: number;
  categories: string[];
};

export type QuoteSettings = {
  shippingFee: number;
  freeShippingThreshold: number;
  cvsShippingFee?: number;
};

export type QuoteInput = {
  now: number;
  lines: MoneyLine[];
  fulfillment: Fulfillment;
  settings: QuoteSettings;
  promotions: Promotion[];
  claimedIds: ReadonlySet<string>;
  coupon: string;
  /** Non-restored redemptions. Missing keys fall back to promo.used. */
  usage?: ReadonlyMap<string, number>;
  customerUsage?: ReadonlyMap<string, number>;
  /** Promos the shopper was shown. Checkout rejects the order if one of these has ended. */
  expectIds?: string[];
};

export type QuoteHint = { promoId: string; text: string; remain: number; reward: number };

export type QuoteApplied = AppliedPromo & { endsAt: string };

export type QuoteResult = {
  subtotal: number;
  discount: number;
  shipping: number;
  baseShipping: number;
  total: number;
  applied: QuoteApplied[];
  hints: QuoteHint[];
  couponMessage: string;
  /** Non-empty means checkout must stop and show this message. */
  error: string;
};

type Fail = "off" | "time" | "upcoming" | "usage" | "customer" | "coupon" | "claim" | "scope" | "short" | "none";

type Evaluation = {
  promo: Promotion;
  fail: Fail;
  eligible: number;
  discount: number;
  freeShipping: boolean;
  remain: number;
  reward: number;
  hint: string;
};

function whole(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function lineMatches(promo: Promotion, line: MoneyLine): boolean {
  if (promo.scope === "site") return true;
  if (promo.scope === "product") return Boolean(promo.productId) && line.productId === promo.productId;
  return Boolean(promo.category) && line.categories.includes(promo.category);
}

function eligibleSubtotal(promo: Promotion, lines: MoneyLine[]): number {
  return lines.reduce((sum, line) => (lineMatches(promo, line) ? sum + whole(line.unitPrice) * whole(line.qty) : sum), 0);
}

/** Discount in whole NT$, assuming the minimum spend is already met. */
export function discountAmount(promo: Pick<Promotion, "kind" | "value" | "maxDiscount">, eligible: number): number {
  const base = whole(eligible);
  if (base <= 0) return 0;
  let raw = 0;
  if (promo.kind === "percent") {
    const percent = Math.min(100, Math.max(0, whole(promo.value)));
    raw = Math.round((base * percent) / 100);
  } else {
    raw = whole(promo.value);
  }
  const cap = whole(promo.maxDiscount);
  if (cap > 0) raw = Math.min(raw, cap);
  return Math.min(base, Math.max(0, raw));
}

function usedCount(promo: Promotion, usage?: ReadonlyMap<string, number>): number {
  const counted = usage?.get(promo.id);
  if (counted === undefined) return whole(promo.used);
  return Math.max(whole(counted), whole(promo.used));
}

function hintText(promo: Promotion, remain: number, reward: number): string {
  if (remain <= 0) return "";
  if (reward > 0 && promo.freeShipping) return `再買 ${formatPrice(remain)} 即可折 ${formatPrice(reward)}，並享免運`;
  if (reward > 0) return `再買 ${formatPrice(remain)} 即可折 ${formatPrice(reward)}`;
  if (promo.freeShipping) return `再買 ${formatPrice(remain)} 即可享免運`;
  if (promo.kind === "percent" && promo.value > 0) return `再買 ${formatPrice(remain)} 即可享${foldLabel(promo.value)}`;
  return "";
}

function evaluate(promo: Promotion, input: QuoteInput, subtotalLines: MoneyLine[]): Evaluation {
  const eligible = eligibleSubtotal(promo, subtotalLines);
  const blank: Evaluation = { promo, fail: "none", eligible, discount: 0, freeShipping: false, remain: 0, reward: 0, hint: "" };
  if (!promo.enabled) return { ...blank, fail: "off" };
  const status = promoStatus(promo, input.now);
  if (status === "upcoming") return { ...blank, fail: "upcoming" };
  if (status !== "active") return { ...blank, fail: "time" };
  if (promo.usageLimit > 0 && usedCount(promo, input.usage) >= promo.usageLimit) return { ...blank, fail: "usage" };
  const mine = input.customerUsage?.get(promo.id) ?? 0;
  if (promo.perCustomer > 0 && mine >= promo.perCustomer) return { ...blank, fail: "customer" };
  if (promo.couponCode && normalizeCoupon(promo.couponCode) !== normalizeCoupon(input.coupon)) return { ...blank, fail: "coupon" };
  if (promo.requiresClaim && !input.claimedIds.has(promo.id)) return { ...blank, fail: "claim" };
  if (eligible <= 0) return { ...blank, fail: "scope" };
  const min = whole(promo.minSpend);
  const reward = discountAmount(promo, min > 0 ? min : eligible);
  if (min > 0 && eligible < min) {
    const remain = min - eligible;
    return { ...blank, fail: "short", remain, reward, hint: hintText(promo, remain, reward) };
  }
  const discount = discountAmount(promo, eligible);
  const freeShipping = promo.freeShipping;
  if (discount <= 0 && !freeShipping) return { ...blank, fail: "none", discount: 0 };
  return { ...blank, discount, freeShipping };
}

function benefit(discount: number, freeShipping: boolean, baseShipping: number): number {
  return discount + (freeShipping ? baseShipping : 0);
}

function byPriority(a: Evaluation, b: Evaluation): number {
  if (b.promo.priority !== a.promo.priority) return b.promo.priority - a.promo.priority;
  if (b.discount !== a.discount) return b.discount - a.discount;
  return a.promo.id.localeCompare(b.promo.id);
}

function toApplied(evaluation: Evaluation, discount: number): QuoteApplied {
  return {
    id: evaluation.promo.id,
    name: evaluation.promo.name,
    code: evaluation.promo.couponCode,
    kind: evaluation.promo.kind,
    discount,
    freeShipping: evaluation.freeShipping,
    endsAt: evaluation.promo.endsAt,
  };
}

function pickBest(list: Evaluation[], baseShipping: number): Evaluation | null {
  if (!list.length) return null;
  return [...list].sort((a, b) => {
    const delta = benefit(b.discount, b.freeShipping, baseShipping) - benefit(a.discount, a.freeShipping, baseShipping);
    if (delta) return delta;
    if (b.promo.priority !== a.promo.priority) return b.promo.priority - a.promo.priority;
    const end = a.promo.endsAt.localeCompare(b.promo.endsAt);
    if (end) return end;
    return a.promo.id.localeCompare(b.promo.id);
  })[0];
}

function stackOf(list: Evaluation[], subtotal: number): QuoteApplied[] {
  const ordered = [...list].sort(byPriority);
  let room = subtotal;
  const applied: QuoteApplied[] = [];
  for (const evaluation of ordered) {
    const discount = Math.min(evaluation.discount, room);
    room -= discount;
    if (discount <= 0 && !evaluation.freeShipping) continue;
    applied.push(toApplied(evaluation, discount));
  }
  return applied;
}

function qualified(evaluation: Evaluation): boolean {
  return evaluation.fail === "none" && (evaluation.discount > 0 || evaluation.freeShipping);
}

export function quotePromos(input: QuoteInput): QuoteResult {
  const lines = input.lines
    .map((line) => ({ ...line, qty: whole(line.qty), unitPrice: whole(line.unitPrice) }))
    .filter((line) => line.qty > 0 && line.unitPrice >= 0);
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
  const baseShipping = shippingFor(subtotal, input.settings, input.fulfillment);
  const evaluations = input.promotions.map((promo) => evaluate(promo, input, lines));
  const ok = evaluations.filter(qualified);
  const best = pickBest(ok.filter((item) => item.promo.stacking !== "stack"), baseShipping);
  const stacked = stackOf(ok.filter((item) => item.promo.stacking === "stack"), subtotal);
  const bestBenefit = best ? benefit(best.discount, best.freeShipping, baseShipping) : -1;
  const stackDiscount = stacked.reduce((sum, item) => sum + item.discount, 0);
  const stackShipping = stacked.some((item) => item.freeShipping);
  const stackBenefit = stacked.length ? benefit(stackDiscount, stackShipping, baseShipping) : -1;
  let applied: QuoteApplied[] = [];
  if (stackBenefit > bestBenefit) applied = stacked;
  else if (best) applied = [toApplied(best, Math.min(best.discount, subtotal))];
  else applied = stacked;

  const discount = Math.min(subtotal, applied.reduce((sum, item) => sum + item.discount, 0));
  const freeShipping = applied.some((item) => item.freeShipping);
  const shipping = freeShipping ? 0 : baseShipping;
  const hints = evaluations
    .filter((item) => item.fail === "short" && item.hint)
    .sort((a, b) => a.remain - b.remain || b.promo.priority - a.promo.priority)
    .slice(0, 2)
    .map((item) => ({ promoId: item.promo.id, text: item.hint, remain: item.remain, reward: item.reward }));

  const byId = new Map(evaluations.map((item) => [item.promo.id, item]));
  const couponMessage = couponNote(input, byId, applied);
  const couponBlock = couponBlocks(input, byId, applied, couponMessage);
  const expectErrors = expectNote(input, byId, applied);
  const error = [couponBlock ? couponMessage : "", ...expectErrors].filter(Boolean).join("\n");

  return {
    subtotal,
    discount,
    shipping,
    baseShipping,
    total: Math.max(0, subtotal - discount + shipping),
    applied,
    hints,
    couponMessage,
    error,
  };
}

function couponNote(input: QuoteInput, byId: Map<string, Evaluation>, applied: QuoteApplied[]): string {
  const code = normalizeCoupon(input.coupon);
  if (!code) return "";
  const matches = input.promotions.filter((promo) => promo.couponCode && normalizeCoupon(promo.couponCode) === code);
  if (!matches.length) return "優惠代碼不正確";
  if (matches.some((promo) => applied.some((item) => item.id === promo.id))) return "";
  const evaluation = byId.get(matches[0].id);
  if (!evaluation) return "優惠代碼不正確";
  switch (evaluation.fail) {
    case "time":
    case "off":
      return evaluation.fail === "off" ? "優惠代碼已停用" : "優惠代碼已過期";
    case "upcoming":
      return "優惠代碼尚未開始";
    case "usage":
      return "優惠代碼已額滿";
    case "customer":
      return "此優惠代碼已達每位顧客的使用上限";
    case "claim":
      return "請先領取此優惠再使用代碼";
    case "short":
      return evaluation.hint || "尚未達到優惠代碼的消費門檻";
    case "scope":
      return "購物袋裡沒有此代碼適用的商品";
    default:
      return "已套用更優惠的活動，此代碼未重複折抵";
  }
}

function couponBlocks(input: QuoteInput, byId: Map<string, Evaluation>, applied: QuoteApplied[], message: string): boolean {
  if (!message) return false;
  const code = normalizeCoupon(input.coupon);
  const matches = input.promotions.filter((promo) => promo.couponCode && normalizeCoupon(promo.couponCode) === code);
  if (!matches.length) return true;
  if (matches.some((promo) => applied.some((item) => item.id === promo.id))) return false;
  const fail = byId.get(matches[0].id)?.fail;
  return fail !== "none";
}

function expectNote(input: QuoteInput, byId: Map<string, Evaluation>, applied: QuoteApplied[]): string[] {
  const errors: string[] = [];
  for (const id of input.expectIds ?? []) {
    if (!id || applied.some((item) => item.id === id)) continue;
    const promo = input.promotions.find((item) => item.id === id);
    const name = promo?.name || "活動";
    if (!promo || !promo.enabled || promoStatus(promo, input.now) === "ended" || promoStatus(promo, input.now) === "disabled") {
      errors.push(`優惠「${name}」已結束，請確認金額後再送出`);
      continue;
    }
    if (promoStatus(promo, input.now) === "upcoming") {
      errors.push(`優惠「${name}」尚未開始，請確認金額後再送出`);
      continue;
    }
    const fail = byId.get(id)?.fail;
    if (fail === "usage") errors.push(`優惠「${name}」已額滿，請確認金額後再送出`);
    else if (fail === "customer") errors.push(`優惠「${name}」已達使用上限，請確認金額後再送出`);
    else if (fail === "claim") errors.push(`請先領取優惠「${name}」再結帳`);
    else if (fail === "coupon") errors.push(`優惠「${name}」需要優惠代碼`);
    else if (fail === "short") errors.push(`尚未達到優惠「${name}」的消費門檻，請確認金額後再送出`);
    else if (fail === "scope") errors.push(`優惠「${name}」不適用於目前的商品，請確認金額後再送出`);
  }
  return errors;
}

export type CustomerKeys = { phone: string; email: string; lineUserId: string };

export function customerUses(uses: PromoUse[], promoId: string, who: CustomerKeys): number {
  return uses.filter((use) => !use.restored && use.promoId === promoId && sameCustomer(use, who)).length;
}

export function sameCustomer(use: Pick<PromoUse, "phone" | "email" | "lineUserId">, who: CustomerKeys): boolean {
  if (who.phone && use.phone && who.phone === use.phone) return true;
  if (who.email && use.email && who.email.toLowerCase() === use.email.toLowerCase()) return true;
  if (who.lineUserId && use.lineUserId && who.lineUserId === use.lineUserId) return true;
  return false;
}

export function usageMap(uses: PromoUse[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const use of uses) {
    if (use.restored) continue;
    map.set(use.promoId, (map.get(use.promoId) ?? 0) + 1);
  }
  return map;
}

export function customerUsageMap(uses: PromoUse[], who: CustomerKeys): Map<string, number> {
  const map = new Map<string, number>();
  for (const use of uses) {
    if (use.restored || !sameCustomer(use, who)) continue;
    map.set(use.promoId, (map.get(use.promoId) ?? 0) + 1);
  }
  return map;
}

export function claimedIdsFor(claims: { promoId: string; guestToken: string; lineUserId: string }[], guestToken: string, lineUserId: string): Set<string> {
  const ids = new Set<string>();
  for (const claim of claims) {
    if (guestToken && claim.guestToken && claim.guestToken === guestToken) ids.add(claim.promoId);
    if (lineUserId && claim.lineUserId && claim.lineUserId === lineUserId) ids.add(claim.promoId);
  }
  return ids;
}

export type ShippingSettings = Pick<Settings, "shippingFee" | "freeShippingThreshold" | "cvsShippingFee">;

export function quoteCart(
  promotions: Promotion[],
  uses: PromoUse[],
  claims: { promoId: string; guestToken: string; lineUserId: string }[],
  args: {
    now: number;
    lines: MoneyLine[];
    fulfillment: Fulfillment;
    settings: QuoteSettings;
    coupon?: string;
    guestToken?: string;
    lineUserId?: string;
    phone?: string;
    email?: string;
    expectIds?: string[];
  }
): QuoteResult {
  const who: CustomerKeys = {
    phone: args.phone ?? "",
    email: (args.email ?? "").trim().toLowerCase(),
    lineUserId: args.lineUserId ?? "",
  };
  return quotePromos({
    now: args.now,
    lines: args.lines,
    fulfillment: args.fulfillment,
    settings: args.settings,
    promotions,
    claimedIds: claimedIdsFor(claims, args.guestToken ?? "", who.lineUserId),
    coupon: args.coupon ?? "",
    usage: usageMap(uses),
    customerUsage: customerUsageMap(uses, who),
    expectIds: args.expectIds,
  });
}

export type DisplayDeal = {
  min: number;
  max: number;
  compare: number;
  badge: string;
  promoId: string;
  promoName: string;
  endsAt: string;
  startsAt: string;
  requiresClaim: boolean;
  freeShipping: boolean;
};

function presentQuote(unitPrice: number, product: Pick<Product, "id" | "category" | "categories" | "name" | "subtitle">, promos: Promotion[], settings: QuoteSettings, now: number): QuoteResult {
  return quotePromos({
    now,
    lines: [{ productId: product.id, qty: 1, unitPrice, categories: effectiveCategories(product) }],
    fulfillment: "delivery",
    settings,
    promotions: promos,
    claimedIds: new Set(promos.filter((promo) => promo.requiresClaim).map((promo) => promo.id)),
    coupon: "",
  });
}

export function unitDeal(product: Product, unitPrice: number, promos: Promotion[], settings: QuoteSettings, now: number): DisplayDeal | null {
  const quote = presentQuote(unitPrice, product, promos, settings, now);
  const winner = quote.applied[0];
  if (!winner) return null;
  const promo = promos.find((item) => item.id === winner.id);
  if (!promo) return null;
  const next = unitPrice - (quote.discount > 0 ? quote.discount : 0);
  if (next >= unitPrice && !winner.freeShipping) return null;
  return {
    min: next,
    max: next,
    compare: Math.max(product.comparePrice, unitPrice),
    badge: promoBadge(promo),
    promoId: promo.id,
    promoName: promo.name,
    endsAt: promo.endsAt,
    startsAt: promo.startsAt,
    requiresClaim: promo.requiresClaim,
    freeShipping: winner.freeShipping,
  };
}

/** Shelf price for one piece, using the same rules as checkout (delivery). Coupon-only promos stay hidden. */
export function displayDeal(product: Product, promos: Promotion[], settings: QuoteSettings, now: number): DisplayDeal | null {
  const { min, max } = priceRange(product);
  const low = presentQuote(min, product, promos, settings, now);
  const high = max === min ? low : presentQuote(max, product, promos, settings, now);
  const winner = low.applied[0];
  if (!winner) return null;
  const promo = promos.find((item) => item.id === winner.id);
  if (!promo) return null;
  const nextMin = min - (low.discount > 0 ? low.discount : 0);
  const nextMax = max - (high.discount > 0 ? high.discount : 0);
  if (nextMin >= min && !winner.freeShipping) return null;
  return {
    min: nextMin,
    max: Math.max(nextMin, nextMax),
    compare: Math.max(product.comparePrice, min),
    badge: promoBadge(promo),
    promoId: promo.id,
    promoName: promo.name,
    endsAt: promo.endsAt,
    startsAt: promo.startsAt,
    requiresClaim: promo.requiresClaim,
    freeShipping: winner.freeShipping,
  };
}

export function pricingSnapshot(promos: Promotion[], now: number): Promotion[] {
  return promos
    .filter((promo) => promo.enabled && (promoStatus(promo, now) === "active" || promoStatus(promo, now) === "upcoming"))
    .map((promo) => ({ ...promo, couponCode: promo.couponCode ? "\u0001" : "" }));
}

function byBanner(a: Promotion, b: Promotion): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  return a.endsAt.localeCompare(b.endsAt);
}

export function siteBanners(promos: Promotion[], now: number): Promotion[] {
  const site = promos.filter((promo) => promo.scope === "site" && promo.enabled);
  const active = site.filter((promo) => promoStatus(promo, now) === "active").sort(byBanner);
  const upcoming = site.filter((promo) => promoStatus(promo, now) === "upcoming").sort((a, b) => a.startsAt.localeCompare(b.startsAt) || b.priority - a.priority);
  const out: Promotion[] = [];
  if (active[0]) out.push(active[0]);
  if (upcoming[0]) out.push(upcoming[0]);
  return out;
}

export function scopedBanner(promos: Promotion[], scope: Exclude<PromoScope, "site">, key: string, now: number): Promotion | null {
  const list = promos.filter((promo) => promo.enabled && promo.scope === scope && (scope === "product" ? promo.productId === key : promo.category === key));
  const active = list.filter((promo) => promoStatus(promo, now) === "active").sort(byBanner);
  if (active[0]) return active[0];
  const upcoming = list.filter((promo) => promoStatus(promo, now) === "upcoming").sort((a, b) => a.startsAt.localeCompare(b.startsAt) || b.priority - a.priority);
  return upcoming[0] ?? null;
}

export type PromoDraft = {
  name: string;
  banner: string;
  enabled: boolean;
  scope: string;
  productId: string;
  category: string;
  kind: string;
  value: number;
  minSpend: number;
  maxDiscount: number;
  freeShipping: boolean;
  startsAt: string;
  endsAt: string;
  usageLimit: number;
  perCustomer: number;
  requiresClaim: boolean;
  couponCode: string;
  stacking: string;
  priority: number;
};

export function sanitizePromotion(draft: PromoDraft, prev?: Pick<Promotion, "id" | "used" | "createdAt">, now = new Date().toISOString()): { ok: true; promo: Omit<Promotion, "id"> & { id: string } } | { ok: false; error: string } {
  const name = draft.name.trim().slice(0, 40);
  if (!name) return { ok: false, error: "請填寫活動名稱" };
  const scope: PromoScope = draft.scope === "product" || draft.scope === "category" ? draft.scope : "site";
  const productId = scope === "product" ? draft.productId.trim().slice(0, 80) : "";
  const category = scope === "category" ? draft.category.trim().slice(0, 40) : "";
  if (scope === "product" && !productId) return { ok: false, error: "請選擇商品" };
  if (scope === "category" && !category) return { ok: false, error: "請填寫分類名稱" };
  const kind: PromoKind = draft.kind === "amount" || draft.kind === "threshold" ? draft.kind : "percent";
  const value = whole(draft.value);
  const minSpend = whole(draft.minSpend);
  const maxDiscount = whole(draft.maxDiscount);
  const freeShipping = Boolean(draft.freeShipping);
  if (kind === "percent" && (value < 1 || value > 100)) return { ok: false, error: "百分比請填 1 到 100（20 表示八折）" };
  if (kind === "threshold" && minSpend < 1) return { ok: false, error: "滿額折請填寫滿額金額" };
  if (kind !== "percent" && value < 1 && !freeShipping) return { ok: false, error: "請填寫折抵金額，或勾選免運" };
  if (kind !== "percent" && value < 0) return { ok: false, error: "折抵金額不正確" };
  const startsAt = draft.startsAt;
  const endsAt = draft.endsAt;
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { ok: false, error: "請填寫開始與結束時間（台北時間）" };
  if (end <= start) return { ok: false, error: "結束時間必須晚於開始時間" };
  const couponCode = normalizeCoupon(draft.couponCode).slice(0, 20);
  if (couponCode && !/^[A-Z0-9-]{3,20}$/.test(couponCode)) return { ok: false, error: "優惠代碼請用 3–20 碼英數，可含減號" };
  const stacking: PromoStacking = draft.stacking === "stack" ? "stack" : "best";
  const priority = Math.max(-999, Math.min(999, Math.trunc(Number(draft.priority) || 0)));
  return {
    ok: true,
    promo: {
      id: prev?.id ?? "",
      name,
      banner: draft.banner.trim().slice(0, 80),
      enabled: Boolean(draft.enabled),
      scope,
      productId,
      category,
      kind,
      value,
      minSpend: kind === "threshold" ? minSpend : minSpend,
      maxDiscount,
      freeShipping,
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(end).toISOString(),
      usageLimit: whole(draft.usageLimit),
      used: prev?.used ?? 0,
      perCustomer: whole(draft.perCustomer),
      requiresClaim: Boolean(draft.requiresClaim),
      couponCode,
      stacking,
      priority,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    },
  };
}

const SCOPES = new Set<PromoScope>(["site", "product", "category"]);
const KINDS = new Set<PromoKind>(["percent", "amount", "threshold"]);

export function normalizePromotion(raw: Partial<Promotion> | null | undefined): Promotion | null {
  if (!raw || typeof raw.id !== "string" || !raw.id) return null;
  const scope = SCOPES.has(raw.scope as PromoScope) ? (raw.scope as PromoScope) : "site";
  const kind = KINDS.has(raw.kind as PromoKind) ? (raw.kind as PromoKind) : "percent";
  const startsAt = typeof raw.startsAt === "string" ? raw.startsAt : "";
  const endsAt = typeof raw.endsAt === "string" ? raw.endsAt : "";
  if (!Date.parse(startsAt) || !Date.parse(endsAt)) return null;
  return {
    id: raw.id.slice(0, 80),
    name: (raw.name ?? "").slice(0, 40) || "優惠",
    banner: (raw.banner ?? "").slice(0, 80),
    enabled: raw.enabled !== false,
    scope,
    productId: scope === "product" && typeof raw.productId === "string" ? raw.productId.slice(0, 80) : "",
    category: scope === "category" && typeof raw.category === "string" ? raw.category.slice(0, 40) : "",
    kind,
    value: whole(Number(raw.value)),
    minSpend: whole(Number(raw.minSpend)),
    maxDiscount: whole(Number(raw.maxDiscount)),
    freeShipping: Boolean(raw.freeShipping),
    startsAt,
    endsAt,
    usageLimit: whole(Number(raw.usageLimit)),
    used: whole(Number(raw.used)),
    perCustomer: whole(Number(raw.perCustomer)),
    requiresClaim: Boolean(raw.requiresClaim),
    couponCode: normalizeCoupon(typeof raw.couponCode === "string" ? raw.couponCode : "").slice(0, 20),
    stacking: raw.stacking === "stack" ? "stack" : "best",
    priority: Math.max(-999, Math.min(999, Math.trunc(Number(raw.priority) || 0))),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : startsAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : startsAt,
  };
}

export function normalizeApplied(list: unknown): AppliedPromo[] {
  if (!Array.isArray(list)) return [];
  const out: AppliedPromo[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<AppliedPromo>;
    if (typeof row.id !== "string" || !row.id || typeof row.name !== "string") continue;
    const kind = KINDS.has(row.kind as PromoKind) ? (row.kind as PromoKind) : "amount";
    out.push({
      id: row.id.slice(0, 80),
      name: row.name.slice(0, 40),
      code: typeof row.code === "string" ? row.code.slice(0, 20) : "",
      kind,
      discount: whole(Number(row.discount)),
      freeShipping: Boolean(row.freeShipping),
    });
  }
  return out.slice(0, 10);
}

export function restorePromoUses(promotions: Promotion[], uses: PromoUse[], orderId: string): void {
  for (const use of uses) {
    if (use.orderId !== orderId || use.restored) continue;
    use.restored = true;
    const promo = promotions.find((item) => item.id === use.promoId);
    if (promo) promo.used = Math.max(0, promo.used - 1);
  }
}

export function reinstatePromoUses(promotions: Promotion[], uses: PromoUse[], orderId: string): void {
  for (const use of uses) {
    if (use.orderId !== orderId || !use.restored) continue;
    use.restored = false;
    const promo = promotions.find((item) => item.id === use.promoId);
    if (promo) promo.used += 1;
  }
}
