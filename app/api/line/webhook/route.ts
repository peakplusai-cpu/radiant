import { lineConfig } from "@/lib/line";
import { isLineTarget, messagingChannelSecret, parseNotifyTargets, verifyLineSignature } from "@/lib/line-notify";
import { clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { getStore, mutate } from "@/lib/store";
import type { PendingNotify } from "@/lib/types";

export const runtime = "nodejs";

const BIND = "綁定通知";

type Bind = { id: string; kind: PendingNotify["kind"]; replyToken: string };

type Source = { type?: string; userId?: string; groupId?: string; roomId?: string };

function targetOf(source: Source | undefined): { id: string; kind: PendingNotify["kind"] } | null {
  if (!source) return null;
  if (source.type === "group" && source.groupId && isLineTarget(source.groupId)) return { id: source.groupId, kind: "group" };
  if (source.type === "room" && source.roomId && isLineTarget(source.roomId)) return { id: source.roomId, kind: "room" };
  if (source.userId && isLineTarget(source.userId)) return { id: source.userId, kind: "user" };
  return null;
}

function bindsIn(events: unknown): Bind[] {
  if (!Array.isArray(events)) return [];
  const out: Bind[] = [];
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const row = event as { type?: string; replyToken?: string; source?: Source; message?: { type?: string; text?: string } };
    if (row.type !== "message" || row.message?.type !== "text") continue;
    if ((row.message.text ?? "").trim() !== BIND) continue;
    const target = targetOf(row.source);
    const replyToken = typeof row.replyToken === "string" ? row.replyToken.slice(0, 80) : "";
    if (target) out.push({ ...target, replyToken });
  }
  return out;
}

async function replyLine(token: string, replyToken: string, text: string): Promise<void> {
  if (!token || !replyToken) return;
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ replyToken, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) console.error("line reply failed", res.status);
  } catch {
    console.error("line reply failed");
  }
}

/**
 * LINE Messaging API webhook. Verifies X-Line-Signature, then records a staff
 * user or group that sends 綁定通知 so the shop can approve it in settings.
 * A bad signature is rejected. Saving or replying never echoes the channel token.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`line-webhook:${clientIp(request.headers)}`, 60, 60_000);
  if (!limit.ok) return new Response("retry", { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const raw = await request.text();
  if (raw.length > 100_000) return new Response("too large", { status: 413 });

  const { settings } = await getStore();
  if (!verifyLineSignature(raw, request.headers.get("x-line-signature"), messagingChannelSecret(settings))) {
    return new Response("invalid", { status: 401 });
  }

  let events: unknown;
  try {
    events = (JSON.parse(raw) as { events?: unknown }).events;
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const binds = bindsIn(events);
  let replies: { token: string; text: string }[] = [];
  if (binds.length) {
    try {
      replies = await mutate((store) => {
        const targets = new Set(parseNotifyTargets(store.settings.notifyTo));
        const pending = [...(store.settings.pendingNotifies ?? [])];
        const notes: { token: string; text: string }[] = [];
        for (const bind of binds) {
          if (targets.has(bind.id)) {
            if (bind.replyToken) notes.push({ token: bind.replyToken, text: "這個對話已經是訂單通知對象，不需要再核准。" });
            continue;
          }
          if (!pending.some((item) => item.id === bind.id)) {
            pending.push({ id: bind.id, kind: bind.kind, at: new Date().toISOString() });
          }
          if (bind.replyToken) {
            notes.push({
              token: bind.replyToken,
              text: "已收到綁定申請。請到 Radiant 後台「設定」核准這個通知對象後，訂單通知才會送到這裡。",
            });
          }
        }
        store.settings.pendingNotifies = pending.slice(-20);
        return notes;
      });
    } catch {
      console.error("line webhook save failed");
      return new Response("retry", { status: 500 });
    }
  }

  const { messagingToken } = lineConfig(settings);
  await Promise.all(replies.map((reply) => replyLine(messagingToken, reply.token, reply.text)));
  return new Response("OK", { status: 200 });
}
