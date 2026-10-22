import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { randomBytes } from "crypto";
import type { Settings, Store } from "./types";
import { supabaseAdmin, supabaseConfigured } from "./supabase";

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
  };
}

function normalize(parsed: Partial<Store>): Store {
  return {
    admin: parsed.admin ?? null,
    settings: { ...defaultSettings(), ...(parsed.settings ?? {}) },
    products: parsed.products ?? [],
    customers: parsed.customers ?? [],
    orders: parsed.orders ?? [],
  };
}

// ---------- local JSON file (development / single server with a disk) ----------

function persistFile(store: Store): void {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  const tmp = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
  renameSync(tmp, STORE_PATH);
}

function readFile(): Store {
  if (!existsSync(STORE_PATH)) {
    const fresh = normalize({});
    persistFile(fresh);
    return fresh;
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

export async function getStore(): Promise<Store> {
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
