import { createHash } from "crypto";
import { getStore, mutate } from "./store";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

export function hashClient(ip: string, secret: string): string {
  return createHash("sha256").update(`radiant-login:${secret}:${ip}`).digest("hex").slice(0, 32);
}

export async function loginLockMessage(id: string, now = Date.now()): Promise<string | null> {
  const bucket = (await getStore()).loginBuckets.find((item) => item.id === id);
  if (!bucket || bucket.lockedUntil <= now) return null;
  const minutes = Math.max(1, Math.ceil((bucket.lockedUntil - now) / 60_000));
  return `嘗試次數過多，請 ${minutes} 分鐘後再試`;
}

export async function recordLoginFailure(id: string, now = Date.now()): Promise<void> {
  await mutate((store) => {
    const kept = store.loginBuckets.filter((item) => item.id !== id && (now - item.windowStart < WINDOW_MS || item.lockedUntil > now));
    const previous = store.loginBuckets.find((item) => item.id === id);
    const fresh = !previous || now - previous.windowStart >= WINDOW_MS;
    const failures = (fresh ? 0 : previous.failures) + 1;
    kept.push({
      id,
      failures,
      windowStart: fresh ? now : previous.windowStart,
      lockedUntil: failures >= MAX_FAILURES ? now + LOCK_MS : fresh ? 0 : previous.lockedUntil,
    });
    store.loginBuckets = kept.slice(-100);
  });
}

export async function clearLoginFailures(id: string): Promise<void> {
  await mutate((store) => {
    store.loginBuckets = store.loginBuckets.filter((item) => item.id !== id);
  });
}
