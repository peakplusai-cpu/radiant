import { cookies, headers } from "next/headers";
import { getStore } from "./store";
import { safeEqual, sign } from "./auth";
import type { Settings } from "./types";

const IDENTITY_COOKIE = "radiant_line";
const STATE_COOKIE = "radiant_line_state";
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
  const c = lineConfig(settings);
  return Boolean(c.loginId && c.loginSecret);
}

export async function siteOrigin(): Promise<string> {
  if (process.env.SITE_ORIGIN) return process.env.SITE_ORIGIN.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function encode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

export async function setLineIdentity(identity: LineIdentity): Promise<void> {
  const { settings } = await getStore();
  const body = encode({ ...identity, exp: Date.now() + NINETY_DAYS });
  const jar = await cookies();
  jar.set(IDENTITY_COOKIE, `${body}.${sign(settings.secret, body)}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: NINETY_DAYS / 1000,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearLineIdentity(): Promise<void> {
  (await cookies()).delete(IDENTITY_COOKIE);
}

export async function getLineIdentity(): Promise<LineIdentity | null> {
  const token = (await cookies()).get(IDENTITY_COOKIE)?.value;
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
  (await cookies()).set(STATE_COOKIE, `${state}|${encodeURIComponent(next)}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function takeLineState(): Promise<{ state: string; next: string } | null> {
  const jar = await cookies();
  const raw = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  if (!raw) return null;
  const [state, next] = raw.split("|");
  return { state, next: decodeURIComponent(next ?? "") };
}

export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
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
