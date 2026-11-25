/** This shop's Supabase host. Used when SUPABASE_URL is not set at build time. */
export const SUPABASE_PROJECT_HOST = "wgrwwuyxhdyakchuiubi.supabase.co";

/** Storage and CSP host taken from SUPABASE_URL, otherwise this project's host. */
export function supabaseStorageHost(): string {
  const raw = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  try {
    const host = new URL(raw).hostname;
    if (/^[a-z0-9-]+\.supabase\.co$/i.test(host)) return host;
  } catch {
    /* fall through to the project host */
  }
  return SUPABASE_PROJECT_HOST;
}
