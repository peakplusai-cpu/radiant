import { verifyAdminToken } from "./session-token";

export type AdminDecision = "allow" | "login" | "setup" | "desk";

export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function adminAccessDecision(input: {
  pathname: string;
  token: string | undefined;
  secret: string;
  hasAdmin: boolean;
  now?: number;
}): AdminDecision {
  const { pathname, token, secret, hasAdmin } = input;
  const authed = Boolean(token && secret && verifyAdminToken(token, secret, input.now));
  if (pathname === "/admin/login") return authed ? "desk" : "allow";
  if (pathname === "/admin/setup") return hasAdmin ? "login" : "allow";
  if (!isAdminPath(pathname)) return "allow";
  if (authed) return "allow";
  return hasAdmin ? "login" : "setup";
}
