import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { randomBytes } from "crypto";
import type { Order, Settings, Store } from "./types";
import { supabaseAdmin, supabaseConfigured } from "./supabase";
import { sanitizePickupPoints } from "./pickup";
import { sanitizeWall } from "./wall";

const STORE_PATH = process.env.RADIANT_DATA_FILE || join(process.cwd(), "data", "store.json");
const TABLE = "radiant_store";
const MAX_RETRIES = 12;

function defaultSettings(): Settings {
  return {
    secret: randomBytes(32).toString("hex"),
    shopName: "Radiant",
    tagline: "",
    announcement: "",
    shippingFee: 80,
    freeShippingThreshold: 1500,
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

function normalizeOrder(order: Partial<Order>): Order {
  return {
    ...(order as Order),
    fulfillment: order.fulfillment === "pickup" ? "pickup" : "delivery",
    pickupPointId: typeof order.pickupPointId === "string" ? order.pickupPointId : "",
    pickupPointName: typeof order.pickupPointName === "string" ? order.pickupPointName : "",
  };
}

function normalize(parsed: Partial<Store>): Store {
  return {
    admin: parsed.admin ?? null,
    settings: {
      ...defaultSettings(),
      ...(parsed.settings ?? {}),
      pickupPoints: sanitizePickupPoints(parsed.settings?.pickupPoints),
    },
    products: parsed.products ?? [],
    customers: parsed.customers ?? [],
    orders: (parsed.orders ?? []).map(normalizeOrder),
    wallPhotos: sanitizeWall(parsed.wallPhotos),
  };
}

// ---------- local JSON file (development / single server with a disk) ----------

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
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  const tmp = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
  renameSync(tmp, STORE_PATH);
}

function readFile(): Store {
  if (!existsSync(STORE_PATH)) {
    return normalize({});
  }
  return normalize(JSON.parse(readFileSync(STORE_PATH, "utf8")) as Partial<Store>);
}

// ---------- Supabase (Vercel / serverless) ----------
// The whole store is one jsonb row. Writes use compare-and-swap on `version`,
// so concurrent serverless instances can never overwrite each other.

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
  // First run: persist generated defaults (including the signing secret) exactly once.
  if (await writeRow(first.store, first.version)) return first.store;
  return (await readRow()).store;
}

async function supabaseMutate<T>(fn: (store: Store) => T | Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { store, version } = await readRow();
    const result = await fn(store);
    if (await writeRow(store, version)) return result;
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 60 * (attempt + 1)));
  }
  throw new Error("系統忙碌，請稍後再試");
}

// ---------- public API ----------

function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

export async function getStore(): Promise<Store> {
  // `next build` prerenders /_not-found; never talk to Supabase in that phase.
  if (isBuildPhase()) return normalize({});
  if (supabaseConfigured()) return supabaseGet();
  return readFile();
}

const g = globalThis as { __radiantChain?: Promise<unknown> };

/**
 * Applies a change to a fresh copy of the store and saves it atomically.
 * `fn` may run more than once on contention, so it must only touch the store it is given.
 */
export function mutate<T>(fn: (store: Store) => T | Promise<T>): Promise<T> {
  if (supabaseConfigured()) return supabaseMutate(fn);
  const prev = g.__radiantChain ?? Promise.resolve();
  const run = prev.then(async () => {
    const draft = readFile();
    const result = await fn(draft);
    persistFile(draft);
    return result;
  });
  g.__radiantChain = run.catch(() => undefined);
  return run;
}
