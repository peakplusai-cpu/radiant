"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertActionOrigin, createAdminSession, destroyAdminSession, isAuthenticated } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { getStore, mutate, StorageError } from "@/lib/store";
import { uid } from "@/lib/id";
import { changeOrder } from "@/lib/orders";
import { pushLine } from "@/lib/line";
import { OPEN_STATUSES, ORDER_STATUSES } from "@/lib/format";
import { sanitizePickupPoints } from "@/lib/pickup";
import { sanitizeWall } from "@/lib/wall";
import { splitCategoryInput } from "@/lib/categories";
import { clientIp } from "@/lib/http";
import { clearLoginFailures, hashClient, loginLockMessage, recordLoginFailure } from "@/lib/login-guard";
import { randomBase32, totpUri, verifyTotp } from "@/lib/totp";
import { resolveHex } from "@/lib/colors";
import { variantLabel } from "@/lib/variants";
import type { Detail, OrderStatus, Product, Variant } from "@/lib/types";

async function guard(): Promise<void> {
  await assertActionOrigin();
  if (!(await isAuthenticated())) redirect("/admin/login");
}

function str(form: FormData, key: string, max = 500): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function clientKey(): Promise<string> {
  const { settings } = await getStore();
  return hashClient(clientIp(await headers()), settings.secret);
}

export async function setupAdmin(_prev: string, form: FormData): Promise<string> {
  await assertActionOrigin();
  if ((await getStore()).admin) redirect("/admin/login");
  const password = str(form, "password", 200);
  if (password.length < 8) return "密碼至少需要 8 個字元";
  if (password !== str(form, "confirm", 200)) return "兩次輸入的密碼不一致";
  const key = await clientKey();
  const locked = await loginLockMessage(key);
  if (locked) return locked;
  try {
    await mutate((store) => {
      if (store.admin) throw new Error("SETUP_EXISTS");
      store.admin = { passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
    });
  } catch (err) {
    if (err instanceof Error && err.message === "SETUP_EXISTS") redirect("/admin/login");
    if (err instanceof StorageError) return err.message;
    throw err;
  }
  await createAdminSession();
  redirect("/admin");
}

export async function loginAdmin(_prev: string, form: FormData): Promise<string> {
  await assertActionOrigin();
  const { admin } = await getStore();
  if (!admin) redirect("/admin/setup");
  const key = await clientKey();
  const locked = await loginLockMessage(key);
  if (locked) return locked;
  const ok = verifyPassword(str(form, "password", 200), admin.passwordHash);
  if (!ok) {
    await recordLoginFailure(key);
    return "密碼不正確";
  }
  if (admin.totpSecret) {
    const code = str(form, "code", 12);
    if (!code) return "請輸入六位數驗證碼";
    if (!verifyTotp(admin.totpSecret, code)) {
      await recordLoginFailure(key);
      return "驗證碼不正確";
    }
  }
  await clearLoginFailures(key);
  await createAdminSession();
  redirect("/admin");
}

export async function logoutAdmin(): Promise<void> {
  await assertActionOrigin();
  await destroyAdminSession();
  redirect("/admin/login");
}

type ProductPayload = {
  name: string;
  subtitle: string;
  category: string;
  description: string;
  price: number;
  comparePrice: number;
  status: "listed" | "unlisted";
  featured: boolean;
  photos: string[];
  details: Detail[];
  variants: { id?: string; color: string; size?: string; hex: string; sku: string; stock: number; price: number | null }[];
};

export async function saveProduct(_prev: string, form: FormData): Promise<string> {
  await guard();
  const id = str(form, "id", 80);
  let payload: ProductPayload;
  try {
    payload = JSON.parse(str(form, "payload", 200_000)) as ProductPayload;
  } catch {
    return "資料格式錯誤，請重新整理後再試";
  }

  const name = (payload.name ?? "").trim();
  if (!name) return "請輸入商品名稱";
  const price = Math.round(num(payload.price));
  if (price <= 0) return "請設定大於 0 的售價";
  const variantsIn = (payload.variants ?? []).filter((variant) => (variant.color ?? "").trim());
  if (!variantsIn.length) return "請至少新增一個顏色與尺寸";
  const groups = new Map<string, string[]>();
  for (const variant of variantsIn) {
    const color = variant.color.trim().toLowerCase();
    const size = (variant.size ?? "").trim().toUpperCase();
    const list = groups.get(color) ?? [];
    list.push(size);
    groups.set(color, list);
  }
  for (const sizes of groups.values()) {
    if (sizes.some(Boolean) && sizes.some((size) => !size)) return "同一顏色請全部填寫尺寸，或只留均碼";
    if (new Set(sizes).size !== sizes.length) return "同一顏色的尺寸不可重複";
  }

  const status = payload.status === "listed" ? "listed" : "unlisted";
  const now = new Date().toISOString();
  const cats = splitCategoryInput(payload.category ?? "");

  await mutate((store) => {
    const existing = id ? store.products.find((product) => product.id === id) : undefined;
    const variants: Variant[] = variantsIn.map((variant) => ({
      id: variant.id && existing?.variants.some((item) => item.id === variant.id) ? variant.id : uid("var"),
      color: variant.color.trim().slice(0, 40),
      size: (variant.size ?? "").trim().toUpperCase().slice(0, 12),
      hex: resolveHex(variant.color, variant.hex),
      sku: (variant.sku ?? "").trim().slice(0, 40),
      stock: Math.max(0, Math.floor(num(variant.stock))),
      price: variant.price !== null && num(variant.price) > 0 ? Math.round(num(variant.price)) : null,
    }));
    const data = {
      name: name.slice(0, 120),
      subtitle: (payload.subtitle ?? "").trim().slice(0, 160),
      category: cats.category.slice(0, 40),
      categories: cats.categories.map((item) => item.slice(0, 40)),
      description: (payload.description ?? "").trim().slice(0, 4000),
      details: (payload.details ?? [])
        .map((detail) => ({ label: (detail.label ?? "").trim().slice(0, 40), value: (detail.value ?? "").trim().slice(0, 300) }))
        .filter((detail) => detail.label && detail.value),
      price,
      comparePrice: Math.max(0, Math.round(num(payload.comparePrice))),
      variants,
      photos: (payload.photos ?? []).filter((url) => typeof url === "string" && (url.startsWith("/media/") || url.startsWith("https://"))).slice(0, 12),
      status: status as Product["status"],
      featured: Boolean(payload.featured),
      sizeStockEstimated: false,
      updatedAt: now,
    };
    if (existing) Object.assign(existing, data);
    else store.products.push({ id: uid("prd"), sold: 0, createdAt: now, ...data });
  });

  revalidatePath("/", "layout");
  redirect("/admin/products?saved=1");
}

export async function toggleProduct(form: FormData): Promise<void> {
  await guard();
  const id = str(form, "id", 80);
  await mutate((store) => {
    const product = store.products.find((item) => item.id === id);
    if (product) {
      product.status = product.status === "listed" ? "unlisted" : "listed";
      product.updatedAt = new Date().toISOString();
    }
  });
  revalidatePath("/", "layout");
}

export async function deleteProduct(form: FormData): Promise<void> {
  await guard();
  const id = str(form, "id", 80);
  await mutate((store) => {
    store.products = store.products.filter((product) => product.id !== id);
  });
  revalidatePath("/", "layout");
}

export async function updateOrder(form: FormData): Promise<void> {
  await guard();
  const status = str(form, "status", 20) as OrderStatus;
  if (!ORDER_STATUSES.includes(status) || status === "cancelled") return;
  const id = str(form, "id", 80);
  const result = await changeOrder(id, status, str(form, "internalNote", 500));
  revalidatePath("/admin", "layout");
  redirect(`/admin/orders/${id}?${result.ok ? "updated=1" : "error=1"}`);
}

export async function cancelOrder(form: FormData): Promise<void> {
  await guard();
  const id = str(form, "id", 80);
  const reason = str(form, "reason", 300);
  const current = (await getStore()).orders.find((order) => order.id === id);
  const note = [current?.internalNote, reason ? `取消原因：${reason}` : "賣家取消訂單"].filter(Boolean).join("\n");
  const result = await changeOrder(id, "cancelled", note);
  if (result.ok && result.order) {
    const lines = result.order.items.map((item) => `· ${item.name} ${variantLabel(item.color, item.size)} × ${item.qty}`).join("\n");
    const who = result.customer ? `${result.customer.lineName}${result.customer.lineId ? `（${result.customer.lineId}）` : ""}` : "";
    const { settings } = await getStore();
    if (settings.notifyTo) {
      void pushLine(settings.notifyTo, `訂單 ${result.order.code} 已取消\n${who}\n${lines}${reason ? `\n原因：${reason}` : ""}`);
    }
    if (result.customer?.lineUserId) {
      void pushLine(
        result.customer.lineUserId,
        `您的 Radiant 訂單 ${result.order.code} 已取消。\n${lines}${reason ? `\n${reason}` : ""}\n庫存已釋出，歡迎再選購。`
      );
    }
  }
  revalidatePath("/", "layout");
  revalidatePath("/admin", "layout");
  redirect(`/admin/orders/${id}?cancelled=1`);
}

export async function shipAllForCustomer(form: FormData): Promise<void> {
  await guard();
  const customerId = str(form, "customerId", 80);
  const { orders } = await getStore();
  for (const order of orders) {
    if (order.customerId === customerId && OPEN_STATUSES.includes(order.status)) {
      await changeOrder(order.id, "shipped", order.internalNote);
    }
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/customers/${customerId}?shipped=1`);
}

export async function saveCustomerNote(form: FormData): Promise<void> {
  await guard();
  const id = str(form, "id", 80);
  const note = str(form, "note", 500);
  await mutate((store) => {
    const customer = store.customers.find((item) => item.id === id);
    if (customer) customer.note = note;
  });
  revalidatePath(`/admin/customers/${id}`);
}

export async function saveSettings(_prev: string, form: FormData): Promise<string> {
  await guard();
  let pickupPoints: unknown = [];
  try {
    pickupPoints = JSON.parse(str(form, "pickupPoints", 40_000) || "[]");
  } catch {
    return "自取點資料格式不正確";
  }
  await mutate((store) => {
    const settings = store.settings;
    settings.shopName = str(form, "shopName", 40) || "Radiant";
    settings.tagline = str(form, "tagline", 120);
    settings.announcement = str(form, "announcement", 160);
    settings.shippingFee = Math.max(0, Math.round(num(str(form, "shippingFee", 10))));
    settings.freeShippingThreshold = Math.max(0, Math.round(num(str(form, "freeShippingThreshold", 10))));
    settings.paymentNote = str(form, "paymentNote", 600);
    settings.lineOaName = str(form, "lineOaName", 60);
    settings.lineOaBasicId = str(form, "lineOaBasicId", 60);
    const lineUrl = str(form, "lineOaUrl", 200);
    settings.lineOaUrl = /^https:\/\//i.test(lineUrl) ? lineUrl : "";
    settings.notifyTo = str(form, "notifyTo", 80);
    settings.loginChannelId = str(form, "loginChannelId", 40);
    const secret = str(form, "loginChannelSecret", 80);
    if (secret) settings.loginChannelSecret = secret;
    const token = str(form, "messagingToken", 400);
    if (token) settings.messagingToken = token;
    if (form.get("clearLoginSecret") === "on") settings.loginChannelSecret = "";
    if (form.get("clearMessagingToken") === "on") settings.messagingToken = "";
    settings.pickupPoints = sanitizePickupPoints(pickupPoints);
  });
  revalidatePath("/", "layout");
  return "已儲存";
}

export async function saveWall(_prev: string, form: FormData): Promise<string> {
  await guard();
  let photos;
  try {
    photos = JSON.parse(str(form, "photos", 40_000) || "[]");
  } catch {
    return "資料格式不正確";
  }
  try {
    await mutate((store) => {
      store.wallPhotos = sanitizeWall(photos);
    });
  } catch (err) {
    if (err instanceof StorageError) return err.message;
    throw err;
  }
  revalidatePath("/", "layout");
  revalidatePath("/admin/wall");
  return "已儲存";
}

export async function testPush(_prev: string): Promise<string> {
  await guard();
  const { settings } = await getStore();
  if (!settings.notifyTo) return "請先填入「店家通知對象」並儲存";
  const ok = await pushLine(settings.notifyTo, "Radiant 測試訊息：LINE 官方帳號已成功連接。");
  return ok ? "已送出測試訊息，請到 LINE 查看" : "推播失敗，請確認 Messaging API 權杖與通知對象 ID";
}

export async function beginTotp(): Promise<string> {
  await guard();
  const secret = randomBase32();
  await mutate((store) => {
    if (!store.admin) return;
    if (store.admin.totpSecret) return;
    store.admin.totpPending = secret;
  });
  const admin = (await getStore()).admin;
  if (admin?.totpSecret) return "雙因素驗證已啟用";
  if (!admin?.totpPending) return "無法開始設定";
  return `PENDING\n${admin.totpPending}\n${totpUri(admin.totpPending)}`;
}

export async function confirmTotp(_prev: string, form: FormData): Promise<string> {
  await guard();
  const code = str(form, "code", 12);
  const admin = (await getStore()).admin;
  if (!admin?.totpPending) return "請先產生驗證金鑰";
  if (!verifyTotp(admin.totpPending, code)) return "驗證碼不正確";
  await mutate((store) => {
    if (!store.admin?.totpPending) return;
    if (!verifyTotp(store.admin.totpPending, code)) return;
    store.admin.totpSecret = store.admin.totpPending;
    store.admin.totpPending = undefined;
  });
  return "已啟用雙因素驗證";
}

export async function disableTotp(_prev: string, form: FormData): Promise<string> {
  await guard();
  const admin = (await getStore()).admin;
  if (!admin) redirect("/admin/setup");
  if (!verifyPassword(str(form, "password", 200), admin.passwordHash)) return "密碼不正確";
  await mutate((store) => {
    if (!store.admin) return;
    store.admin.totpSecret = undefined;
    store.admin.totpPending = undefined;
  });
  return "已關閉雙因素驗證";
}
