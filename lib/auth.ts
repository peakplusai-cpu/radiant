import { cookies } from "next/headers";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { getStore } from "./store";

const COOKIE = "radiant_admin";
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== test.length) return false;
  return timingSafeEqual(expected, test);
}

export function sign(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function createAdminSession(): Promise<void> {
  const { settings } = await getStore();
  const payload = `${Date.now() + THIRTY_DAYS}.${randomBytes(16).toString("hex")}`;
  const jar = await cookies();
  jar.set(COOKIE, `${payload}.${sign(settings.secret, payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS / 1000,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function destroyAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [exp, nonce, mac] = parts;
  const { settings } = await getStore();
  if (!safeEqual(mac, sign(settings.secret, `${exp}.${nonce}`))) return false;
  return Number(exp) > Date.now();
}

export async function adminExists(): Promise<boolean> {
  return Boolean((await getStore()).admin);
}
