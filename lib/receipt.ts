import { cookies } from "next/headers";
import { RECEIPT_COOKIE, clearedCookie, cookieFlags } from "./cookie-flags";
import { getStore } from "./store";
import { safeEqual, sign } from "./session-token";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const MAX_GRANTS = 8;

type Grant = { code: string; exp: number };

function encode(grants: Grant[], secret: string): string {
  const body = Buffer.from(JSON.stringify(grants)).toString("base64url");
  return `${body}.${sign(secret, body)}`;
}

function decode(token: string, secret: string): Grant[] {
  const [body, mac] = token.split(".");
  if (!body || !mac || !safeEqual(mac, sign(secret, body))) return [];
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Grant[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((grant) => grant && typeof grant.code === "string" && typeof grant.exp === "number" && grant.exp > Date.now());
  } catch {
    return [];
  }
}

export async function grantReceipt(code: string): Promise<void> {
  const { settings } = await getStore();
  const jar = await cookies();
  const current = decode(jar.get(RECEIPT_COOKIE)?.value ?? "", settings.secret);
  const next = [{ code, exp: Date.now() + THIRTY_DAYS }, ...current.filter((grant) => grant.code !== code)].slice(0, MAX_GRANTS);
  jar.set(RECEIPT_COOKIE, encode(next, settings.secret), cookieFlags(THIRTY_DAYS / 1000));
}

export async function hasReceiptGrant(code: string): Promise<boolean> {
  const { settings } = await getStore();
  const token = (await cookies()).get(RECEIPT_COOKIE)?.value ?? "";
  return decode(token, settings.secret).some((grant) => grant.code === code);
}

export async function clearReceiptGrant(): Promise<void> {
  (await cookies()).set(RECEIPT_COOKIE, "", clearedCookie());
}
