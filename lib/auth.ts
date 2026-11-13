import { cookies, headers } from "next/headers";
import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { getStore } from "./store";
import { ADMIN_COOKIE, ADMIN_SESSION_MS, clearedCookie, cookieFlags } from "./cookie-flags";
import { sameOrigin } from "./http";
import { hashPassword, verifyPassword } from "./password";
import { safeEqual, sign, verifyAdminToken } from "./session-token";

export { hashPassword, verifyPassword, safeEqual, sign };

if (typeof window !== "undefined") {
  throw new Error("lib/auth.ts is server-only");
}

export async function createAdminSession(): Promise<void> {
  const { settings } = await getStore();
  const payload = `${Date.now() + ADMIN_SESSION_MS}.${randomBytes(16).toString("hex")}`;
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, `${payload}.${sign(settings.secret, payload)}`, cookieFlags(ADMIN_SESSION_MS / 1000));
}

export async function destroyAdminSession(): Promise<void> {
  (await cookies()).set(ADMIN_COOKIE, "", clearedCookie());
}

export async function isAuthenticated(): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  const { settings } = await getStore();
  return verifyAdminToken(token, settings.secret);
}

export async function adminExists(): Promise<boolean> {
  return Boolean((await getStore()).admin);
}

export async function requireAdmin(): Promise<void> {
  if (!(await adminExists())) redirect("/admin/setup");
  if (!(await isAuthenticated())) redirect("/admin/login");
}

export async function assertActionOrigin(): Promise<void> {
  if (!sameOrigin(await headers())) redirect("/admin/login");
}

export async function getAdminStore() {
  await requireAdmin();
  return getStore();
}
