"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  adminExists,
  createAdminSession,
  destroyAdminSession,
  hashPassword,
  isAuthenticated,
  verifyPassword,
} from "@/lib/auth";
import { getStore, mutate, StorageError } from "@/lib/store";
import { uid } from "@/lib/id";
import { changeOrder } from "@/lib/orders";
import { pushLine } from "@/lib/line";
import { OPEN_STATUSES, ORDER_STATUSES } from "@/lib/format";
import type { Detail, OrderStatus, Product, Variant } from "@/lib/types";

async function guard(): Promise<void> {
  if (!(await isAuthenticated())) redirect("/admin/login");
}

function str(form: FormData, key: string, max = 500): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function setupAdmin(_prev: string, form: FormData): Promise<string> {
  if (await adminExists()) redirect("/admin/login");
  const password = str(form, "password", 200);
  if (password.length < 8) return "密碼至少需要 8 個字元";
  if (password !== str(form, "confirm", 200)) return "兩次輸入的密碼不一致";
  try {
    await mutate((s) => {
      s.admin = { passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
    });
  } catch (err) {
    if (err instanceof StorageError) return err.message;
    throw err;
  }
  await createAdminSession();
  redirect("/admin");
}

export async function loginAdmin(_prev: string, form: FormData): Promise<string> {
  const { admin } = await getStore();
  if (!admin) redirect("/admin/setup");
  const ok = verifyPassword(str(form, "password", 200), admin.passwordHash);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 700));
    return "密碼不正確";
  }
  await createAdminSession();
  redirect("/admin");
}

export async function logoutAdmin(): Promise<void> {
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
  variants: { id?: string; color: string; hex: string; sku: string; stock: number; price: number | null }[];
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
  const variantsIn = (payload.variants ?? []).filter((v) => (v.color ?? "").trim());
  if (!variantsIn.length) return "請至少新增一個顏色款式";
  const colors = variantsIn.map((v) => v.color.trim().toLowerCase());
  if (new Set(colors).size !== colors.length) return "顏色名稱不可重複";

  const status = payload.status === "listed" ? "listed" : "unlisted";
  const now = new Date().toISOString();

  await mutate((s) => {
    const existing = id ? s.products.find((p) => p.id === id) : undefined;
    const variants: Variant[] = variantsIn.map((v) => ({
      id: v.id && existing?.variants.some((x) => x.id === v.id) ? v.id : uid("var"),
      color: v.color.trim().slice(0, 40),
      hex: /^#[0-9a-f]{6}$/i.test(v.hex ?? "") ? v.hex : "#d9d9d9",
      sku: (v.sku ?? "").trim().slice(0, 40),
      stock: Math.max(0, Math.floor(num(v.stock))),
      price: v.price !== null && num(v.price) > 0 ? Math.round(num(v.price)) : null,
    }));
    const data = {
      name: name.slice(0, 120),
      subtitle: (payload.subtitle ?? "").trim().slice(0, 160),
      category: (payload.category ?? "").trim().slice(0, 40),
      description: (payload.description ?? "").trim().slice(0, 4000),
      details: (payload.details ?? [])
        .map((d) => ({ label: (d.label ?? "").trim().slice(0, 40), value: (d.value ?? "").trim().slice(0, 300) }))
        .filter((d) => d.label && d.value),
      price,
      comparePrice: Math.max(0, Math.round(num(payload.comparePrice))),
      variants,
      photos: (payload.photos ?? []).filter((u) => typeof u === "string" && (u.startsWith("/media/") || u.startsWith("https://"))).slice(0, 12),
      status: status as Product["status"],
      featured: Boolean(payload.featured),
      updatedAt: now,
    };
    if (existing) Object.assign(existing, data);
    else s.products.push({ id: uid("prd"), sold: 0, createdAt: now, ...data });
  });

  revalidatePath("/", "layout");
  redirect("/admin/products?saved=1");
}

export async function toggleProduct(form: FormData): Promise<void> {
  await guard();
  const id = str(form, "id", 80);
  await mutate((s) => {
    const p = s.products.find((x) => x.id === id);
    if (p) {
      p.status = p.status === "listed" ? "unlisted" : "listed";
      p.updatedAt = new Date().toISOString();
    }
  });
  revalidatePath("/", "layout");
}

export async function deleteProduct(form: FormData): Promise<void> {
  await guard();
  const id = str(form, "id", 80);
  await mutate((s) => {
    s.products = s.products.filter((p) => p.id !== id);
  });
  revalidatePath("/", "layout");
}

export async function updateOrder(form: FormData): Promise<void> {
  await guard();
  const status = str(form, "status", 20) as OrderStatus;
  if (!ORDER_STATUSES.includes(status) || status === "cancelled") return;
  const id = str(form, "id", 80);
  await changeOrder(id, status, str(form, "internalNote", 500));
  revalidatePath("/admin", "layout");
  redirect(`/admin/orders/${id}?updated=1`);
}

export async function cancelOrder(form: FormData): Promise<void> {
  await guard();
  const id = str(form, "id", 80);
  const reason = str(form, "reason", 300);
  const { orders } = await getStore();
  const current = orders.find((o) => o.id === id);
  const note = [current?.internalNote, reason ? `取消原因：${reason}` : "賣家取消訂單"]
    .filter(Boolean)
    .join("\n");
  const result = await changeOrder(id, "cancelled", note);
  if (result.ok && result.order) {
    const lines = result.order.items.map((i) => `· ${i.name} ${i.color} × ${i.qty}`).join("\n");
    const who = result.customer
      ? `${result.customer.lineName}${result.customer.lineId ? `（${result.customer.lineId}）` : ""}`
      : "";
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
  await mutate((s) => {
    const c = s.customers.find((x) => x.id === id);
    if (c) c.note = note;
  });
  revalidatePath(`/admin/customers/${id}`);
}

export async function saveSettings(_prev: string, form: FormData): Promise<string> {
  await guard();
  await mutate((s) => {
    const st = s.settings;
    st.shopName = str(form, "shopName", 40) || "Radiant";
    st.tagline = str(form, "tagline", 120);
    st.announcement = str(form, "announcement", 160);
    st.shippingFee = Math.max(0, Math.round(num(str(form, "shippingFee", 10))));
    st.freeShippingThreshold = Math.max(0, Math.round(num(str(form, "freeShippingThreshold", 10))));
    st.paymentNote = str(form, "paymentNote", 600);
    st.lineOaName = str(form, "lineOaName", 60);
    st.lineOaBasicId = str(form, "lineOaBasicId", 60);
    st.lineOaUrl = str(form, "lineOaUrl", 200);
    st.notifyTo = str(form, "notifyTo", 80);
    st.loginChannelId = str(form, "loginChannelId", 40);
    const secret = str(form, "loginChannelSecret", 80);
    if (secret) st.loginChannelSecret = secret;
    const token = str(form, "messagingToken", 400);
    if (token) st.messagingToken = token;
    if (form.get("clearLoginSecret") === "on") st.loginChannelSecret = "";
    if (form.get("clearMessagingToken") === "on") st.messagingToken = "";
  });
  revalidatePath("/", "layout");
  return "已儲存";
}

export async function testPush(_prev: string): Promise<string> {
  await guard();
  const { settings } = await getStore();
  if (!settings.notifyTo) return "請先填入「店家通知對象」並儲存";
  const ok = await pushLine(settings.notifyTo, "Radiant 測試訊息：LINE 官方帳號已成功連接。");
  return ok ? "已送出測試訊息，請到 LINE 查看" : "推播失敗，請確認 Messaging API 權杖與通知對象 ID";
}
