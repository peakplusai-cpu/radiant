import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { randomBytes } from "crypto";
import type { Customer, Order, OrderItem, Product, Settings, Store } from "./types";
import { supabaseAdmin, supabaseConfigured, supabaseUrl } from "./supabase";
import { sanitizePickupPoints } from "./pickup";
import { sanitizeWall } from "./wall";
import { migrateProduct } from "./variants";
import { DEFAULT_FREE_SHIPPING, DEFAULT_SHIPPING_FEE } from "./pricing";

if (typeof window !== "undefined") {
  throw new Error("lib/store.ts is server-only");
}

function storePath(): string {
  return process.env.RADIANT_DATA_FILE || join(process.cwd(), "data", "store.json");
}

const TABLE = "radiant_store";
const MAX_RETRIES = 12;

function defaultSettings(): Settings {
  return {
    secret: randomBytes(32).toString("hex"),
    shopName: "Radiant",
    tagline: "",
    announcement: "",
    shippingFee: DEFAULT_SHIPPING_FEE,
    freeShippingThreshold: DEFAULT_FREE_SHIPPING,
    paymentNote: "送出訂單後，我們會透過 LINE 與您確認並提供付款方式。",
    lineOaName: "",
    lineOaBasicId: "",
    lineOaUrl: "",
    loginChannelId: "",
    loginChannelSecret: "",
    messagingToken: "",
    notifyTo: "",
    pickupPoints: [],
  };
}

function normalizeItem(item: Partial<OrderItem>): OrderItem {
  return {
    ...(item as OrderItem),
    size: typeof item.size === "string" ? item.size : "",
    color: item.color ?? "",
    hex: item.hex ?? "",
  };
}

function normalizeOrder(order: Partial<Order>): Order {
  return {
    ...(order as Order),
    fulfillment: order.fulfillment === "pickup" ? "pickup" : "delivery",
    pickupPointId: typeof order.pickupPointId === "string" ? order.pickupPointId : "",
    pickupPointName: typeof order.pickupPointName === "string" ? order.pickupPointName : "",
    items: (order.items ?? []).map(normalizeItem),
  };
}

function normalizeCustomer(customer: Partial<Customer>): Customer {
  return { ...(customer as Customer), phone: typeof customer.phone === "string" ? customer.phone : "" };
}

function normalize(parsed: Partial<Store>): Store {
  const defaults = defaultSettings();
  const settings = {
    ...defaults,
    ...(parsed.settings ?? {}),
    pickupPoints: sanitizePickupPoints(parsed.settings?.pickupPoints),
  };
  if (!settings.secret) settings.secret = defaults.secret;
  return {
    admin: parsed.admin ?? null,
    settings,
    products: (parsed.products ?? []).map((product) => migrateProduct(product as Product)),
    customers: (parsed.customers ?? []).map(normalizeCustomer),
    orders: (parsed.orders ?? []).map(normalizeOrder),
    wallPhotos: sanitizeWall(parsed.wallPhotos),
    idempotency: (parsed.idempotency ?? []).slice(-200),
    loginBuckets: (parsed.loginBuckets ?? []).slice(-100),
  };
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

function persistFile(store: Store): void {
  if (process.env.VERCEL) {
    throw new StorageError("Vercel 無法儲存資料。請在此專案設定 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY。");
  }
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
  renameSync(tmp, path);
}

function readFile(): Store {
  const path = storePath();
  if (!existsSync(path)) {
    const fresh = normalize({});
    if (!isBuildPhase() && !process.env.VERCEL) {
      try {
        persistFile(fresh);
      } catch {
        /* a read-only build can continue with the in-memory defaults */
      }
    }
    return fresh;
  }
  return normalize(JSON.parse(readFileSync(path, "utf8")) as Partial<Store>);
}

type Row = { data: Partial<Store>; version: number };

async function readRow(): Promise<{ store: Store; version: number; fresh: boolean }> {
  const db = supabaseAdmin();
  const { data, error } = await db.from(TABLE).select("data, version").eq("id", 1).maybeSingle();
  if (error) throw new Error(`Supabase read failed: ${error.message}`);
  if (!data) {
    const { error: insErr } = await db.from(TABLE).upsert({ id: 1, data: {}, version: 0 }, { onConflict: "id", ignoreDuplicates: true });
    if (insErr) throw new Error(`Supabase init failed: ${insErr.message}`);
    return readRow();
  }
  const row = data as Row;
  const fresh = !row.data || Object.keys(row.data).length === 0 || !(row.data.settings && row.data.settings.secret);
  return { store: normalize(row.data ?? {}), version: Number(row.version), fresh };
}

async function writeRow(store: Store, expected: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from(TABLE)
    .update({ data: store, version: expected + 1, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .eq("version", expected)
    .select("version");
  if (error) throw new Error(`Supabase write failed: ${error.message}`);
  return Array.isArray(data) && data.length === 1;
}

async function supabaseGet(): Promise<Store> {
  const first = await readRow();
  if (!first.fresh) return first.store;
  if (await writeRow(first.store, first.version)) return first.store;
  return (await readRow()).store;
}

async function supabaseMutate<T>(fn: (store: Store) => T | Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { store, version } = await readRow();
    const result = await fn(store);
    if (await writeRow(store, version)) {
      afterWrite();
      return result;
    }
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 60 * (attempt + 1)));
  }
  throw new Error("系統忙碌，請稍後再試");
}

function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

function afterWrite(): void {
  if (!process.env.NEXT_RUNTIME) return;
  void import("next/cache")
    .then(({ revalidateTag }) => {
      revalidateTag("catalog");
    })
    .catch(() => undefined);
}

async function readSupabaseCached(): Promise<Store> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const response = await fetch(`${supabaseUrl()}/rest/v1/${TABLE}?id=eq.1&select=data`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    next: { revalidate: 120, tags: ["catalog"] },
  });
  if (!response.ok) throw new Error(`Supabase catalog read failed: ${response.status}`);
  const rows = (await response.json()) as { data?: Partial<Store> }[];
  return normalize(rows[0]?.data ?? {});
}

export async function getStore(): Promise<Store> {
  if (supabaseConfigured()) {
    try {
      return await supabaseGet();
    } catch (err) {
      if (isBuildPhase()) return normalize({});
      throw err;
    }
  }
  if (isBuildPhase()) return normalize({});
  return readFile();
}

/** Public catalog. Cached for two minutes; admin saves and new orders clear the tag. */
export async function getCatalogStore(): Promise<Store> {
  if (!supabaseConfigured()) {
    if (isBuildPhase()) return normalize({});
    return readFile();
  }
  try {
    return await readSupabaseCached();
  } catch (err) {
    if (isBuildPhase()) return normalize({});
    throw err;
  }
}

const g = globalThis as { __radiantChain?: Promise<unknown> };

export function mutate<T>(fn: (store: Store) => T | Promise<T>): Promise<T> {
  if (supabaseConfigured()) return supabaseMutate(fn);
  const prev = g.__radiantChain ?? Promise.resolve();
  const run = prev.then(async () => {
    const draft = readFile();
    const result = await fn(draft);
    persistFile(draft);
    afterWrite();
    return result;
  });
  g.__radiantChain = run.catch(() => undefined);
  return run;
}
