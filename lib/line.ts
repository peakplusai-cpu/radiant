import { cookies, headers } from "next/headers";
import { getStore } from "./store";
import { safeEqual, sign } from "./session-token";
import { LINE_COOKIE, LINE_STATE_COOKIE, clearedCookie, cookieFlags } from "./cookie-flags";
import { cleanPersonName } from "./phone";
import { publicSiteUrl } from "./site";
import type { Settings } from "./types";

const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;

export type LineIdentity = { userId: string; name: string };

export type LineConfig = {
  loginId: string;
  loginSecret: string;
  messagingToken: string;
  notifyTo: string;
};

export function lineConfig(settings: Settings): LineConfig {
  return {
    loginId: settings.loginChannelId || process.env.LINE_CHANNEL_ID || "",
    loginSecret: settings.loginChannelSecret || process.env.LINE_CHANNEL_SECRET || "",
    messagingToken: settings.messagingToken || process.env.LINE_MESSAGING_TOKEN || "",
    notifyTo: settings.notifyTo,
  };
}

export function lineLoginEnabled(settings: Settings): boolean {
  const config = lineConfig(settings);
  return Boolean(config.loginId && config.loginSecret);
}

/**
 * Production redirects use the configured site URL only.
 * The Host header is not trusted, so it cannot turn the LINE callback into an open redirect.
 */
export async function siteOrigin(): Promise<string> {
  if (process.env.NODE_ENV === "production") return publicSiteUrl();
  const host = ((await headers()).get("host") ?? "").split(",")[0]?.trim() ?? "";
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `http://${host}`;
  return publicSiteUrl();
}

function encode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

export async function setLineIdentity(identity: LineIdentity): Promise<void> {
  const { settings } = await getStore();
  const name = cleanPersonName(identity.name) ?? "";
  const body = encode({ userId: identity.userId.slice(0, 80), name, exp: Date.now() + NINETY_DAYS });
  (await cookies()).set(LINE_COOKIE, `${body}.${sign(settings.secret, body)}`, cookieFlags(NINETY_DAYS / 1000));
}

export async function clearLineIdentity(): Promise<void> {
  (await cookies()).set(LINE_COOKIE, "", clearedCookie());
}

export async function getLineIdentity(): Promise<LineIdentity | null> {
  const token = (await cookies()).get(LINE_COOKIE)?.value;
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const { settings } = await getStore();
  if (!safeEqual(mac, sign(settings.secret, body))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      userId?: string;
      name?: string;
      exp?: number;
    };
    if (!data.userId || !data.exp || data.exp < Date.now()) return null;
    return { userId: data.userId, name: data.name ?? "" };
  } catch {
    return null;
  }
}

export async function setLineState(state: string, next: string): Promise<void> {
  (await cookies()).set(LINE_STATE_COOKIE, `${state}|${encodeURIComponent(next)}`, cookieFlags(600));
}

export async function takeLineState(): Promise<{ state: string; next: string } | null> {
  const jar = await cookies();
  const raw = jar.get(LINE_STATE_COOKIE)?.value;
  jar.set(LINE_STATE_COOKIE, "", clearedCookie());
  if (!raw) return null;
  const [state, next] = raw.split("|");
  if (!state) return null;
  return { state, next: decodeURIComponent(next ?? "") };
}

/** Relative path only. Rejects protocol-relative and backslash tricks. */
export function safeNext(next: string | null | undefined): string {
  if (!next || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return "/";
  try {
    const url = new URL(next, "https://radiant.invalid");
    if (url.origin !== "https://radiant.invalid") return "/";
    if (!url.pathname.startsWith("/") || url.pathname.startsWith("//")) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export async function pushLine(to: string, text: string): Promise<boolean> {
  const { settings } = await getStore();
  const { messagingToken } = lineConfig(settings);
  if (!messagingToken || !to) return false;
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${messagingToken}` },
      body: JSON.stringify({ to, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
