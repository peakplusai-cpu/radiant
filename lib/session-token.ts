import { createHash, createHmac, timingSafeEqual } from "crypto";

export function sign(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

/** Length-independent compare so a short guess does not return early. */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

export function verifyAdminToken(token: string, secret: string, now = Date.now()): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [exp, nonce, mac] = parts;
  if (!exp || !nonce || !mac || !/^\d+$/.test(exp)) return false;
  if (Number(exp) <= now) return false;
  return safeEqual(mac, sign(secret, `${exp}.${nonce}`));
}
