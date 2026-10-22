import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function supabaseUrl(): string {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

export function supabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!supabaseConfigured()) throw new Error("Supabase is not configured");
  client ??= createClient(supabaseUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  return client;
}

export const UPLOAD_BUCKET = "radiant-uploads";
